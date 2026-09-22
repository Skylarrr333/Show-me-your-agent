import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { z } from "zod";
import { DEMO, SessionSchema, type Session } from "../schemas";
import { readRunStream } from "../lib/run-stream";
import { check_constraints } from "../tools";

const checks: string[] = [];
class ProbeFailure extends Error {}
function check(ok: unknown, label: string): asserts ok {
  if (!ok) throw new ProbeFailure(label);
  checks.push(label);
}
const StatusSchema = z.object({
  model: z.object({ mode: z.enum(["demo", "gateway", "deepseek", "bedrock"]), configured: z.boolean() }),
  data: z.object({ mode: z.enum(["synthetic", "file"]), ready: z.boolean() }),
  release: z.object({ commit: z.string().nullable() }),
});
const SessionEnvelope = z.object({ session: SessionSchema });
const RefreshEnvelope = SessionEnvelope.extend({ changed: z.boolean() });
const StateSchema = z.object({
  origin: z.string().url(), cookie: z.string().regex(/^propmatch_session=[a-f0-9-]+$/),
  id: z.string().uuid(), version: z.number().int(), profileHash: z.string(), status: z.string(),
}).strict();
const hashProfile = (s: Session) => createHash("sha256").update(JSON.stringify(s.profile)).digest("hex");

async function main() {
  const url = new URL(process.env.DEPLOY_CHECK_URL ?? "");
  check(url.protocol === "https:" && !url.username && !url.password &&
    !url.search && !url.hash && url.pathname === "/", "HTTPS origin without embedded credentials");
  const username = process.env.DEPLOY_CHECK_USER;
  const password = process.env.DEPLOY_CHECK_PASSWORD;
  const expectedCommit = process.env.DEPLOY_EXPECTED_COMMIT;
  check(username && password && !username.includes(":"), "Private access credentials supplied");
  check(expectedCommit && /^[a-f0-9]{40}$/.test(expectedCommit), "Expected Git commit supplied");
  const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
  let cookie = "";
  async function request(endpoint: string, body?: unknown, auth = authorization) {
    const response = await fetch(new URL(endpoint, url), {
      method: body === undefined ? "GET" : "POST", redirect: "error",
      signal: AbortSignal.timeout(body === undefined ? 30000 : 150000),
      headers: { ...(auth ? { Authorization: auth } : {}), ...(cookie ? { Cookie: cookie } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json", Origin: url.origin, "Sec-Fetch-Site": "same-origin" }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    return response;
  }
  for (const endpoint of ["/", "/api/status", "/api/session", "/debug"]) {
    const response = await request(endpoint, undefined, "");
    check(response.status === 401, `Unauthenticated ${endpoint} blocked`);
    await response.body?.cancel();
  }
  const rejected = await request("/api/status", undefined, `Basic ${Buffer.from("invalid:invalid").toString("base64")}`);
  check(rejected.status === 401, "Incorrect access password blocked");
  await rejected.body?.cancel();
  const page = await request("/");
  check(page.ok && (await page.text()).includes("PropMatch"), "Authenticated app page available");
  const health = await request("/api/status");
  check(health.ok, "Authenticated status endpoint available");
  const status = StatusSchema.parse(await health.json());
  check(status.release?.commit === expectedCommit, "Running release matches expected Git commit");
  check(status.model?.configured === true && status.data?.ready === true, "Model configuration and data ready");
  const statePath = process.env.DEPLOY_PROBE_STATE ?? ".propmatch-data/deployment-probe.json";
  if (process.argv.includes("--resume")) {
    const saved = StateSchema.parse(JSON.parse(await readFile(statePath, "utf8")));
    check(saved.origin === url.origin, "Persistence probe belongs to this origin");
    cookie = saved.cookie;
    const response = await request("/api/session");
    check(response.ok, "Stored session endpoint available after restart");
    const s = SessionEnvelope.parse(await response.json()).session;
    check(s.id === saved.id && s.version === saved.version && s.status === saved.status &&
      hashProfile(s) === saved.profileHash, "Buyer state survives container restart");
  } else {
    const created = await request("/api/session", {});
    check(created.ok, "Session creation succeeds through HTTPS proxy");
    const setCookie = created.headers.get("set-cookie") ?? "";
    check(/;\s*Secure(?:;|$)/i.test(setCookie) && /;\s*HttpOnly(?:;|$)/i.test(setCookie) &&
      /;\s*SameSite=Strict(?:;|$)/i.test(setCookie), "Session cookie is Secure, HttpOnly and SameSite=Strict");
    cookie = setCookie.split(";")[0];
    let s = SessionEnvelope.parse(await created.json()).session;
    if (process.argv.includes("--exercise") || process.argv.includes("--live")) {
      check(status.data.mode === "synthetic", "Workflow probe uses disclosed synthetic inventory");
      check(status.model.mode === "demo" || process.argv.includes("--live"), "Paid model use explicitly selected");
      if (process.argv.includes("--live")) check(status.model.mode !== "demo", "Live probe uses a real model provider");
      const run = await request("/api/run", { message: DEMO, version: s.version });
      check(run.ok && run.body, "Agent stream starts");
      s = await readRunStream(run.body, () => {});
      check(s.status === "waiting" && s.shortlist.length > 0, "Agent produces a reviewable shortlist");
      check(s.recommendations.every(r => check_constraints({ property: r.property, profile: s.profile, commutes: r.commutes }).passed), "All recommendations satisfy hard constraints");
      if (process.argv.includes("--live")) check(s.trace.some(t => t.summary === `${status.model.mode}_model_call()`), "Successful live model call recorded");
      const originalProfile = hashProfile(s);
      const approved = await request("/api/action", { action: "approve", version: s.version });
      check(approved.ok, "Human approval endpoint succeeds");
      s = SessionEnvelope.parse(await approved.json()).session;
      check(s.status === "approved", "Human approval recorded");
      for (const kind of ["withdraw", "raise-price"]) {
        const oldTop = s.shortlist[0];
        const refreshed = await request("/api/refresh", { version: s.version, demoEvent: { kind, propertyId: oldTop } });
        check(refreshed.ok, `${kind} refresh endpoint succeeds`);
        const result = RefreshEnvelope.parse(await refreshed.json());
        s = result.session;
        check(result.changed && s.status === "waiting" && !s.shortlist.includes(oldTop) &&
          hashProfile(s) === originalProfile, `${kind} rebuilds shortlist, preserves profile and requires approval`);
        check(!s.trace.some(t => t.runId === s.lastRunId && t.summary.endsWith("_model_call()")), `${kind} refresh uses no model call`);
      }
    }
    const restored = await request("/api/session");
    check(restored.ok, "Session reload succeeds");
    const persisted = SessionEnvelope.parse(await restored.json()).session;
    check(persisted.id === s.id && persisted.version === s.version && hashProfile(persisted) === hashProfile(s), "Current buyer state persisted");
    await mkdir(path.dirname(statePath), { recursive: true, mode: 0o700 });
    await writeFile(statePath, JSON.stringify(StateSchema.parse({ origin: url.origin, cookie,
      id: s.id, version: s.version, profileHash: hashProfile(s), status: s.status })), { mode: 0o600 });
  }
  const report = { timestamp: new Date().toISOString(), status: "passed", url: url.origin,
    commit: expectedCommit, modelMode: status.model.mode, checks,
    scope: process.argv.includes("--resume") ? "Session persistence after an operator-triggered restart" :
      process.argv.includes("--live") ? "Real model, synthetic inventory, approval and listing-change workflow" :
      process.argv.includes("--exercise") ? "Deterministic demo workflow through HTTPS proxy" : "Access, release identity and session smoke test; no model call" };
  if (process.env.DEPLOY_REPORT_FILE) {
    await mkdir(path.dirname(process.env.DEPLOY_REPORT_FILE), { recursive: true });
    await writeFile(process.env.DEPLOY_REPORT_FILE, JSON.stringify(report, null, 2) + "\n");
  }
  console.log(JSON.stringify(report, null, 2));
}
main().catch((error: unknown) => {
  console.error(JSON.stringify({ status: "failed", passedChecks: checks,
    failedCheck: error instanceof ProbeFailure ? error.message : "Transport, configuration or response schema validation",
    error: "Inspect configuration and sanitized server logs. No credentials or session IDs are printed." }, null, 2));
  process.exitCode = 1;
});

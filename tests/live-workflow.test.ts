import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { newSession, runAgent } from "../agents/orchestrator";
import { humanAction } from "../agents/human";
import { refreshAgent } from "../agents/refresh";
import { verifyCurrentListings } from "../agents/verification";
import { DemoLLMProvider } from "../providers/demo-llm";
import { DeepSeekProvider } from "../providers/deepseek";
import { EvidenceDatasetSchema, EvidenceFileProvider, EvidenceUnavailableError } from "../providers/evidence";
import { DEMO, emptyProfile } from "../schemas";
import { properties } from "../providers/synthetic";
import { check_constraints } from "../tools";
import { lookup_market_comparables, marketMetadata } from "../tools/market";

test("DeepSeek uses real JSON API envelope, records usage, and fails closed on truncation/auth", async () => {
  const original = globalThis.fetch;
  const expected = await new DemoLLMProvider().parse(DEMO, emptyProfile());
  const llm = new DeepSeekProvider({ key: "test-only-key", endpoint: "https://api.deepseek.com", model: "deepseek-flash" });
  try {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), "https://api.deepseek.com/chat/completions");
      const body = JSON.parse(String(options?.body));
      assert.deepEqual(body.response_format, { type: "json_object" });
      assert.deepEqual(body.thinking, { type: "disabled" });
      assert.equal(body.stream, false);
      return Response.json({ choices: [{ message: { content: JSON.stringify(expected), reasoning_content: "must not be exposed" }, finish_reason: "stop" }], usage: { prompt_tokens: 20, completion_tokens: 10 } });
    };
    assert.equal((await llm.parse(DEMO, emptyProfile())).profile.budget.max, 1600000);
    const metrics = llm.drainMetrics();
    assert.equal(metrics[0].inputTokens, 20);
    assert(!JSON.stringify(metrics).includes("key"));
    globalThis.fetch = async () => Response.json({ choices: [{ message: { content: "{}" }, finish_reason: "length" }] });
    await assert.rejects(llm.parse(DEMO, emptyProfile()), /incomplete/);
    globalThis.fetch = async () => new Response("private upstream error", { status: 401 });
    await assert.rejects(llm.parse(DEMO, emptyProfile()), /HTTP 401/);
  } finally { globalThis.fetch = original; }
});

test("withdrawal and price change revoke approval, preserve buyer memory and stay session-local", async () => {
  const originalMode = process.env.LLM_MODE;
  process.env.LLM_MODE = "demo";
  try {
    const first = await runAgent(newSession(), DEMO);
    const approved = humanAction(first, { action: "approve", version: first.version });
    const top = approved.shortlist[0];
    const { session: updated, changed } = await refreshAgent(approved, { kind: "withdraw", propertyId: top });
    assert(changed);
    assert.equal(updated.status, "waiting");
    assert.deepEqual(updated.profile, approved.profile);
    assert(!updated.shortlist.includes(top));
    assert(updated.trace.some((t) => (t.data as { approvalRevoked?: boolean })?.approvalRevoked));
    assert.equal((await refreshAgent(updated)).changed, false);
    const raised = await refreshAgent(updated, { kind: "raise-price", propertyId: updated.shortlist[0] });
    assert(!raised.session.shortlist.includes(updated.shortlist[0]));
    await verifyCurrentListings(raised.session, raised.session.shortlist);
    const fresh = await runAgent(newSession(), DEMO);
    assert(fresh.shortlist.includes(top), "another session must retain untouched inventory");
    const rejected = humanAction(first, { action: "reject", propertyId: first.shortlist[1], version: first.version });
    const after = await refreshAgent(rejected, { kind: "withdraw", propertyId: rejected.shortlist[0] });
    assert(!after.session.recommendations.some((r) => r.property.id === first.shortlist[1]));
  } finally { if (originalMode === undefined) delete process.env.LLM_MODE; else process.env.LLM_MODE = originalMode; }
});

test("real evidence cannot invent quietness or certify unknown MRT; stale routes remain unknown", async () => {
  const dir = await mkdtemp(join(tmpdir(), "propmatch-evidence-"));
  try {
    const p = { ...properties[1], isSynthetic: false, quietScore: null, mrtWalkingMinutes: null,
      source: "Test fixture only", sourceUrl: "https://example.com/listing/1", sourceListingId: "1", checkedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), amenities: [] };
    const dataset = { schemaVersion: 1, label: "Test only", permission: "Owned artificial test fixture", properties: [p], routes: [] };
    assert(EvidenceDatasetSchema.safeParse(dataset).success);
    assert(!EvidenceDatasetSchema.safeParse({ ...dataset, properties: [{ ...p, quietScore: 99 }] }).success);
    const profile = emptyProfile();
    profile.transport.maxMrtWalkingMinutes = 5;
    assert(!check_constraints({ property: p, profile }).passed);
    assert(!check_constraints({ property: { ...p, checkedAt: "2020-01-01T00:00:00.000Z" }, profile: emptyProfile() }).passed);
    const filename = join(dir, "source.json");
    await writeFile(filename, JSON.stringify(dataset));
    const provider = new EvidenceFileProvider(filename);
    await assert.rejects(provider.route(p, "NUS", "transit"), EvidenceUnavailableError);
    await writeFile(filename, JSON.stringify({ ...dataset, properties: [{ ...p, availability: "unavailable" }] }));
    assert.equal((await provider.get(p.id))?.availability, "unavailable");
  } finally { await rm(dir, { recursive: true }); }
});

test("public historical evidence is real-source scoped, budget filtered, and never becomes inventory", async () => {
  const p = emptyProfile();
  p.budget.max = 800000;
  p.locations.preferredAreas = ["Clementi"];
  const evidence = lookup_market_comparables(p);
  assert(marketMetadata.count > 1000);
  assert(evidence.count > 0);
  assert(evidence.examples.every((r) => r.town === "CLEMENTI" && r.resalePrice <= 800000));
  assert(evidence.sourceUrl.startsWith("https://data.gov.sg/"));
  const s = await runAgent(newSession(), DEMO, () => {}, { llm: new DemoLLMProvider() });
  assert(s.marketEvidence);
  assert(s.recommendations.every((r) => r.property.isSynthetic));
});

test("Chinese numeric updates are independently anchored and preserve the rest of the brief", async () => {
  const llm = new DemoLLMProvider();
  const first = await runAgent(newSession(), "预算160万新币，两间卧室，不开车，在NUS和Raffles Place工作，喜欢安静和公园。", () => {}, { llm });
  assert.equal(first.status, "waiting");
  const updated = await runAgent(first, "预算提高到170万新币，地铁步行不超过五分钟。", () => {}, { llm });
  assert.equal(updated.status, "waiting");
  assert.equal(updated.profile.budget.max, 1700000);
  assert.equal(updated.profile.transport.maxMrtWalkingMinutes, 5);
  assert.deepEqual(updated.profile.commuteDestinations, first.profile.commuteDestinations);
});

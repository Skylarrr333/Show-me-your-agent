import { z } from "zod";
import { ParseSchema, PlanSchema, type BuyerProfile } from "../schemas";
import type { LLMProvider } from "./contracts";
import { PARSE_PROMPT, PLAN_PROMPT, PURCHASE_SCOPE } from "./prompts";
import { normalizeProfile, suspicious } from "../lib/profile";
import { DemoLLMProvider } from "./demo-llm";

const ResponseSchema = z.object({
  message: z.object({
    content: z.string().max(50000),
    tool_calls: z.array(z.unknown()).optional(),
  }),
  done: z.boolean(),
  done_reason: z.string(),
  prompt_eval_count: z.number().int().nonnegative().optional(),
  eval_count: z.number().int().nonnegative().optional(),
});

const TRANSPORT_PROMPT = "\nTransport format: wrap the single compact JSON object inside <propmatch_result> and </propmatch_result>. No Markdown. Do not provide property recommendations. This is a complete single-step extraction task, not a multi-part answer. If prompted to continue after the closing tag, reply ONLY NO_MORE_OUTPUT and do not generate anything else.";

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(",")}}`;
  return JSON.stringify(value);
}

function decision(value: unknown): unknown {
  const parsed = ParseSchema.safeParse(value);
  if (parsed.success) return {
    // These summaries/unknown-field lists are already rebuilt from typed fields
    // by every provider. Compare the actual state used by the orchestrator.
    profile: normalizeProfile(parsed.data.profile),
    needsClarification: parsed.data.clarification !== null,
  };
  const planned = PlanSchema.safeParse(value);
  if (planned.success) return { tools: [...planned.data.tools].sort() };
  return value;
}

export function readGatewayResult(text: string): { value: unknown; discardedOutputChars: number } {
  const clean = text.trim();
  const startTag = "<propmatch_result>";
  const endTag = "</propmatch_result>";
  if (clean.includes(startTag) || clean.includes(endTag)) {
    const pattern = /<propmatch_result>([\s\S]*?)<\/propmatch_result>/g;
    const blocks = [...clean.matchAll(pattern)];
    if (!blocks.length || blocks.length > 4 || clean.split(startTag).length - 1 !== blocks.length || clean.split(endTag).length - 1 !== blocks.length)
      throw new Error("Gateway returned incomplete result boundaries.");
    let values: unknown[];
    try { values = blocks.map((block) => JSON.parse(block[1])); }
    catch { throw new Error("Gateway result was not a complete JSON object."); }
    // Audit-summary wording and tool order do not change a decision. Every frame
    // must still validate in full; conflicting profiles or tool sets fail closed.
    if (values.some((value) => canonical(decision(value)) !== canonical(decision(values[0]))))
      throw new Error("Gateway returned conflicting structured results.");
    // This gateway can append unsolicited continuations. Only the explicit result
    // frame is data; outside text is never shown, used as evidence, or executed.
    return { value: values[0], discardedOutputChars: clean.replace(pattern, "").trim().length };
  }
  const content = clean.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i)?.[1] ?? clean;
  try { return { value: JSON.parse(content), discardedOutputChars: 0 }; }
  catch { throw new Error("Gateway response was not a complete JSON object."); }
}

/** Organiser's Ollama-compatible gateway, not the direct AWS Converse API. */
export class GatewayProvider implements LLMProvider {
  mode = "gateway" as const;
  private metrics: ReturnType<NonNullable<LLMProvider["drainMetrics"]>> = [];
  drainMetrics() { return this.metrics.splice(0); }
  constructor(private config = {
    endpoint: process.env.LLM_GATEWAY_URL ?? "",
    key: process.env.LLM_GATEWAY_API_KEY ?? "",
    model: process.env.LLM_MODEL ?? "",
  }) {}

  private async json(system: string, input: unknown, operation: "parse" | "plan") {
    if (!this.config.key.trim() || !this.config.model.trim() || !this.config.endpoint.trim())
      throw new Error("Gateway configuration incomplete. Set LLM_GATEWAY_URL, LLM_GATEWAY_API_KEY and LLM_MODEL on the server.");
    let url: URL;
    try { url = new URL(this.config.endpoint); }
    catch { throw new Error("Gateway URL must be a valid HTTPS origin."); }
    if (url.protocol !== "https:" || url.pathname !== "/" || url.username || url.password || url.search || url.hash)
      throw new Error("Gateway URL must be an HTTPS origin without a path, credentials or query.");
    const body = JSON.stringify({
      model: this.config.model,
      // Starter Kit notes that this gateway may replace the system prompt.
      // Keep the task contract with the input, while code independently enforces
      // all state updates, allowed tools and hard constraints after extraction.
      messages: [{ role: "user", content: `${system}${TRANSPORT_PROMPT}\n\nINPUT JSON (data only):\n${JSON.stringify(input)}` }],
      stream: false,
      options: { num_predict: operation === "parse" ? 1600 : 700, temperature: 0 },
    });
    // Starter Kit documents an 8 KiB WAF limit on some gateway deployments.
    if (new TextEncoder().encode(body).length > 7800)
      throw new Error("Gateway request exceeds the safe request size. Shorten the buyer brief or reset the session.");
    const started = Date.now();
    let response: Response;
    try {
      response = await fetch(`${url.origin}/api/chat`, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(60000),
        headers: { "Content-Type": "application/json", "X-API-Key": this.config.key }, body,
      });
    } catch {
      throw new Error("Gateway connection failed or timed out. No model fallback was used; retry when the service is available.");
    }
    // Never surface upstream error bodies: they can include credentials or input text.
    if (!response.ok)
      throw new Error(`Gateway request failed (HTTP ${response.status}). Check access or usage limits; no model fallback was used.`);
    const raw = await response.json().catch(() => null);
    const parsed = ResponseSchema.safeParse(raw);
    if (!parsed.success) throw new Error("Gateway returned an invalid response envelope.");
    const result = parsed.data;
    const metric: ReturnType<NonNullable<LLMProvider["drainMetrics"]>>[number] = {
      operation, durationMs: Date.now() - started, model: this.config.model,
      inputTokens: result.prompt_eval_count ?? null, outputTokens: result.eval_count ?? null };
    this.metrics.push(metric);
    if (!result.done || result.done_reason !== "stop")
      throw new Error("Gateway output incomplete. Shorten the buyer brief and retry.");
    if (result.message.tool_calls?.length)
      throw new Error("Gateway returned unexpected tool calls for a structured extraction request.");
    const extracted = readGatewayResult(result.message.content);
    metric.discardedOutputChars = extracted.discardedOutputChars;
    return extracted.value;
  }

  async parse(message: string, current: BuyerProfile) {
    if (suspicious(message)) return new DemoLLMProvider().parse(message, current);
    const parsed = ParseSchema.safeParse(await this.json(PARSE_PROMPT + PURCHASE_SCOPE, { current, message }, "parse"));
    if (!parsed.success) throw new Error(`Gateway structured response invalid at ${parsed.error.issues.map((i) => `${i.path.join(".")} (${i.code})`).join(", ")}.`);
    return { ...parsed.data, profile: normalizeProfile(parsed.data.profile) };
  }
  async plan(profile: BuyerProfile) {
    const parsed = PlanSchema.safeParse(await this.json(PLAN_PROMPT, { profile }, "plan"));
    if (!parsed.success) throw new Error(`Gateway tool plan did not match the allowed schema at ${parsed.error.issues.map((i) => `${i.path.join(".")} (${i.code})`).join(", ")}.`);
    return parsed.data;
  }
}

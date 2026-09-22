import { z } from "zod";
import { ParseSchema, PlanSchema, type BuyerProfile } from "../schemas";
import type { LLMProvider } from "./contracts";
import { PARSE_PROMPT, PLAN_PROMPT } from "./prompts";
import { normalizeProfile, suspicious } from "../lib/profile";
import { DemoLLMProvider } from "./demo-llm";
const ResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().max(50000) }), finish_reason: z.string() })).min(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }).optional(),
});
export class DeepSeekProvider implements LLMProvider {
  mode = "deepseek" as const;
  private metrics: NonNullable<ReturnType<NonNullable<LLMProvider["drainMetrics"]>>> = [];
  drainMetrics() { return this.metrics.splice(0); }
  constructor(private config = {
    key: process.env.DEEPSEEK_API_KEY ?? "",
    model: process.env.DEEPSEEK_MODEL || "deepseek-flash",
    endpoint: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com",
  }) {}
  private async json(system: string, input: unknown, operation: "parse" | "plan") {
    if (!this.config.key) throw new Error("DeepSeek configuration incomplete. Set DEEPSEEK_API_KEY in .env.local.");
    const url = new URL(this.config.endpoint);
    if (url.protocol !== "https:" || !["/", "/v1", "/v1/"].includes(url.pathname) || url.username || url.password || url.search || url.hash)
      throw new Error("DeepSeek endpoint must be an HTTPS origin with optional /v1 path.");
    const started = Date.now();
    const response = await fetch(`${this.config.endpoint.replace(/\/$/, "")}/chat/completions`, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(30000),
      headers: { Authorization: `Bearer ${this.config.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: this.config.model,
        messages: [{ role: "system", content: system }, { role: "user", content: JSON.stringify(input) }],
        response_format: { type: "json_object" }, thinking: { type: "disabled" },
        max_tokens: 2800, temperature: 0, stream: false,
      }),
    });
    if (!response.ok) throw new Error(`DeepSeek request failed (HTTP ${response.status}). Check API access and balance; no model fallback was used.`);
    const result = ResponseSchema.parse(await response.json());
    this.metrics.push({ operation, durationMs: Date.now() - started, model: this.config.model,
      inputTokens: result.usage?.prompt_tokens ?? null, outputTokens: result.usage?.completion_tokens ?? null });
    if (result.choices[0].finish_reason !== "stop") throw new Error("DeepSeek output incomplete; retry with a shorter buyer brief.");
    const content = result.choices[0].message.content.trim();
    if (!content) throw new Error("DeepSeek returned an empty JSON response.");
    return JSON.parse(content);
  }
  async parse(message: string, current: BuyerProfile) {
    if (suspicious(message)) return new DemoLLMProvider().parse(message, current);
    const parsed = ParseSchema.safeParse(await this.json(PARSE_PROMPT, { current, message }, "parse"));
    if (!parsed.success) throw new Error(`DeepSeek structured response invalid at ${parsed.error.issues.map((i) => `${i.path.join(".")} (${i.code})`).join(", ")}.`);
    const result = parsed.data;
    return { ...result, profile: normalizeProfile(result.profile) };
  }
  async plan(profile: BuyerProfile) {
    return PlanSchema.parse(await this.json(PLAN_PROMPT, { profile }, "plan"));
  }
}

import { HOME_PROMPT } from "./home-prompt";
import { BuyerProfile, ParseSchema, PlanSchema } from "../schemas";
import { LLMProvider } from "./contracts";
import { DemoLLMProvider } from "./demo-llm";
import { PARSE_PROMPT, PLAN_PROMPT } from "./prompts";
import { DeepSeekProvider } from "./deepseek";
import { GatewayProvider } from "./gateway";
import { resolveLLMMode } from "./config";
import { normalizeProfile, suspicious } from "../lib/profile";
/** AWS documented Converse REST contract, NOT an assumed hackathon gateway contract. */
export class BedrockProvider implements LLMProvider {
  mode = "bedrock" as const;
  private metrics: { operation: string; durationMs: number; inputTokens: number | null; outputTokens: number | null; model: string }[] = [];
  drainMetrics() { return this.metrics.splice(0); }
  constructor(
    private config = {
      endpoint: process.env.BEDROCK_ENDPOINT ?? "",
      key: process.env.AWS_BEARER_TOKEN_BEDROCK ?? "",
      model: process.env.BEDROCK_MODEL_ID ?? "",
      region: process.env.AWS_REGION ?? "ap-southeast-1",
    },
  ) {}
  private async json(system: string, input: unknown, operation: "parse" | "plan") {
    const started = Date.now();
    const { key, model, region } = this.config;
    if (!key || !model)
      throw new Error(
        "Bedrock configuration incomplete. Set AWS_BEARER_TOKEN_BEDROCK and BEDROCK_MODEL_ID.",
      );
    const base =
      this.config.endpoint || `https://bedrock-runtime.${region}.amazonaws.com`;
    const url = new URL(base);
    if (
      url.protocol !== "https:" ||
      url.pathname !== "/" ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error(
        "Bedrock endpoint must be an HTTPS origin without credentials or query.",
      );
    const response = await fetch(
      `${base.replace(/\/$/, "")}/model/${encodeURIComponent(model)}/converse`,
      {
        method: "POST",
        redirect: "error",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          system: [{ text: system }],
          messages: [
            { role: "user", content: [{ text: JSON.stringify(input) }] },
          ],
          inferenceConfig: { maxTokens: 2800, temperature: 0 },
        }),
        signal: AbortSignal.timeout(25000),
      },
    );
    if (!response.ok)
      throw new Error(
        `Bedrock request failed (HTTP ${response.status}); no state change committed.`,
      );
    const result = (await response.json()) as {
      output?: { message?: { content?: { text?: string }[] } };
      usage?: { inputTokens?: number; outputTokens?: number };
    };
    const count = (n: unknown) => typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : null;
    this.metrics.push({ operation, durationMs: Date.now() - started, model,
      inputTokens: count(result.usage?.inputTokens), outputTokens: count(result.usage?.outputTokens) });
    const text = (result.output?.message?.content ?? [])
      .map((x) => x.text ?? "")
      .join("");
    if (text.length > 50000)
      throw new Error("Model output exceeds size limit.");
    return JSON.parse(
      text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""),
    );
  }
  async home(input: unknown) { return this.json(HOME_PROMPT, input, "parse"); }
  async parse(message: string, current: BuyerProfile) {
    if (suspicious(message))
      return new DemoLLMProvider().parse(message, current);

    const r = ParseSchema.parse(await this.json(PARSE_PROMPT, { current, message }, "parse"));
    return { ...r, profile: normalizeProfile(r.profile) };
  }
  async plan(profile: BuyerProfile) {
    return PlanSchema.parse(
      await this.json(
        PLAN_PROMPT,
        { profile },
        "plan",
      ),
    );
  }
}
export function getLLM(): LLMProvider {
  const mode = resolveLLMMode();
  if (mode === "gateway") return new GatewayProvider();
  if (mode === "deepseek") return new DeepSeekProvider();
  if (mode === "bedrock") return new BedrockProvider();
  return new DemoLLMProvider();
}

import type { LLMProvider } from "./contracts";
type Environment = Record<string, string | undefined>;
export function resolveLLMMode(env: Environment = process.env): LLMProvider["mode"] {
  const mode = env.LLM_MODE || "auto";
  if (mode === "demo" || mode === "gateway" || mode === "deepseek" || mode === "bedrock") return mode;
  if (mode !== "auto") throw new Error("Unsupported LLM_MODE");
  if (env.LLM_GATEWAY_API_KEY?.trim()) return "gateway";
  if (env.DEEPSEEK_API_KEY?.trim()) return "deepseek";
  if (env.AWS_BEARER_TOKEN_BEDROCK?.trim()) return "bedrock";
  return "demo";
}
export function isLLMConfigured(mode: LLMProvider["mode"], env: Environment = process.env) {
  if (mode === "gateway") return !!(env.LLM_GATEWAY_API_KEY?.trim() && env.LLM_GATEWAY_URL?.trim() && env.LLM_MODEL?.trim());
  if (mode === "deepseek") return !!env.DEEPSEEK_API_KEY?.trim();
  if (mode === "bedrock") return !!(env.AWS_BEARER_TOKEN_BEDROCK?.trim() && env.BEDROCK_MODEL_ID?.trim());
  return true;
}

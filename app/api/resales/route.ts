import { body } from "../../../lib/request";
import { ResaleRequestSchema } from "../../../lib/resale-schema";
import { resaleMetadata, searchResales } from "../../../lib/resale-store";
import { interpretResaleFilters } from "../../../lib/resale-language";
import { resolveLLMMode, isLLMConfigured } from "../../../providers/config";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const info = await resaleMetadata(), mode = resolveLLMMode();
    return Response.json({ ...info, model: { mode, configured: isLLMConfigured(mode) } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "HDB dataset is not available. Import the Kaggle CSV into the local database first." }, { status: 503 });
  }
}
export async function POST(request: Request) {
  let input;
  try { input = ResaleRequestSchema.parse(await body(request)); }
  catch { return Response.json({ error: "Check the filter values, ranges and dates." }, { status: 400 }); }
  let info;
  try { info = await resaleMetadata(); }
  catch { return Response.json({ error: "HDB dataset is unavailable. Check the server import." }, { status: 503 }); }
  let interpreted;
  try { interpreted = await interpretResaleFilters(input.filters, input.message, info.towns); }
  catch (e) {
    const message = e instanceof Error ? e.message : "Could not interpret the search message.";
    // Provider adapters redact upstream response bodies and credentials.
    return Response.json({ error: message, canUseForm: true }, { status: 422 });
  }
  try { return Response.json({ ...await searchResales(interpreted.filters), warnings: interpreted.warnings, modelMode: interpreted.modelMode }, { headers: { "Cache-Control": "no-store" } }); }
  catch { return Response.json({ error: "Search could not complete. Try again or check the imported database." }, { status: 503 }); }
}

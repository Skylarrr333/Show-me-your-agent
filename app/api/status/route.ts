import { dataMode, readEvidenceFile } from "../../../providers/evidence";
import { marketMetadata } from "../../../tools/market";
import { resolveLLMMode, isLLMConfigured } from "../../../providers/config";
export const dynamic = "force-dynamic";
export async function GET() {
  let data: { mode: string; count: number; ready: boolean; note: string };
  try {
    const mode = dataMode();
    if (mode === "file") {
      const source = await readEvidenceFile(process.env.LISTING_DATA_FILE ?? "");
      data = { mode, count: source.properties.length, ready: true, note: "Imported source snapshots. Availability is checked against the supplied file, not polled from external listing sites." };
    } else data = { mode, count: 72, ready: true, note: "Fictional listings, routes and amenities." };
  } catch { data = { mode: "file", count: 0, ready: false, note: "Evidence file is missing or invalid. Check server configuration." }; }
  const mode = resolveLLMMode();
  return Response.json({ model: { mode,
    configured: isLLMConfigured(mode),
    note: "Configuration presence is not proof of a successful model call. See live evaluation." }, data, publicData: marketMetadata },
  { headers: { "Cache-Control": "no-store" } });
}

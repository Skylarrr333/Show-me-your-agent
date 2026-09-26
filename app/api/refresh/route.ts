import { body, session, errorResponse } from "../../../lib/http";
import { save } from "../../../lib/store";
import { refreshHomes } from "../../../agents/home-agent";
import { RefreshInput, refreshAgent } from "../../../agents/refresh";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const input = RefreshInput.parse(await body(request));
    const old = await session();
    if (!old) return Response.json({ error: "Session required" }, { status: 401 });
    if (old.version !== input.version) throw new Error("CONFLICT");
    const result = old.homeSearch ? await refreshHomes(old) : await refreshAgent(old, input.demoEvent);
    const updated = result.changed ? await save(result.session, old.version) : old;
    return Response.json({ session: updated, changed: result.changed, checkedAt: new Date().toISOString() });
  } catch (error) { return errorResponse(error); }
}

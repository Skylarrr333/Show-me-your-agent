import { body, session, errorResponse } from "../../../lib/http";
import { save } from "../../../lib/store";
import { ActionSchema, humanAction } from "../../../agents/human";
import { verifyCurrentListings } from "../../../agents/verification";
export async function POST(request: Request) {
  try {
    const i = ActionSchema.parse(await body(request));
    const s = await session();
    if (!s)
      return Response.json({ error: "Session required" }, { status: 401 });
    if (i.version !== s.version) throw new Error("CONFLICT");
    if (i.action === "approve") await verifyCurrentListings(s, s.shortlist);
    return Response.json({ session: await save(humanAction(s, i), s.version) });
  } catch (e) {
    return errorResponse(e);
  }
}

import { verifyCurrentListings } from "../../../agents/verification";
import { z } from "zod";
import { body, session, errorResponse } from "../../../lib/http";
import { compare_properties } from "../../../tools";
import { event } from "../../../agents/orchestrator";
import { save } from "../../../lib/store";
export async function POST(request: Request) {
  try {
    const i = z
      .object({
        propertyIds: z.array(z.string()).min(2).max(4),
        version: z.number().int(),
      })
      .strict()
      .parse(await body(request));
    const s = await session();
    if (!s)
      return Response.json({ error: "Session required" }, { status: 401 });
    if (!["waiting", "approved"].includes(s.status))
      throw new Error("No current recommendations to compare");
    if (i.propertyIds.some((id) => s.rejected.includes(id)))
      throw new Error("Rejected property");
    if (s.version !== i.version) throw new Error("CONFLICT");
    await verifyCurrentListings(s, i.propertyIds);
    const comparison = compare_properties({
      propertyIds: i.propertyIds,
      profile: s.profile,
      candidates: s.recommendations,
    });
    event(s, "TOOL", "compare_properties()", {
      parameters: { propertyIds: i.propertyIds },
      result: {
        lowestPriceId: comparison.lowestPriceId,
        fastestMrtId: comparison.fastestMrtId,
      },
    });
    return Response.json({ comparison, session: await save(s, s.version) });
  } catch (e) {
    return errorResponse(e);
  }
}

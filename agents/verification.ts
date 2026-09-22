import { PropertySchema, type Session } from "../schemas";
import { getDataProviders, dataRevision } from "../providers/evidence";
import type { ListingProvider } from "../providers/contracts";
import { check_constraints } from "../tools";

/** Re-read sources at the human decision boundary, before saving any action. */
export async function verifyCurrentListings(
  session: Session,
  ids: string[],
  provider?: ListingProvider,
) {
  if (!provider && session.dataRevision && session.dataRevision !== await dataRevision(session))
    throw new Error("Source changed; refresh before review.");
  const listings = provider ?? getDataProviders(session).listings;
  for (const id of ids) {
    const row = session.recommendations.find((r) => r.property.id === id);
    const current = PropertySchema.safeParse(await listings.get(id));
    if (
      !row ||
      session.rejected.includes(id) ||
      !current.success ||
      JSON.stringify(current.data) !== JSON.stringify(row.property) ||
      !check_constraints({
        property: current.data,
        profile: session.profile,
        commutes: row.commutes,
      }).passed
    ) {
      throw new Error("Listing changed; rerun before review.");
    }
  }
}

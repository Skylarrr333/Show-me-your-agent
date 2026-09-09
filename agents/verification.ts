import { PropertySchema, type Session } from '../schemas';
import { SyntheticListingProvider } from '../providers/synthetic';
import type { ListingProvider } from '../providers/contracts';
import { check_constraints } from '../tools';

/** Re-read sources at the human decision boundary, before saving any action. */
export async function verifyCurrentListings(session: Session, ids: string[], provider: ListingProvider = new SyntheticListingProvider()) {
  for (const id of ids) {
    const row = session.recommendations.find(r => r.property.id === id);
    const current = PropertySchema.safeParse(await provider.get(id));
    if (!row || session.rejected.includes(id) || !current.success ||
        JSON.stringify(current.data) !== JSON.stringify(row.property) ||
        !check_constraints({ property: current.data, profile: session.profile, commutes: row.commutes }).passed) {
      throw new Error('Listing changed; rerun before review.');
    }
  }
}

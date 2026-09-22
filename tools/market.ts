import { MarketEvidenceSchema } from "./market-schema";
import raw from "../data/hdb-transactions.json";
import type { BuyerProfile } from "../schemas";
export const marketMetadata = { sourceUrl: raw.sourceUrl, count: raw.records.length, months: raw.months,
  retrievedAt: raw.retrievedAt, sha256: raw.sha256, boundary: raw.boundary };
export function lookup_market_comparables(profile: BuyerProfile) {
  const towns = profile.locations.preferredAreas.map((a) => a.toUpperCase());
  const excluded = profile.locations.excludedAreas.map((a) => a.toUpperCase());
  const matches = raw.records.filter((r) =>
    (!towns.length || towns.includes(r.town)) && !excluded.includes(r.town) &&
    (profile.budget.max === null || r.resale_price <= profile.budget.max) &&
    (profile.budget.min === null || r.resale_price >= profile.budget.min) &&
    (profile.property.minSize === null || r.floor_area_sqm * 10.7639104167 >= profile.property.minSize) &&
    (profile.property.maxSize === null || r.floor_area_sqm * 10.7639104167 <= profile.property.maxSize),
  );
  const prices = matches.map((r) => r.resale_price).sort((a, b) => a - b);
  const middle = Math.floor(prices.length / 2);
  const median = !prices.length ? null : prices.length % 2 ? prices[middle] : (prices[middle - 1] + prices[middle]) / 2;
  const examples = [...matches].sort((a, b) => b.month.localeCompare(a.month) || b._id - a._id).slice(0, 5);
  return MarketEvidenceSchema.parse({ sourceUrl: raw.sourceUrl, retrievedAt: raw.retrievedAt, datasetSha256: raw.sha256,
    months: raw.months, count: matches.length, medianPrice: median, minPrice: prices[0] ?? null, maxPrice: prices.at(-1) ?? null,
    filterSummary: `HDB transactions; towns: ${towns.join(", ") || "all"}; exclusions: ${excluded.join(", ") || "none"}; SGD ${profile.budget.min ?? 0}–${profile.budget.max ?? "unbounded"}; size ${profile.property.minSize ?? 0}–${profile.property.maxSize ?? "unbounded"} sqft. Bedrooms, routes and amenities are not present in this dataset and are not filtered.`,
    boundary: "Historical HDB transactions only. These records are not currently available listings or valuations. Budget-filtered sample statistics are not market-wide price estimates. Flat room type is not verified bedroom count. Does not substantiate condo or landed prices.",
    examples: examples.map((r) => ({ id: r._id, month: r.month, town: r.town, flatType: r.flat_type,
      address: `${r.block} ${r.street_name}`, floorAreaSqm: r.floor_area_sqm, resalePrice: r.resale_price, remainingLease: r.remaining_lease })),
  });
}

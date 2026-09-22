import { z } from "zod";
import {
  BuyerProfileSchema,
  PropertySchema,
  CommuteSchema,
  AmenitySchema,
  ConstraintSchema,
  CandidateSchema,
  RankedSchema,
  Property,
  BuyerProfile,
  Candidate,
} from "../schemas";
import {
  ListingProvider,
  RoutingProvider,
  AmenitiesProvider,
} from "../providers/contracts";
export const SearchInput = z
  .object({
    budget: BuyerProfileSchema.shape.budget,
    bedrooms: z.number().int().nonnegative().nullable(),
    propertyType: z.array(PropertySchema.shape.propertyType),
    areas: z.array(z.string()),
    availability: z.enum(["available", "all"]),
  })
  .strict();
export const Coordinates = z
  .object({
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
  })
  .strict();
export const CommuteInput = z
  .object({
    coordinates: Coordinates,
    destination: z.string().max(100),
    mode: z.enum(["transit", "car", "walk"]),
  })
  .strict();
export const AmenitiesInput = z
  .object({
    coordinates: Coordinates,
    categories: z.array(AmenitySchema.shape.category),
    radius: z.number().positive().max(10000),
  })
  .strict();
export async function search_properties(
  input: z.infer<typeof SearchInput>,
  provider: ListingProvider,
) {
  const rows = z
    .array(PropertySchema)
    .max(1000)
    .parse(await provider.search(SearchInput.parse(input)));
  if (new Set(rows.map((p) => p.id)).size !== rows.length)
    throw new Error("Duplicate listing IDs");
  return rows;
}
export async function calculate_commute(
  input: z.infer<typeof CommuteInput>,
  provider: RoutingProvider,
) {
  const i = CommuteInput.parse(input);
  const result = CommuteSchema.parse(
    await provider.route(i.coordinates, i.destination, i.mode),
  );
  if (result.destination !== i.destination || result.mode !== i.mode)
    throw new Error(
      "Route evidence does not match requested destination and mode",
    );
  return result;
}
export async function find_nearby_amenities(
  input: z.infer<typeof AmenitiesInput>,
  provider: AmenitiesProvider,
) {
  const i = AmenitiesInput.parse(input);
  const rows = z
    .array(AmenitySchema)
    .max(1000)
    .parse(await provider.nearby(i.coordinates, i.categories, i.radius));
  if (
    rows.some(
      (a) => !i.categories.includes(a.category) || a.distanceMeters > i.radius,
    )
  )
    throw new Error("Amenity evidence outside requested categories or radius");
  return rows;
}
export const ConstraintInput = z
  .object({
    property: PropertySchema,
    profile: BuyerProfileSchema,
    commutes: z.array(CommuteSchema).default([]),
  })
  .strict();
// Frozen clock makes the fixture reproducible. Real providers use real current time.
export const FIXTURE_DATE = "2026-09-09T12:00:00.000Z";
export function check_constraints(
  input: z.input<typeof ConstraintInput>,
  now?: Date,
) {
  const { property: p, profile: b, commutes } = ConstraintInput.parse(input);
  const violations: string[] = [],
    warnings: string[] = [];
  if (b.budget.max !== null && p.price > b.budget.max)
    violations.push("Budget maximum exceeded");
  if (b.budget.min !== null && p.price < b.budget.min)
    violations.push("Below budget minimum");
  if (b.property.minBedrooms !== null && p.bedrooms < b.property.minBedrooms)
    violations.push("Insufficient bedrooms");
  if (b.property.minSize !== null && p.sizeSqft < b.property.minSize)
    violations.push("Below minimum size");
  if (b.property.maxSize !== null && p.sizeSqft > b.property.maxSize)
    violations.push("Above maximum size");
  if (
    b.property.propertyTypes.length &&
    !b.property.propertyTypes.includes(p.propertyType)
  )
    violations.push("Property type mismatch");
  if (
    b.locations.excludedAreas.some(
      (a) => a.toLowerCase() === p.area.toLowerCase(),
    )
  )
    violations.push("Excluded area");
  if (
    b.transport.maxMrtWalkingMinutes !== null &&
    (p.mrtWalkingMinutes === null || p.mrtWalkingMinutes > b.transport.maxMrtWalkingMinutes)
  )
    violations.push("MRT walking limit exceeded");
  if (p.availability !== "available") violations.push("Listing unavailable");
  const clock = now ?? (p.isSynthetic ? new Date(FIXTURE_DATE) : new Date());
  const age = (clock.getTime() - Date.parse(p.updatedAt)) / 86400000;
  if (age > 30 || age < -1)
    violations.push("Listing timestamp stale or invalid");
  if (!p.isSynthetic) {
    const checkedAge = p.checkedAt ? clock.getTime() - Date.parse(p.checkedAt) : Infinity;
    if (checkedAge < -60000 || checkedAge > 24 * 3600000)
      violations.push("Listing availability has not been verified within 24 hours");
    if (!p.sourceUrl || !p.sourceListingId) violations.push("Listing source evidence missing");
  }
  if (p.mrtWalkingMinutes === null) warnings.push("MRT walking time is unverified.");
  if (b.lifestyle.quiet && p.quietScore === null) warnings.push("Quietness is unverified; no measured score is available.");
  for (const d of b.commuteDestinations) {
    const c = commutes.find((c) => c.destination === d.place);
    if (!c) warnings.push(`${d.place} commute is unverified.`);
    if (
      d.maxTravelMinutes !== null &&
      (!c || c.travelMinutes > d.maxTravelMinutes)
    )
      violations.push(`${d.place} commute limit exceeded or unverified`);
  }
  if (p.isSynthetic)
    warnings.push(
      "Synthetic listing: details must be verified against a real provider.",
    );
  if (commutes.some((c) => c.confidence === "low"))
    warnings.push(
      "Commutes are illustrative estimates, not live transit times.",
    );
  return ConstraintSchema.parse({
    passed: !violations.length,
    violations,
    warnings,
  });
}
const fit = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
export const RankInput = z
  .object({ candidates: z.array(CandidateSchema), profile: BuyerProfileSchema })
  .strict();
export function rank_properties(input: z.infer<typeof RankInput>) {
  const { candidates, profile: b } = RankInput.parse(input);
  return z.array(RankedSchema).parse(
    candidates
      .filter(
        (c) =>
          check_constraints({
            property: c.property,
            profile: b,
            commutes: c.commutes,
          }).passed,
      )
      .map((c) => {
        const p = c.property;
        const weights: Record<string, number> = {
          budget: 15,
          property: 10,
          commute: b.commuteDestinations.length ? 25 : 0,
          transport:
            b.transport.hasCar === false ||
            b.transport.maxMrtWalkingMinutes !== null
              ? 20
              : 10,
          lifestyle: b.lifestyle.quiet || b.lifestyle.parks ? 15 : 0,
          location: b.locations.preferredAreas.length ? 10 : 0,
          amenities: Object.entries(b.lifestyle).some(
            ([k, v]) => k !== "quiet" && k !== "parks" && v,
          )
            ? 5
            : 0,
        };
        const commuteWeight = b.commuteDestinations.reduce(
          (s, d) =>
            s + (d.priority === "high" ? 3 : d.priority === "medium" ? 2 : 1),
          0,
        );
        const commute =
          b.commuteDestinations.reduce((s, d) => {
            const found = c.commutes.find((x) => x.destination === d.place);
            return (
              s +
              (found ? fit(115 - found.travelMinutes * 1.3) : 0) *
                (d.priority === "high" ? 3 : d.priority === "medium" ? 2 : 1)
            );
          }, 0) / (commuteWeight || 1);
        const park = c.amenities.find((a) => a.category === "parks");
        const lifestyleParts = [
          ...(b.lifestyle.quiet ? [p.quietScore ?? 0] : []),
          ...(b.lifestyle.parks
            ? [park ? fit(105 - park.distanceMeters / 20) : 0]
            : []),
        ];
        const amenityKeys = Object.entries(b.lifestyle)
          .filter(([k, v]) => k !== "quiet" && k !== "parks" && v)
          .map(([k]) => k);
        const components = {
          budget: b.budget.max
            ? fit(75 + (1 - p.price / b.budget.max) * 100)
            : 100,
          property: fit(
            85 +
              Math.max(0, p.bedrooms - (b.property.minBedrooms ?? p.bedrooms)) *
                10,
          ),
          commute: fit(commute),
          transport: p.mrtWalkingMinutes === null ? 0 : fit(106 - p.mrtWalkingMinutes * 5),
          lifestyle: fit(
            lifestyleParts.reduce((a, b) => a + b, 0) /
              (lifestyleParts.length || 1),
          ),
          location: b.locations.preferredAreas.some(
            (a) => a.toLowerCase() === p.area.toLowerCase(),
          )
            ? 100
            : 50,
          amenities: amenityKeys.length
            ? fit(
                (100 *
                  amenityKeys.filter((k) =>
                    c.amenities.some((a) => a.category === k),
                  ).length) /
                  amenityKeys.length,
              )
            : 0,
        };
        const total = Object.values(weights).reduce((a, b) => a + b, 0);
        const score = fit(
          Object.entries(components).reduce(
            (s, [k, v]) => s + v * weights[k],
            0,
          ) / total,
        );
        const why = [
          `SGD ${p.price.toLocaleString("en-SG")} and ${p.bedrooms} bedrooms meet the numeric brief.`,
          p.mrtWalkingMinutes === null ? "MRT walking time is unverified." :
            `${p.mrtWalkingMinutes}-minute walk to ${p.nearestMrt} MRT (${p.isSynthetic ? "fixture" : "imported source snapshot"}).`,
          ...(b.lifestyle.parks && park
            ? [`${park.name} is ${park.distanceMeters} m away (${p.isSynthetic ? "fixture" : "source snapshot"}).`]
            : []),
          ...c.commutes.map(
            (x) =>
              `${x.destination}: about ${x.travelMinutes} minutes by ${x.mode} (estimated).`,
          ),
        ];
        const tradeoffs = [
          ...(c.commutes.length
            ? [
                `Longest estimated commute: ${Math.max(...c.commutes.map((x) => x.travelMinutes))} minutes.`,
              ]
            : []),
          ...(b.lifestyle.quiet
            ? [
                p.quietScore === null ? "Quietness is unverified; inspect in person." :
                  `Quietness uses a synthetic ${p.quietScore}/100 index; no measured noise data.`,
              ]
            : []),
          ...(p.mrtWalkingMinutes !== null && p.mrtWalkingMinutes > 5
            ? ["MRT access requires more than 5 minutes on foot."]
            : []),
          "Price, availability and routes require independent live verification.",
          ...b.commuteDestinations.filter((d) => !c.commutes.some((x) => x.destination === d.place)).map((d) => `${d.place}: route evidence unavailable; commute score penalized.`),
        ];
        return {
          ...c,
          constraints: check_constraints({
            property: p,
            profile: b,
            commutes: c.commutes,
          }),
          score,
          components,
          weights,
          why,
          tradeoffs,
          evidence: [
            `${p.source}:${p.id}`,
            `updatedAt:${p.updatedAt}`,
            ...(p.sourceUrl ? [p.sourceUrl, `sourceListingId:${p.sourceListingId}`, `checkedAt:${p.checkedAt}`] : []),
            ...c.commutes.map((x) => `${x.source}:${x.destination}`),
            ...c.amenities.map((a) => `${a.source}:${a.name}`),
          ],
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          a.property.price - b.property.price ||
          a.property.id.localeCompare(b.property.id),
      ),
  );
}
export const CompareInput = z
  .object({
    propertyIds: z.array(PropertySchema.shape.id).min(2).max(4),
    profile: BuyerProfileSchema,
    candidates: z.array(RankedSchema),
  })
  .strict();
export const ComparisonSchema = z
  .object({
    properties: z.array(RankedSchema).min(2).max(4),
    lowestPriceId: z.string(),
    fastestMrtId: z.string().nullable(),
    summary: z.string(),
  })
  .strict();
export function compare_properties(input: z.infer<typeof CompareInput>) {
  const i = CompareInput.parse(input);
  if (new Set(i.propertyIds).size !== i.propertyIds.length)
    throw new Error("Select distinct properties.");
  const reranked = rank_properties({
    candidates: i.candidates.map(
      ({ property, commutes, amenities, constraints }) => ({
        property,
        commutes,
        amenities,
        constraints,
      }),
    ),
    profile: i.profile,
  });
  const rows = i.propertyIds.map((id) => {
    const p = reranked.find((c) => c.property.id === id);
    if (!p)
      throw new Error(
        "Unsupported property ID: compare only verified current recommendations.",
      );
    if (
      !check_constraints({
        property: p.property,
        profile: i.profile,
        commutes: p.commutes,
      }).passed
    )
      throw new Error("Property no longer satisfies constraints.");
    return p;
  });
  return ComparisonSchema.parse({
    properties: rows,
    lowestPriceId: [...rows].sort(
      (a, b) => a.property.price - b.property.price,
    )[0].property.id,
    fastestMrtId: [...rows].filter((r) => r.property.mrtWalkingMinutes !== null).sort(
      (a, b) => a.property.mrtWalkingMinutes! - b.property.mrtWalkingMinutes!,
    )[0]?.property.id ?? null,
    summary:
      "Compare deterministic scores and recorded source evidence. Unknown facts remain unverified. Human judgment determines the final shortlist.",
  });
}
export const toolSchemas = {
  search_properties: { input: SearchInput, output: z.array(PropertySchema) },
  calculate_commute: { input: CommuteInput, output: CommuteSchema },
  find_nearby_amenities: {
    input: AmenitiesInput,
    output: z.array(AmenitySchema),
  },
  check_constraints: { input: ConstraintInput, output: ConstraintSchema },
  rank_properties: { input: RankInput, output: z.array(RankedSchema) },
  compare_properties: { input: CompareInput, output: ComparisonSchema },
};
export type { Property, BuyerProfile, Candidate };

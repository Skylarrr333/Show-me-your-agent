import type { BuyerProfile } from "../schemas";
import type { ComparisonSchema } from "../tools";
import type { z } from "zod";

type Comparison = z.infer<typeof ComparisonSchema>;
export default function PropertyComparison({
  comparison,
  profile,
}: {
  comparison: Comparison;
  profile: BuyerProfile;
}) {
  const properties = comparison.properties;
  const row = (label: string, values: string[]) => [label, ...values];
  const rows = [
    row(
      "Price",
      properties.map(
        (r) =>
          `S$${r.property.price.toLocaleString("en-SG")}${r.property.id === comparison.lowestPriceId ? " · lowest price" : ""}`,
      ),
    ),
    row(
      "Overall buyer fit",
      properties.map((r) => `${r.score} / 100`),
    ),
    row(
      "Area / type",
      properties.map((r) => `${r.property.area} · ${r.property.propertyType}`),
    ),
    row(
      "Bedrooms / size",
      properties.map(
        (r) =>
          `${r.property.bedrooms} beds · ${r.property.sizeSqft.toLocaleString()} sqft`,
      ),
    ),
    row(
      "Nearest MRT",
      properties.map(
        (r) =>
          `${r.property.nearestMrt} · ${r.property.mrtWalkingMinutes} min walk${r.property.id === comparison.fastestMrtId ? " · shortest walk" : ""}`,
      ),
    ),
    row(
      "Hard constraints",
      properties.map((r) =>
        r.constraints.passed
          ? "All passed"
          : r.constraints.violations.join("; "),
      ),
    ),
    ...profile.commuteDestinations.map((d) =>
      row(
        `${d.place} commute${d.maxTravelMinutes !== null ? ` (≤ ${d.maxTravelMinutes} min)` : ""}`,
        properties.map((r) => {
          const route = r.commutes.find((c) => c.destination === d.place);
          return route
            ? `~${route.travelMinutes} min by ${route.mode} · ${route.confidence} confidence`
            : "Not evaluated";
        }),
      ),
    ),
    row(
      "Amenities (fixture)",
      properties.map(
        (r) =>
          (r.amenities.length ? r.amenities : r.property.amenities)
            .map((a) => `${a.name} (${a.category}, ${a.distanceMeters} m)`)
            .join("; ") || "None recorded",
      ),
    ),
    ...Object.keys(properties[0].components).map((key) =>
      row(
        `${key[0].toUpperCase()}${key.slice(1)} score`,
        properties.map(
          (r) =>
            `${r.components[key]} / 100 · ${r.weights[key] ? `weight ${r.weights[key]}` : "not weighted for this brief"}`,
        ),
      ),
    ),
    row(
      "Why recommended",
      properties.map((r) => r.why.join(" ")),
    ),
    row(
      "Trade-offs",
      properties.map((r) => r.tradeoffs.join(" ")),
    ),
    row(
      "Verification warnings",
      properties.map((r) => r.constraints.warnings.join(" ")),
    ),
    row(
      "Source / listing ID",
      properties.map(
        (r) =>
          `${r.property.source} · ${r.property.id} · synthetic: ${r.property.isSynthetic}`,
      ),
    ),
    row(
      "Updated",
      properties.map((r) => r.property.updatedAt),
    ),
  ];
  return (
    <div className="comparison-scroll">
      <p className="micro comparison-brief">
        Buyer limits: {profile.hardConstraints.join(" · ")}
      </p>
      <table>
        <caption className="sr-only">
          Property comparison against the current buyer brief
        </caption>
        <thead>
          <tr>
            <th scope="col">Buyer fit</th>
            {properties.map((r) => (
              <th scope="col" key={r.property.id}>
                {r.property.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([label, ...values]) => (
            <tr key={label}>
              <th scope="row">{label}</th>
              {values.map((value, index) => (
                <td key={properties[index].property.id}>{value}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="micro">
        {comparison.summary} Scores are weighted fit measures, not
        probabilities. All routes and amenities are illustrative.
      </p>
    </div>
  );
}

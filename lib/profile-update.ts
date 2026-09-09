import type { BuyerProfile } from "../schemas";

/** Independent extraction anchors supported edits; model output never grants permission. */
export function validateProfileUpdate(
  prior: BuyerProfile,
  next: BuyerProfile,
  anchor: BuyerProfile,
) {
  const numericPaths = [
    "budget.min",
    "budget.max",
    "property.minBedrooms",
    "property.minSize",
    "property.maxSize",
    "transport.maxMrtWalkingMinutes",
  ] as const;
  for (const path of numericPaths) {
    const [group, key] = path.split(".") as [
      "budget" | "property" | "transport",
      string,
    ];
    const read = (p: BuyerProfile) =>
      (p[group] as unknown as Record<string, unknown>)[key];
    if (read(anchor) !== read(prior) && read(next) !== read(anchor)) {
      throw new Error(
        "Model numeric extraction disagrees with explicit buyer limits. Please restate the requirement.",
      );
    }
    if (
      read(prior) !== null &&
      read(anchor) === read(prior) &&
      read(next) !== read(prior)
    ) {
      throw new Error(
        "Unconfirmed hard-constraint change blocked. Restate the explicit numeric change.",
      );
    }
  }
  // A dropped exclusion, expanded allowed type or removed commute limit is a relaxation too.
  for (const area of prior.locations.excludedAreas) {
    if (
      anchor.locations.excludedAreas.includes(area) &&
      !next.locations.excludedAreas.includes(area)
    ) {
      throw new Error(
        "Unconfirmed excluded-area removal blocked. Restate the area change explicitly.",
      );
    }
  }
  for (const area of anchor.locations.excludedAreas) {
    if (!next.locations.excludedAreas.includes(area))
      throw new Error("Unconfirmed excluded-area change blocked.");
  }
  const types = anchor.property.propertyTypes;
  if (
    types.length &&
    (next.property.propertyTypes.length === 0 ||
      next.property.propertyTypes.some((t) => !types.includes(t)))
  ) {
    throw new Error("Unconfirmed property-type relaxation blocked.");
  }
  for (const destination of anchor.commuteDestinations) {
    const actual = next.commuteDestinations.find(
      (d) => d.place === destination.place,
    );
    if (
      !actual ||
      (destination.maxTravelMinutes !== null &&
        actual.maxTravelMinutes !== destination.maxTravelMinutes)
    ) {
      throw new Error("Unconfirmed commute removal or limit change blocked.");
    }
  }
}

export function unsupportedHardRequirement(message: string) {
  if (
    /\bonly in\b|\bmust (?:be|live) in\b|\b(?:must have|must be|require|mandatory|hard constraint)[^.!?;]{0,45}\b(quiet|park|school|balcon(?:y|ies)|freehold|pool|floor|sea view)\b/i.test(
      message,
    )
  ) {
    return "This mandatory area or lifestyle condition is not supported as a verifiable hard constraint. Please clarify a numeric limit, property type or excluded area, or explicitly make it a soft preference.";
  }
  return null;
}

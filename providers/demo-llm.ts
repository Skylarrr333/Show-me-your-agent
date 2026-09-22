import { BuyerProfile, ParseSchema, PlanSchema } from "../schemas";
import { LLMProvider } from "./contracts";
import { normalizeProfile, profileConflict, suspicious } from "../lib/profile";
import { unsupportedHardRequirement } from "../lib/profile-update";
import { destinations } from "./synthetic";
import { normalizeBuyerText } from "../lib/buyer-language";
export function requiredPlan(p: BuyerProfile) {
  const tools: (
    | "search_properties"
    | "calculate_commute"
    | "find_nearby_amenities"
    | "lookup_market_comparables"
    | "check_constraints"
    | "rank_properties"
  )[] = ["search_properties"];
  if (p.commuteDestinations.length) tools.push("calculate_commute");
  if (Object.entries(p.lifestyle).some(([k, v]) => k !== "quiet" && v))
    tools.push("find_nearby_amenities");
  if (!p.property.propertyTypes.length || p.property.propertyTypes.includes("HDB")) tools.push("lookup_market_comparables");
  tools.push("check_constraints", "rank_properties");
  return PlanSchema.parse({
    tools,
    summary: `Search current listings; ${p.commuteDestinations.length ? "estimate requested commutes; " : ""}${tools.includes("find_nearby_amenities") ? "retrieve requested amenities; " : ""}enforce exact constraints, rank eligible candidates and request human approval.`,
  });
}
export class DemoLLMProvider implements LLMProvider {
  mode = "demo" as const;
  async parse(message: string, current: BuyerProfile) {
    if (suspicious(message))
      return ParseSchema.parse({
        profile: current,
        clarification:
          "Instruction override blocked. Please state only buyer requirements; existing hard constraints remain in force.",
        summary: "Guardrail blocked instruction-like input.",
      });
    message = normalizeBuyerText(message);
    const p = structuredClone(current);
    const t = message
      .toLowerCase()
      .replace(/\bone\b/g, "1")
      .replace(/\btwo\b/g, "2")
      .replace(/\bthree\b/g, "3")
      .replace(/\bfour\b/g, "4")
      .replace(/\bfive\b/g, "5");
    let recognized = false;
    const amounts = [
      ...t.matchAll(/(?:sgd|s\$|\$)\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)?\b/g),
    ];
    const amount = (value: string, unit?: string) =>
      Number(value.replaceAll(",", "")) *
      (unit === "m" || unit === "million" ? 1e6 : unit === "k" ? 1e3 : 1);
    const range = t.match(
      /between\s*(?:sgd|s\$|\$)?\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)?\s*(?:and|to|-)\s*(?:sgd|s\$|\$)?\s*([\d,]+(?:\.\d+)?)\s*(million|m|k)/,
    );
    if (range) {
      p.budget.min = amount(range[1], range[2] || range[4]);
      p.budget.max = amount(range[3], range[4]);
      recognized = true;
    } else if (amounts.length) {
      for (const m of amounts) {
        const before = t.slice(Math.max(0, m.index! - 35), m.index);
        const value = amount(m[1], m[2]);
        if (
          /(?:minimum|min|at least|from)\s*(?:budget\s*)?(?:is\s*)?$/.test(
            before,
          )
        )
          p.budget.min = value;
        else p.budget.max = value;
      }
      recognized = true;
    }
    if (!amounts.length && !range) {
      const m = t.match(
        /(?:budget|under|up to)\s*(?:is |of |to )?([\d.]+)\s*(m|million|k)\b/,
      );
      if (m) {
        p.budget.max = Number(m[1]) * (m[2] === "k" ? 1e3 : 1e6);
        recognized = true;
      }
    }
    const beds = t.match(/(\d+)\s*[- ]?(?:bedrooms?|beds?|br)\b/);
    if (beds) {
      p.property.minBedrooms = Number(beds[1]);
      recognized = true;
    }
    const mrt =
      t.match(
        /mrt.{0,45}?(?:within|under|maximum|max|<=|≤)\s*(\d+)\s*(?:minutes?|mins?)/,
      ) || t.match(/(\d+)\s*(?:minutes?|mins?).{0,20}(?:mrt|station)/);
    if (mrt) {
      p.transport.maxMrtWalkingMinutes = Number(mrt[1]);
      p.transport.mrtPriority = "high";
      recognized = true;
    }
    if (
      /no car|neither drives|don.t drive|doesn.t drive|public transport/.test(t)
    ) {
      p.transport.hasCar = false;
      p.transport.mrtPriority = "high";
      recognized = true;
    } else if (/have a car|has a car|we drive/.test(t)) {
      p.transport.hasCar = true;
      recognized = true;
    }
    for (const [key, re] of Object.entries({
      quiet: /quiet|peaceful/,
      parks: /jogging|jog|parks?|green space/,
      food: /food|hawker/,
      shopping: /shopping|malls?/,
      schools: /schools?|children/,
      nightlife: /nightlife/,
    })) {
      if (re.test(t)) {
        p.lifestyle[key as keyof typeof p.lifestyle] = !new RegExp(
          `(?:no longer|don.t|do not|not).{0,18}(?:${re.source})`,
        ).test(t);
        recognized = true;
      }
    }
    for (const place of Object.keys(destinations)) {
      if (t.includes(place.toLowerCase())) {
        const remove = new RegExp(
          `(?:remove|no longer commute to|stop commuting to) ${place.toLowerCase()}`,
        ).test(t);
        if (remove) {
          p.commuteDestinations = p.commuteDestinations.filter(
            (d) => d.place !== place,
          );
          recognized = true;
          continue;
        }
        let destination = p.commuteDestinations.find((d) => d.place === place);
        if (!destination) {
          destination = { place, priority: "high", maxTravelMinutes: null };
          p.commuteDestinations.push(destination);
        }
        const limit =
          t.match(
            new RegExp(
              `${place.toLowerCase()}[^.;,]{0,30}?(?:within|under|max(?:imum)?|<=|≤)\\s*(\\d+)\\s*(?:minutes?|mins?)`,
            ),
          ) ||
          t.match(
            new RegExp(
              `(?:within|under)\\s*(\\d+)\\s*(?:minutes?|mins?)\\s*(?:to|of|from)\\s*${place.toLowerCase()}`,
            ),
          );
        if (limit) destination.maxTravelMinutes = Number(limit[1]);
        recognized = true;
      }
    }
    const areas = [
      "Clementi",
      "Buona Vista",
      "Queenstown",
      "Kent Ridge",
      "Jurong East",
      "Bishan",
      "Toa Payoh",
      "Novena",
      "River Valley",
      "Tiong Bahru",
      "CBD Fringe",
      "Pasir Panjang",
    ];
    for (const a of areas) {
      if (
        new RegExp(`(?:exclude|avoid|not in) ${a}`, "i").test(message) &&
        !new RegExp(`no longer (?:exclude|avoid) ${a}`, "i").test(message)
      ) {
        if (!p.locations.excludedAreas.includes(a))
          p.locations.excludedAreas.push(a);
        p.locations.preferredAreas = p.locations.preferredAreas.filter(
          (x) => x !== a,
        );
        recognized = true;
      } else if (
        new RegExp(
          `(?:allow|include|no longer exclude|no longer avoid) ${a}`,
          "i",
        ).test(message)
      ) {
        p.locations.excludedAreas = p.locations.excludedAreas.filter(
          (x) => x !== a,
        );
        recognized = true;
      } else if (
        new RegExp(`(?:in|prefer|around|only) ${a}`, "i").test(message)
      ) {
        if (!p.locations.preferredAreas.includes(a))
          p.locations.preferredAreas.push(a);
        recognized = true;
      }
    }
    for (const type of ["Condo", "HDB", "Landed"] as const)
      if (new RegExp(`\\b${type}\\b`, "i").test(t)) {
        p.property.propertyTypes = [type];
        recognized = true;
      }
    const minSize = t.match(
      /(?:at least|minimum|min)\s*(\d+)\s*(?:sqft|sq ft)/,
    );
    const maxSize = t.match(/(?:at most|maximum|max)\s*(\d+)\s*(?:sqft|sq ft)/);
    if (minSize) {
      p.property.minSize = Number(minSize[1]);
      recognized = true;
    }
    if (maxSize) {
      p.property.maxSize = Number(maxSize[1]);
      recognized = true;
    }
    const profile = normalizeProfile(p);
    const conflict = profileConflict(profile);
    const clarification =
      conflict ??
      unsupportedHardRequirement(message) ??
      (profile.unknownFields.length
        ? "Please specify a maximum budget in SGD and minimum bedrooms."
        : !recognized
          ? "Demo parser could not confidently interpret that request. Use a specific budget, bedrooms, MRT walking limit or a supported lifestyle preference; Bedrock mode supports broader language."
          : null);
    return ParseSchema.parse({
      profile,
      clarification,
      summary: recognized
        ? "Buyer requirements extracted and merged with existing state."
        : "No confident requirement update.",
    });
  }
  async plan(p: BuyerProfile) {
    return requiredPlan(p);
  }
}

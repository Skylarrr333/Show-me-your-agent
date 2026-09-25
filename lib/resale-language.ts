import { emptyProfile } from "../schemas";
import { normalizeProfile, suspicious } from "./profile";
import { getLLM } from "../providers/bedrock";
import type { LLMProvider } from "../providers/contracts";
import { ResaleFilterSchema, type ResaleFilters } from "./resale-schema";
const SQFT_PER_SQM = 10.7639104167;
export async function interpretResaleFilters(filters: ResaleFilters, message: string, towns: string[], llm?: LLMProvider) {
  if (!message) return { filters, warnings: [], modelMode: "not-used" };
  if (suspicious(message)) throw new Error("Only describe search requirements; instruction overrides are not accepted.");
  const provider = llm ?? getLLM();
  const current = normalizeProfile({ ...emptyProfile(), budget: { min: filters.minPrice, max: filters.maxPrice },
    property: { minBedrooms: null, propertyTypes: ["HDB"], minSize: filters.minArea === null ? null : filters.minArea*SQFT_PER_SQM,
      maxSize: filters.maxArea === null ? null : filters.maxArea*SQFT_PER_SQM },
    locations: { preferredAreas: filters.town ? [filters.town] : [], excludedAreas: [] } });
  const parsed = await provider.parse(message, current);
  if (parsed.clarification && parsed.clarification !== "Please specify a maximum budget in SGD and minimum bedrooms.") throw new Error(parsed.clarification);
  const p = parsed.profile;
  const text = message.toUpperCase();
  const matchingTowns = towns.filter(t => text.includes(t));
  if (matchingTowns.length > 1 && !filters.town) throw new Error("Choose one town in the Town filter, then search again.");
  const town = filters.town || matchingTowns[0] || towns.find(t => p.locations.preferredAreas.some(a => a.toUpperCase() === t)) || "";
  const roomType = text.match(/\b([1-5])\s*[- ]?ROOM\b/);
  const type = roomType ? `${roomType[1]} ROOM` : text.includes("EXECUTIVE") ? "EXECUTIVE" : text.includes("MULTI-GENERATION") ? "MULTI-GENERATION" : "";
  const next = ResaleFilterSchema.parse({ ...filters, town, flatType: filters.flatType || type,
    minPrice: filters.minPrice ?? p.budget.min, maxPrice: filters.maxPrice ?? p.budget.max,
    minArea: filters.minArea ?? (p.property.minSize === null ? null : p.property.minSize/SQFT_PER_SQM),
    maxArea: filters.maxArea ?? (p.property.maxSize === null ? null : p.property.maxSize/SQFT_PER_SQM), page: 1 });
  const warnings: string[] = [];
  if (p.property.minBedrooms !== null && !roomType) warnings.push("Bedroom counts are not recorded. Use the HDB flat type filter instead.");
  if (p.commuteDestinations.length || p.transport.maxMrtWalkingMinutes !== null || p.transport.hasCar !== null || Object.values(p.lifestyle).some(Boolean))
    warnings.push("Commute, MRT walking times and lifestyle preferences cannot be verified from this dataset and were not used as filters.");
  if (p.locations.excludedAreas.length) throw new Error("Area exclusions are not supported in this search. Select a specific Town instead.");
  if (p.property.propertyTypes.length && !p.property.propertyTypes.includes("HDB")) throw new Error("This dataset contains HDB transactions only.");
  if (JSON.stringify(next) === JSON.stringify({ ...filters, page: 1 }) && !warnings.length)
    warnings.push("No additional searchable filter was extracted. The selected form filters were used.");
  return { filters: next, warnings, modelMode: provider.mode };
}

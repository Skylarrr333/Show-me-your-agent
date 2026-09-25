import { z } from "zod";
import { BuyerProfileSchema, type BuyerProfile } from "../schemas";
import { normalizeProfile } from "./profile";

// Only fields exposed by the buyer form may bypass language extraction.
export const BriefConstraintsSchema = z.object({
  budget: BuyerProfileSchema.shape.budget.partial().optional(),
  property: BuyerProfileSchema.shape.property.partial().optional(),
  transport: BuyerProfileSchema.shape.transport.pick({ maxMrtWalkingMinutes: true }).partial().optional(),
}).strict();
export type BriefConstraints = z.infer<typeof BriefConstraintsSchema>;
export const RunInputSchema = z.object({
  message: z.string().trim().max(4000).default(""),
  version: z.number().int().nonnegative(),
  constraints: BriefConstraintsSchema.optional(),
}).strict().refine((v) => v.message.length > 0 || hasConstraints(v.constraints), {
  message: "Enter buyer requirements or fill in a field.",
});
export function hasConstraints(value?: BriefConstraints) {
  return !!value && Object.values(value).some((group) => group && Object.keys(group).length > 0);
}
export function applyBriefConstraints(profile: BuyerProfile, raw?: BriefConstraints) {
  const input = BriefConstraintsSchema.parse(raw ?? {});
  return normalizeProfile({ ...profile,
    budget: { ...profile.budget, ...input.budget },
    property: { ...profile.property, ...input.property },
    transport: { ...profile.transport, ...input.transport },
  });
}
export function briefMessage(message: string, input?: BriefConstraints) {
  if (!hasConstraints(input)) return message;
  const labels: Record<string, string> = { min: "Minimum budget (SGD)", max: "Maximum budget (SGD)",
    minBedrooms: "Minimum bedrooms", minSize: "Minimum size (sqft)", maxSize: "Maximum size (sqft)",
    propertyTypes: "Property types", maxMrtWalkingMinutes: "Maximum MRT walk (minutes)" };
  const fields = Object.values(input!).flatMap((group) => Object.entries(group ?? {}).map(([key, value]) =>
    `${labels[key]}: ${value === null || (Array.isArray(value) && !value.length) ? "No limit" : Array.isArray(value) ? value.join(", ") : value}`));
  return `Buyer form\n${fields.join("\n")}${message ? `\nAdditional needs: ${message}` : ""}`;
}

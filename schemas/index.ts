import { z } from "zod";
import { HomeStateSchema } from "../lib/home-schema";
import { MarketEvidenceSchema } from "../tools/market-schema";
export const Priority = z.enum(["low", "medium", "high"]);
export const PropertyType = z.enum(["Condo", "HDB", "Landed"]);
const num = z.number().finite().nonnegative();
export const BuyerProfileSchema = z
  .object({
    budget: z.object({ min: num.nullable(), max: num.nullable() }).strict(),
    property: z
      .object({
        minBedrooms: num.int().max(20).nullable(),
        propertyTypes: z.array(PropertyType),
        minSize: num.nullable(),
        maxSize: num.nullable(),
      })
      .strict(),
    locations: z
      .object({
        preferredAreas: z.array(z.string().max(80)),
        excludedAreas: z.array(z.string().max(80)),
      })
      .strict(),
    commuteDestinations: z
      .array(
        z
          .object({
            place: z.string().max(100),
            priority: Priority,
            maxTravelMinutes: num.nullable(),
          })
          .strict(),
      )
      .max(5),
    transport: z
      .object({
        hasCar: z.boolean().nullable(),
        mrtPriority: Priority,
        maxMrtWalkingMinutes: num.max(120).nullable(),
      })
      .strict(),
    lifestyle: z
      .object({
        quiet: z.boolean(),
        parks: z.boolean(),
        food: z.boolean(),
        shopping: z.boolean(),
        schools: z.boolean(),
        nightlife: z.boolean(),
      })
      .strict(),
    otherPreferences: z.array(z.string().max(200)).max(20),
    hardConstraints: z.array(z.string().max(150)).max(30),
    softPreferences: z.array(z.string().max(150)).max(30),
    unknownFields: z.array(z.string().max(150)).max(20),
  })
  .strict();
export type BuyerProfile = z.infer<typeof BuyerProfileSchema>;
export function emptyProfile(): BuyerProfile {
  return {
    budget: { min: null, max: null },
    property: {
      minBedrooms: null,
      propertyTypes: [],
      minSize: null,
      maxSize: null,
    },
    locations: { preferredAreas: [], excludedAreas: [] },
    commuteDestinations: [],
    transport: {
      hasCar: null,
      mrtPriority: "medium",
      maxMrtWalkingMinutes: null,
    },
    lifestyle: {
      quiet: false,
      parks: false,
      food: false,
      shopping: false,
      schools: false,
      nightlife: false,
    },
    otherPreferences: [],
    hardConstraints: [],
    softPreferences: [],
    unknownFields: ["budget.max", "property.minBedrooms"],
  };
}
export const AmenitySchema = z
  .object({
    name: z.string(),
    category: z.enum(["parks", "food", "shopping", "schools", "nightlife"]),
    distanceMeters: num,
    source: z.string(),
    confidence: z.enum(["low", "medium", "high"]),
  })
  .strict();
export const PropertySchema = z
  .object({
    id: z.string().regex(/^PM-\d{3}$/),
    name: z.string(),
    area: z.string(),
    address: z.string(),
    price: num,
    bedrooms: num.int(),
    bathrooms: num.int(),
    sizeSqft: num,
    propertyType: PropertyType,
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    nearestMrt: z.string(),
    mrtWalkingMinutes: num.nullable(),
    availability: z.enum(["available", "unavailable"]),
    amenities: z.array(AmenitySchema),
    description: z.string(),
    image: z.string().startsWith("/images/"),
    updatedAt: z.string().datetime(),
    source: z.string(),
    isSynthetic: z.boolean(),
    quietScore: num.max(100).nullable(),
    sourceUrl: z.string().url().refine((s) => s.startsWith("https://")).optional(),
    sourceListingId: z.string().max(150).optional(),
    checkedAt: z.string().datetime().optional(),
  })
  .strict();
export type Property = z.infer<typeof PropertySchema>;
export const CommuteSchema = z
  .object({
    destination: z.string(),
    travelMinutes: num,
    distanceKm: num,
    mode: z.enum(["transit", "car", "walk"]),
    confidence: z.enum(["low", "medium", "high"]),
    source: z.string(),
  })
  .strict();
export type Commute = z.infer<typeof CommuteSchema>;
export const ConstraintSchema = z
  .object({
    passed: z.boolean(),
    violations: z.array(z.string()),
    warnings: z.array(z.string()),
  })
  .strict();
export const CandidateSchema = z
  .object({
    property: PropertySchema,
    commutes: z.array(CommuteSchema),
    amenities: z.array(AmenitySchema),
    constraints: ConstraintSchema,
  })
  .strict();
export type Candidate = z.infer<typeof CandidateSchema>;
export const RankedSchema = CandidateSchema.extend({
  score: num.max(100),
  components: z.record(z.string(), num.max(100)),
  weights: z.record(z.string(), num),
  why: z.array(z.string()),
  tradeoffs: z.array(z.string()),
  evidence: z.array(z.string()),
}).strict();
export type Ranked = z.infer<typeof RankedSchema>;
export const PlanSchema = z
  .object({
    tools: z
      .array(
        z.enum([
          "search_properties",
          "calculate_commute",
          "find_nearby_amenities",
          "lookup_market_comparables",
          "check_constraints",
          "rank_properties",
        ]),
      )
      .max(6),
    summary: z.string().max(400),
  })
  .strict();
export const ParseSchema = z
  .object({
    profile: BuyerProfileSchema,
    clarification: z.string().max(500).nullable(),
    summary: z.string().max(500),
  })
  .strict();
export const TraceSchema = z.object({
  id: z.string(),
  runId: z.string(),
  sessionId: z.string(),
  timestamp: z.string(),
  stage: z.enum([
    "UNDERSTAND",
    "STATE",
    "PLAN",
    "TOOL",
    "VERIFY",
    "RANK",
    "RECOMMEND",
    "HUMAN",
    "ERROR",
    "GUARDRAIL",
  ]),
  summary: z.string(),
  data: z.unknown().optional(),
  durationMs: num.optional(),
});
export type Trace = z.infer<typeof TraceSchema>;
export const SessionSchema = z.object({
  id: z.string().uuid(),
  version: num.int(),
  profile: BuyerProfileSchema,
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      timestamp: z.string(),
    }),
  ),
  trace: z.array(TraceSchema),
  recommendations: z.array(RankedSchema),
  shortlist: z.array(z.string()),
  rejected: z.array(z.string()),
  status: z.enum([
    "empty",
    "waiting",
    "approved",
    "no-match",
    "clarification",
    "error",
  ]),
  notice: z.string(),
  mode: z.enum(["demo", "bedrock", "deepseek", "gateway"]),
  lastRunId: z.string().nullable(),
  updatedAt: z.string(),
  dataRevision: z.string().optional(),
  dataMode: z.enum(["synthetic", "file"]).optional(),
  marketEvidence: MarketEvidenceSchema.optional(),
  homeSearch: HomeStateSchema.optional(),
  demoChanges: z.array(z.object({
    id: PropertySchema.shape.id,
    availability: PropertySchema.shape.availability.optional(),
    price: num.optional(),
  }).strict()).max(100).optional(),
});
export type Session = z.infer<typeof SessionSchema>;
export const DEMO =
  "My clients are a couple. One works at Raffles Place and the other studies at NUS. Their maximum budget is SGD 1.6M. They want at least two bedrooms. Neither drives, they like jogging and prefer a quiet neighbourhood.";
export const UPDATE =
  "I can increase the budget to SGD 1.7M, but MRT must be within 5 minutes.";

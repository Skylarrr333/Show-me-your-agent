import { z } from "zod";
import { ResaleFilterSchema, ResaleFilterFields } from "./resale-schema";
export const PointSchema = z.object({ lat: z.number().min(1.1).max(1.5), lon: z.number().min(103.5).max(104.2), label: z.string().max(300), source: z.string(), exact: z.boolean() });
export const MapCategorySchema = z.enum(["mrt", "bus", "parks", "schools", "food", "shopping", "healthcare"]);
export type MapCategory = z.infer<typeof MapCategorySchema>;
export const CommutePreferenceSchema = z.object({ destination: z.string().trim().max(100).default(""), mode: z.enum(["walk", "car", "transit"]).default("walk"), maxMinutes: z.number().positive().max(240).nullable().default(null) }).strict();
export const RouteEvidenceSchema = z.object({ destination: z.string(), mode: z.enum(["walk", "car", "transit"]), minutes: z.number().nonnegative(), distanceKm: z.number().nonnegative(), coordinates: z.array(z.tuple([z.number(), z.number()])).max(15000), start: PointSchema, end: PointSchema, source: z.string(), checkedAt: z.string(), note: z.string() });
export const HomeRowSchema = z.object({ id:z.number().int().positive(), month:z.string(), town:z.string(), flat_type:z.string(), block:z.string(), street_name:z.string(), storey_range:z.string(), floor_area_sqm:z.number(), flat_model:z.string(), lease_commence_date:z.number(), remaining_lease:z.string(), resale_price:z.number() });
export const HomeCandidateSchema = z.object({ row:HomeRowSchema, key:z.string(), score:z.number(), why:z.array(z.string()), route:RouteEvidenceSchema.optional(), mapError:z.string().optional() });
export const HomeStateSchema = z.object({ filters:ResaleFilterSchema, commute:CommutePreferenceSchema, categories:z.array(MapCategorySchema), candidates:z.array(HomeCandidateSchema).max(60), total:z.number(), rejected:z.array(z.string()).max(500), shortlist:z.array(z.string()).max(12), saved:z.array(HomeCandidateSchema).max(30), feedback:z.array(z.object({ key:z.string(), reason:z.string().max(200), at:z.string() })).max(500), changes:z.array(z.object({ key:z.string(), kind:z.enum(["withdraw","raise-price"]), price:z.number().optional() })).max(100), sourceRevision:z.string(), warnings:z.array(z.string()), checkedAt:z.string(), seen:z.array(z.string()).max(500).default([]), checkedRoutes:z.number().default(0), page:z.number().default(1) });
export type HomeState = z.infer<typeof HomeStateSchema>;
export type HomeCandidate = z.infer<typeof HomeCandidateSchema>;
export type RouteEvidence = z.infer<typeof RouteEvidenceSchema>;
export type MapPoint = z.infer<typeof PointSchema>;
export const HomeSearchInput = z.object({ version:z.number().int().nonnegative(), message:z.string().trim().max(1800).default(""), filters:ResaleFilterFields.partial().optional(), commute:CommutePreferenceSchema.optional(), categories:z.array(MapCategorySchema).max(7).optional() }).strict();
export const HomeActionInput = z.object({ version:z.number().int().nonnegative(), action:z.enum(["approve","reject","shortlist","alternative","save","refresh","withdraw","raise-price","check-commutes"]), key:z.string().max(500).optional(), reason:z.string().trim().max(200).default("") }).strict();
export const HomeInterpretationSchema = z.object({ filters:ResaleFilterSchema, commute:CommutePreferenceSchema, categories:z.array(MapCategorySchema).max(7), clarification:z.string().max(500).nullable(), summary:z.string().max(500) }).strict();
/** Full source grouping key, independent of CSV row numbers or new import ordering. */
export function homeKey(r: z.infer<typeof HomeRowSchema>) { return JSON.stringify([r.town,r.block,r.street_name,r.flat_type,r.storey_range,r.floor_area_sqm,r.flat_model,r.lease_commence_date]); }

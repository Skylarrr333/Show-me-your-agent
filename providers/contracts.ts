import { z } from "zod";
import {
  Property,
  BuyerProfile,
  Commute,
  AmenitySchema,
  ParseSchema,
  PlanSchema,
} from "../schemas";
export type SearchFilter = {
  budget: { min: number | null; max: number | null };
  bedrooms: number | null;
  propertyType: Property["propertyType"][];
  areas: string[];
  availability: "available" | "all";
};
export interface ListingProvider {
  search(filter: SearchFilter): Promise<Property[]>;
  get(id: string): Promise<Property | undefined>;
}
export interface RoutingProvider {
  route(
    coordinates: { latitude: number; longitude: number },
    destination: string,
    mode: Commute["mode"],
  ): Promise<Commute>;
}
export interface AmenitiesProvider {
  nearby(
    coordinates: { latitude: number; longitude: number },
    categories: z.infer<typeof AmenitySchema>["category"][],
    radius: number,
  ): Promise<z.infer<typeof AmenitySchema>[]>;
}
export interface LLMProvider {
  mode: "demo" | "bedrock" | "deepseek" | "gateway";
  parse(
    message: string,
    current: BuyerProfile,
  ): Promise<z.infer<typeof ParseSchema>>;
  plan(profile: BuyerProfile): Promise<z.infer<typeof PlanSchema>>;
  drainMetrics?(): { operation: string; durationMs: number; inputTokens: number | null; outputTokens: number | null; model: string; discardedOutputChars?: number }[];
}

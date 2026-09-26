import { z } from "zod";
const amount = z.number().finite().nonnegative().nullable().default(null);
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().default(null);
export const ResaleFilterFields = z.object({
  minPrice: amount, maxPrice: amount, minArea: amount, maxArea: amount,
  town: z.string().trim().max(80).default(""),
  flatType: z.enum(["", "1 ROOM", "2 ROOM", "3 ROOM", "4 ROOM", "5 ROOM", "EXECUTIVE", "MULTI-GENERATION"]).default(""),
  fromMonth: month, toMonth: month,
  street: z.string().trim().max(100).default(""),
  sort: z.enum(["newest", "price-asc", "price-desc", "area-desc"]).default("newest"),
  page: z.number().int().min(1).max(20000).default(1),
}).strict();
export const ResaleFilterSchema = ResaleFilterFields.superRefine((v, ctx) => {
  for (const [lo, hi, message] of [[v.minPrice,v.maxPrice,"Minimum price exceeds maximum"], [v.minArea,v.maxArea,"Minimum area exceeds maximum"], [v.fromMonth,v.toMonth,"Start month exceeds end month"]] as const) {
    if (lo !== null && hi !== null && lo > hi) ctx.addIssue({ code: "custom", message });
  }
});
export type ResaleFilters = z.infer<typeof ResaleFilterSchema>;
export const ResaleRequestSchema = z.object({ filters: ResaleFilterSchema,
  message: z.string().trim().max(4000).default(""),
}).strict();
export const DemoListingSchema = z.object({
  id: z.string().regex(/^DEMO-[A-Z0-9-]+$/), unitNumber: z.string().max(30), status: z.literal("available"), checkedAt: z.string().datetime(),
  bedrooms: z.number().int().min(0).max(20), bathrooms: z.number().int().min(0).max(20), sellerLabel: z.string().max(120), agentName: z.string().max(120), agentPhone: z.string().max(40),
  photoUrl: z.string().url(), photoNote: z.string().max(300), sourceLabel: z.string().max(200),
}).strict();
export const ResaleRowSchema = z.object({
  id: z.number().int().positive(), month: z.string(), town: z.string(), flat_type: z.string(), block: z.string(), street_name: z.string(),
  storey_range: z.string(), floor_area_sqm: z.number(), flat_model: z.string(), lease_commence_date: z.number(), remaining_lease: z.string(), resale_price: z.number(),
  listing: DemoListingSchema.optional(),
}).strict();
export type ResaleRow = z.infer<typeof ResaleRowSchema>;
export type ResaleMetadata = { count: number; firstMonth: string; lastMonth: string; sourceUrl: string; title: string; version: number;
  license: string; sha256: string; importedAt: string; sourceFilename: string; idMeaning: string; boundary: string };
export type ResaleResult = { rows: ResaleRow[]; count: number; page: number; pageSize: number; pages: number;
  minPrice: number | null; maxPrice: number | null; filters: ResaleFilters; warnings: string[]; modelMode: string; };

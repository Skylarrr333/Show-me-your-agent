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
export type ResaleRow = { id: number; month: string; town: string; flat_type: string; block: string; street_name: string;
  storey_range: string; floor_area_sqm: number; flat_model: string; lease_commence_date: number; remaining_lease: string; resale_price: number };
export type ResaleMetadata = { count: number; firstMonth: string; lastMonth: string; sourceUrl: string; title: string; version: number;
  license: string; sha256: string; importedAt: string; sourceFilename: string; idMeaning: string; boundary: string };
export type ResaleResult = { rows: ResaleRow[]; count: number; page: number; pageSize: number; pages: number;
  minPrice: number | null; maxPrice: number | null; filters: ResaleFilters; warnings: string[]; modelMode: string; };

import { z } from "zod";
export const MarketEvidenceSchema = z.object({
  sourceUrl: z.string().url(), retrievedAt: z.string().datetime(), datasetSha256: z.string(),
  months: z.array(z.string()), count: z.number().int().nonnegative(),
  medianPrice: z.number().nullable(), minPrice: z.number().nullable(), maxPrice: z.number().nullable(),
  filterSummary: z.string(), boundary: z.string(),
  examples: z.array(z.object({ id: z.number().int(), month: z.string(), town: z.string(),
    flatType: z.string(), address: z.string(), floorAreaSqm: z.number(), resalePrice: z.number(), remainingLease: z.string(),
  }).strict()).max(5),
}).strict();

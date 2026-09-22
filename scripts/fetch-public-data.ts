import { mkdir, writeFile, rename } from "node:fs/promises";
import { createHash } from "node:crypto";
import { z } from "zod";
const datasetId = "d_8b84c4ee58e3cfc0ece0d773c8ca6abc";
const now = new Date();
const months = Array.from({ length: 3 }, (_, i) => {
  const month = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i - 1, 1));
  return month.toISOString().slice(0, 7);
});
const record = z.object({ _id: z.number().int(), month: z.string(), town: z.string(), flat_type: z.string(),
  block: z.string(), street_name: z.string(), storey_range: z.string(), floor_area_sqm: z.coerce.number().positive(),
  flat_model: z.string(), lease_commence_date: z.coerce.number().int(), remaining_lease: z.string(), resale_price: z.coerce.number().positive(),
});
const records: z.infer<typeof record>[] = [];
const queries: { month: string; url: string; total: number; retrieved: number }[] = [];
for (const month of months) {
  const url = new URL("https://data.gov.sg/api/action/datastore_search");
  url.searchParams.set("resource_id", datasetId);
  url.searchParams.set("filters", JSON.stringify({ month }));
  url.searchParams.set("limit", "10000");
  url.searchParams.set("sort", "_id asc");
  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`Government data fetch failed: HTTP ${response.status}`);
  const body = z.object({ success: z.literal(true), result: z.object({ records: z.array(record), total: z.number().int() }) }).parse(await response.json());
  if (body.result.records.length !== body.result.total) throw new Error("Response truncated. Refusing to publish a partial month as a complete sample.");
  if (!body.result.total || body.result.records.some((r) => r.month !== month)) throw new Error("Empty month or inconsistent government API filter result");
  records.push(...body.result.records);
  queries.push({ month, url: url.toString(), total: body.result.total, retrieved: body.result.records.length });
  console.log(`${month}: ${body.result.records.length} public historical transactions`);
}
if (new Set(records.map((r) => r._id)).size !== records.length) throw new Error("Duplicate public record IDs");
const snapshot = {
  datasetId, sourceUrl: `https://data.gov.sg/datasets/${datasetId}/view`, agency: "Housing & Development Board (HDB)",
  license: "Singapore Open Data Licence", licenseUrl: "https://data.gov.sg/open-data-licence",
  retrievedAt: now.toISOString(), months, queries,
  coverage: "All records returned for the three previous calendar months at retrieval time. Government records may be revised.",
  boundary: "Historical completed resale transactions, not current listings, availability, asking prices, property valuations, bedrooms, or route data.",
  sha256: createHash("sha256").update(JSON.stringify(records)).digest("hex"), records,
};
await mkdir("data", { recursive: true });
const temp = `data/hdb-transactions.${crypto.randomUUID()}.tmp`;
await writeFile(temp, JSON.stringify(snapshot) + "\n");
await rename(temp, "data/hdb-transactions.json");
console.log(`Saved ${records.length} official public records; provenance and SHA-256 included.`);

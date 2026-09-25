import { env } from "cloudflare:workers";
import { SIMULATED_HOMES_CTE } from "./simulated-homes";
import { resaleQuery, RESALE_PAGE_SIZE } from "./resale-query";
import type { ResaleFilters, ResaleMetadata, ResaleRow } from "./resale-schema";
function db() { return (env as unknown as { DB: D1Database }).DB; }
export async function resaleMetadata() {
  const row = await db().prepare("SELECT value FROM resale_metadata WHERE key = 'dataset'").first<{ value: string }>();
  if (!row) throw new Error("Dataset not imported");
  const dataset: ResaleMetadata = JSON.parse(row.value);
  const result = await db().prepare("SELECT DISTINCT town FROM resales ORDER BY town").all<{ town: string }>();
  return { dataset, towns: result.results.map(r => r.town) };
}
export async function searchResales(input: ResaleFilters, simulated = false) {
  const q = resaleQuery(input);
  const prefix = simulated ? SIMULATED_HOMES_CTE : "";
  const table = simulated ? "simulated_homes" : "resales";
  const stats = await db().prepare(`${prefix} SELECT COUNT(*) AS count, MIN(resale_price) AS minPrice, MAX(resale_price) AS maxPrice FROM ${table} ${q.where}`).bind(...q.values).first<{ count: number; minPrice: number | null; maxPrice: number | null }>();
  if (!stats) throw new Error("Dataset unavailable");
  const pages = Math.max(1,Math.ceil(stats.count / RESALE_PAGE_SIZE)), page = Math.min(input.page,pages);
  const rows = await db().prepare(`${prefix} SELECT * FROM ${table} ${q.where} ORDER BY ${q.order} LIMIT ? OFFSET ?`).bind(...q.values,RESALE_PAGE_SIZE,(page-1)*RESALE_PAGE_SIZE).all<ResaleRow>();
  return { ...stats, rows: rows.results, page, pages, pageSize: RESALE_PAGE_SIZE, filters: { ...q.filters, page } };
}

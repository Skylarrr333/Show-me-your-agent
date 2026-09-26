import path from "node:path";
import { SIMULATED_HOMES_CTE } from "./simulated-homes";
import { resaleQuery, RESALE_PAGE_SIZE } from "./resale-query";
import type { ResaleFilters, ResaleMetadata, ResaleRow } from "./resale-schema";
async function open() {
  const { DatabaseSync } = await import("node:sqlite");
  return new DatabaseSync(process.env.HDB_RESALE_DB || path.join(process.cwd(), ".propmatch-data/hdb-resales.sqlite"), { readOnly: true });
}
export async function resaleMetadata() {
  const db = await open();
  try {
    const row = db.prepare("SELECT value FROM resale_metadata WHERE key = 'dataset'").get() as { value: string };
    const dataset: ResaleMetadata = JSON.parse(row.value);
    const towns = (db.prepare("SELECT DISTINCT town FROM resales ORDER BY town").all() as { town: string }[]).map(r => r.town);
    return { dataset, towns };
  } finally { db.close(); }
}
export async function searchResales(input: ResaleFilters, simulated = false) {
  const q = resaleQuery(input), db = await open();
  const materialized = simulated && !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='homes'").get();
  const prefix = simulated && !materialized ? SIMULATED_HOMES_CTE : "";
  const table = materialized ? "homes" : simulated ? "simulated_homes" : "resales";
  try {
    const stats = db.prepare(`${prefix} SELECT COUNT(*) AS count, MIN(resale_price) AS minPrice, MAX(resale_price) AS maxPrice FROM ${table} ${q.where}`).get(...q.values) as { count: number; minPrice: number | null; maxPrice: number | null };
    const pages = Math.max(1,Math.ceil(stats.count / RESALE_PAGE_SIZE));
    const page = Math.min(input.page,pages);
    const rows = db.prepare(`${prefix} SELECT * FROM ${table} ${q.where} ORDER BY ${q.order} LIMIT ? OFFSET ?`).all(...q.values,RESALE_PAGE_SIZE,(page-1)*RESALE_PAGE_SIZE) as ResaleRow[];
    return { ...stats, rows, page, pages, pageSize: RESALE_PAGE_SIZE, filters: { ...q.filters, page } };
  } finally { db.close(); }
}

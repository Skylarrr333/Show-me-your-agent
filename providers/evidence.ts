import { z } from "zod";
import { PropertySchema, CommuteSchema, type Session } from "../schemas";
import type { ListingProvider, RoutingProvider, AmenitiesProvider } from "./contracts";
import { properties, SyntheticListingProvider, SyntheticRoutingProvider, SyntheticAmenitiesProvider } from "./synthetic";
import { marketMetadata } from "../tools/market";

const httpsUrl = z.string().url().refine((s) => s.startsWith("https://"), "HTTPS source link required");
export const EvidenceDatasetSchema = z.object({
  schemaVersion: z.literal(1),
  label: z.string().min(1).max(150),
  permission: z.string().min(10).max(1000),
  properties: z.array(PropertySchema).min(1).max(1000),
  routes: z.array(z.object({
    listingId: PropertySchema.shape.id,
    route: CommuteSchema,
    sourceUrl: httpsUrl,
    checkedAt: z.string().datetime(),
  }).strict()).max(10000).default([]),
}).strict().superRefine((data, ctx) => {
  const ids = new Set<string>();
  for (const [i, p] of data.properties.entries()) {
    if (ids.has(p.id)) ctx.addIssue({ code: "custom", message: "Duplicate listing ID", path: ["properties", i, "id"] });
    ids.add(p.id);
    if (p.isSynthetic || !p.sourceUrl || !p.sourceListingId || !p.checkedAt)
      ctx.addIssue({ code: "custom", message: "Imported listings must be real, with sourceUrl, sourceListingId and checkedAt", path: ["properties", i] });
    // Quietness has no supported measurement protocol. Leave it unknown for real data.
    if (p.quietScore !== null) ctx.addIssue({ code: "custom", message: "Real quietness must be null until measured evidence is supported", path: ["properties", i, "quietScore"] });
    for (const a of p.amenities)
      if (!httpsUrl.safeParse(a.source).success)
        ctx.addIssue({ code: "custom", message: "Amenity source must be an HTTPS evidence link", path: ["properties", i, "amenities"] });
  }
  const routeKeys = new Set<string>();
  for (const [i, r] of data.routes.entries()) {
    const key = `${r.listingId}:${r.route.destination}:${r.route.mode}`;
    if (!ids.has(r.listingId) || routeKeys.has(key))
      ctx.addIssue({ code: "custom", message: "Unknown listing or duplicate route evidence", path: ["routes", i] });
    routeKeys.add(key);
  }
});
export type EvidenceDataset = z.infer<typeof EvidenceDatasetSchema>;
export class EvidenceUnavailableError extends Error {}
const maxBytes = 5 * 1024 * 1024;
export async function readEvidenceFile(filename: string): Promise<EvidenceDataset> {
  // Only a server-configured file is read; no client-supplied path or URL fetch.
  const { open } = await import("node:fs/promises");
  const handle = await open(filename, "r");
  try {
    if ((await handle.stat()).size > maxBytes) throw new Error("Evidence dataset exceeds 5 MB");
    return EvidenceDatasetSchema.parse(JSON.parse(await handle.readFile("utf8")));
  } finally { await handle.close(); }
}
export async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((n) => n.toString(16).padStart(2, "0")).join("");
}
export function evidenceAgeValid(timestamp: string, hours: number, now = Date.now()) {
  const age = now - Date.parse(timestamp);
  return age >= -60000 && age <= hours * 3600000;
}
export class EvidenceFileProvider implements ListingProvider, RoutingProvider, AmenitiesProvider {
  constructor(private filename: string, private now: () => number = Date.now) {}
  async search(filter: Parameters<ListingProvider["search"]>[0]) {
    return new SyntheticListingProvider((await readEvidenceFile(this.filename)).properties).search(filter);
  }
  async get(id: string) { return (await readEvidenceFile(this.filename)).properties.find((p) => p.id === id); }
  async route(coordinates: Parameters<RoutingProvider["route"]>[0], destination: string, mode: Parameters<RoutingProvider["route"]>[2]) {
    const data = await readEvidenceFile(this.filename);
    const listingIds = new Set(data.properties.filter((p) => p.latitude === coordinates.latitude && p.longitude === coordinates.longitude).map((p) => p.id));
    const matches = data.routes.filter((r) => listingIds.has(r.listingId) && r.route.destination === destination && r.route.mode === mode && evidenceAgeValid(r.checkedAt, 24, this.now()));
    // Same-building routes must agree; no arbitrary choice between conflicting records.
    if (!matches.length || matches.some((r) => r.route.travelMinutes !== matches[0].route.travelMinutes))
      throw new EvidenceUnavailableError("No current, unambiguous route evidence");
    const r = matches[0];
    return { ...r.route, source: `${r.sourceUrl} (checked ${r.checkedAt}; imported route snapshot)` };
  }
  async nearby(coordinates: Parameters<AmenitiesProvider["nearby"]>[0], categories: Parameters<AmenitiesProvider["nearby"]>[1], radius: number) {
    const data = await readEvidenceFile(this.filename);
    const rows = data.properties.filter((p) => p.latitude === coordinates.latitude && p.longitude === coordinates.longitude && p.checkedAt && evidenceAgeValid(p.checkedAt, 24, this.now()));
    // Conservatively retain only facts common to every record at these coordinates.
    return (rows[0]?.amenities ?? []).filter((a) => categories.includes(a.category) && a.distanceMeters <= radius &&
      rows.every((p) => p.amenities.some((b) => JSON.stringify(a) === JSON.stringify(b))));
  }
}
export type DataProviders = {
  listings: ListingProvider; routing: RoutingProvider; amenities: AmenitiesProvider;
  mode: "synthetic" | "file";
};
export function dataMode(): DataProviders["mode"] {
  const mode = process.env.DATA_MODE ?? "synthetic";
  if (mode !== "synthetic" && mode !== "file") throw new Error("Unsupported DATA_MODE");
  return mode;
}
export function getDataProviders(session?: Session): DataProviders {
  if (dataMode() === "file") {
    const filename = process.env.LISTING_DATA_FILE;
    if (!filename) throw new Error("Evidence file configuration missing");
    const provider = new EvidenceFileProvider(filename);
    return { mode: "file", listings: provider, routing: provider, amenities: provider };
  }
  const rows = properties.map((p) => {
    const change = session?.demoChanges?.find((c) => c.id === p.id);
    return change ? { ...p, ...change } : p;
  });
  return { mode: "synthetic", listings: new SyntheticListingProvider(rows),
    routing: new SyntheticRoutingProvider(), amenities: new SyntheticAmenitiesProvider() };
}
export async function dataRevision(session?: Session) {
  if (dataMode() === "file") {
    if (!process.env.LISTING_DATA_FILE) throw new Error("Evidence file configuration missing");
    const dataset = await readEvidenceFile(process.env.LISTING_DATA_FILE);
    // Expiry transitions invalidate a cached recommendation even if the file is unchanged.
    return fingerprint({ dataset, publicData: marketMetadata.sha256,
      currentListings: dataset.properties.map((p) => p.checkedAt && evidenceAgeValid(p.checkedAt, 24)),
      currentRoutes: dataset.routes.map((r) => evidenceAgeValid(r.checkedAt, 24)),
    });
  }
  return fingerprint({ mode: "synthetic", changes: session?.demoChanges ?? [], publicData: marketMetadata.sha256 });
}

import { ResaleFilterSchema, type ResaleFilters, type ResaleRow } from "./resale-schema";

/**
 * Complete, fictional listing records for the product demonstration. They use
 * real block-level addresses only so the existing OneMap evidence flow can be
 * demonstrated; no unit, seller, agent, price, or photo describes a real offer.
 */
export const DEMO_LISTINGS: ResaleRow[] = [
  {
    id: 9_000_001, month: "2026-09", town: "CLEMENTI", flat_type: "4 ROOM", block: "441A", street_name: "CLEMENTI AVE 3",
    storey_range: "10 TO 12", floor_area_sqm: 93, flat_model: "Model A", lease_commence_date: 2015, remaining_lease: "88 years 05 months", resale_price: 778_000,
    listing: {
      id: "DEMO-CLE-441A-08123", unitNumber: "#08-123", status: "available", checkedAt: "2026-09-27T09:00:00.000Z",
      bedrooms: 3, bathrooms: 2, sellerLabel: "Demonstration seller profile", agentName: "Mei Tan · PropMatch demo", agentPhone: "+65 6000 0101",
      photoUrl: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
      photoNote: "Illustrative Unsplash image; it is not a photograph of this home.", sourceLabel: "PropMatch complete-listing demonstration data v1",
    },
  },
  {
    id: 9_000_002, month: "2026-09", town: "TAMPINES", flat_type: "5 ROOM", block: "476A", street_name: "TAMPINES ST 44",
    storey_range: "13 TO 15", floor_area_sqm: 113, flat_model: "Improved", lease_commence_date: 2017, remaining_lease: "90 years 01 month", resale_price: 842_000,
    listing: {
      id: "DEMO-TAM-476A-14211", unitNumber: "#14-211", status: "available", checkedAt: "2026-09-27T09:05:00.000Z",
      bedrooms: 4, bathrooms: 2, sellerLabel: "Demonstration seller profile", agentName: "Aaron Lim · PropMatch demo", agentPhone: "+65 6000 0102",
      photoUrl: "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?auto=format&fit=crop&w=1200&q=80",
      photoNote: "Illustrative Unsplash image; it is not a photograph of this home.", sourceLabel: "PropMatch complete-listing demonstration data v1",
    },
  },
  {
    id: 9_000_003, month: "2026-09", town: "QUEENSTOWN", flat_type: "4 ROOM", block: "85", street_name: "DAWSON RD",
    storey_range: "19 TO 21", floor_area_sqm: 98, flat_model: "Premium Apartment", lease_commence_date: 2018, remaining_lease: "91 years 03 months", resale_price: 955_000,
    listing: {
      id: "DEMO-QT-085-20048", unitNumber: "#20-048", status: "available", checkedAt: "2026-09-27T09:10:00.000Z",
      bedrooms: 3, bathrooms: 2, sellerLabel: "Demonstration seller profile", agentName: "Jia Wei · PropMatch demo", agentPhone: "+65 6000 0103",
      photoUrl: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=80",
      photoNote: "Illustrative Unsplash image; it is not a photograph of this home.", sourceLabel: "PropMatch complete-listing demonstration data v1",
    },
  },
];

function matches(row: ResaleRow, f: ResaleFilters) {
  return (f.minPrice === null || row.resale_price >= f.minPrice) &&
    (f.maxPrice === null || row.resale_price <= f.maxPrice) &&
    (f.minArea === null || row.floor_area_sqm >= f.minArea) &&
    (f.maxArea === null || row.floor_area_sqm <= f.maxArea) &&
    (f.fromMonth === null || row.month >= f.fromMonth) &&
    (f.toMonth === null || row.month <= f.toMonth) &&
    (!f.town || row.town === f.town.toUpperCase()) &&
    (!f.flatType || row.flat_type === f.flatType) &&
    (!f.street || row.street_name.includes(f.street.toUpperCase()));
}

export function matchingDemoListings(raw: ResaleFilters) {
  const f = ResaleFilterSchema.parse(raw);
  return f.page === 1 ? DEMO_LISTINGS.filter((row) => matches(row, f)) : [];
}

export function sortRows(rows: ResaleRow[], sort: ResaleFilters["sort"]) {
  return [...rows].sort((a, b) => {
    if (sort === "price-asc") return a.resale_price - b.resale_price || a.id - b.id;
    if (sort === "price-desc") return b.resale_price - a.resale_price || a.id - b.id;
    if (sort === "area-desc") return b.floor_area_sqm - a.floor_area_sqm || b.id - a.id;
    return b.month.localeCompare(a.month) || b.id - a.id;
  });
}

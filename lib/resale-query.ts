import { ResaleFilterSchema, type ResaleFilters } from "./resale-schema";
export const RESALE_PAGE_SIZE = 20;
/** Column names and order expressions are fixed; all buyer values are bound parameters. */
export function resaleQuery(raw: ResaleFilters) {
  const f = ResaleFilterSchema.parse(raw);
  const conditions: string[] = [], values: (number | string)[] = [];
  for (const [column,op,value] of [["resale_price",">=",f.minPrice],["resale_price","<=",f.maxPrice],
    ["floor_area_sqm",">=",f.minArea],["floor_area_sqm","<=",f.maxArea],
    ["month",">=",f.fromMonth],["month","<=",f.toMonth]] as const) {
    if (value !== null) { conditions.push(`${column} ${op} ?`); values.push(value); }
  }
  if (f.town) { conditions.push("town = ?"); values.push(f.town.toUpperCase()); }
  if (f.flatType) { conditions.push("flat_type = ?"); values.push(f.flatType); }
  if (f.street) { conditions.push("street_name LIKE ? ESCAPE '\\'"); values.push(`%${f.street.toUpperCase().replace(/[\\%_]/g,"\\$&")}%`); }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const order = { newest: "month DESC, id DESC", "price-asc": "resale_price ASC, id ASC", "price-desc": "resale_price DESC, id ASC", "area-desc": "floor_area_sqm DESC, id ASC" }[f.sort];
  return { where, values, order, filters: f };
}

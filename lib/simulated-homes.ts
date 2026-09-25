/** A representative home, not an identified physical unit: the source has no unit IDs.
 * Select the latest comparable BEFORE buyer filtering, so old cheap sales cannot
 * reappear when the current simulation price is above budget.
 */
export const SIMULATED_HOMES_CTE = `WITH ranked_homes AS (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY town, block, street_name, flat_type, storey_range, floor_area_sqm, flat_model, lease_commence_date
    ORDER BY month DESC, id DESC
  ) AS source_rank FROM resales
), simulated_homes AS (SELECT * FROM ranked_homes WHERE source_rank = 1)`;
export const SIMULATED_HOME_DISCLOSURE = {
  mode: "simulated" as const,
  priceBasis: "Latest matching historical sale used as the simulation price; not a current asking price or valuation.",
  availability: "Available within this simulation only. No real seller or viewing is connected.",
};

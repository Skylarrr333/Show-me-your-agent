# Data provenance

**DEMO / SYNTHETIC PROPERTY DATASET**

Initial inspection found an empty workspace. A scoped search of uploaded material for the hackathon, Property Recommendation and Bedrock located the project brief, event photos and an explicitly illustrative sample proposal. It did not locate an official listing dataset or an organiser JSON API specification. No unrelated upload was treated as official property data.

`data/generate.mjs` deterministically creates `data/properties.json`: 72 fictional residential records across Clementi, Buona Vista, Queenstown, Kent Ridge, Jurong East, Bishan, Toa Payoh, Novena, River Valley, Tiong Bahru, CBD Fringe and Pasir Panjang. Names and addresses identify fictional projects, not genuine listings or sales offers. Prices, dimensions, availability, MRT walking times, amenities and quietness indexes are invented test values, not scraped data. Area-level coordinates are approximate fixtures, not surveyed unit locations.

| Data | Source | Reliability |
|---|---|---|
| Listings | `synthetic-singapore-v1` | Fictional, schema-valid fixtures |
| Routes | `synthetic-distance-heuristic-v1` | Haversine distance × 1.35, speed plus fixed access overhead; low confidence, no traffic/timetables |
| Amenities | `synthetic-amenities-v1` | Fictional named POIs and assigned distances; low confidence |
| Quietness | Synthetic 0-100 index | No measured environmental data |
| Image | AI-generated fictional condominium exterior | Illustration only; reused for synthetic records |

The generated image has no text, logo or real-development attribution. Source asset was generated specifically for this project; it is stored locally at `public/images/residence.png` and does not require an external image host. Reuse of one illustration is disclosed on every property card.

Fixture updatedAt is 2026-09-09; one deliberately outdated record is 2025-01-01. Several records are unavailable for edge testing. Fixture freshness is measured relative to a documented fixed demo clock so the demo does not expire automatically. Live provider records use current time and must be independently refreshed.

No official API schema is guessed. `providers/bedrock.ts` implements the documented AWS Converse REST contract, separately from any future organiser gateway. `providers/contracts.ts` defines provider boundaries for replacing all four backends.

Scoring weights are engineered demo choices, not learned or validated buyer-utility coefficients. No claim is made about actual commute accuracy, real listing coverage, market pricing or customer conversion.

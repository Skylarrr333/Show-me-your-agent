# September 22 public evidence addition

`data/hdb-transactions.json` contains 7,295 official HDB resale transactions covering June, July and August 2026. Its metadata records exact retrieval queries, normalized-record SHA-256, agency attribution, source URL and Singapore Open Data Licence link. Run `npm run data:public` to regenerate a complete three-month snapshot; truncated or failed API responses cannot replace the previous snapshot.

This data is used solely for historical research context. No current availability, asking price, bedroom count, live route or condo valuation is inferred. The 72 original inventory fixtures remain synthetic. Any future imported real inventory requires source ID, HTTPS source link and a recent actual availability verification. See [setup and limitations](LIVE_SETUP_ZH.md).

---

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

`providers/bedrock.ts` implements the direct AWS Converse contract. The separately implemented and tested organiser adapter in `providers/gateway.ts` uses the Starter Kit's Ollama-compatible `/api/chat` protocol. `providers/contracts.ts` defines the provider boundaries; neither model API is a source of current property inventory.

Scoring weights are engineered demo choices, not learned or validated buyer-utility coefficients. No claim is made about actual commute accuracy, real listing coverage, market pricing or customer conversion.

# OneMap integration verification — 26–27 September 2026 (SGT)

This record covers the OneMap migration, distinct from the preceding OSM/OSRM release. No model training or new AWS infrastructure was involved.

## Automated checks

- 88 unit/integration cases passed, including token renewal, request deduplication, expiry timestamps, HTTP 200 authentication errors, malformed response rejection, one bounded gateway retry, non-retry of quota/permission errors, and missing-credential behavior.
- Map cases cover exact block matching, encoded route geometry, seconds/metres conversion, rejected distant endpoints, scheduled transit and initial wait, Singapore date rollover, expired route evidence, nearby radius filtering, missing facility layers and partial failures.
- Agent cases cover hard transit limits, failed-route approval prevention, evidence expiry revoking approval, saved route synchronization and existing feedback/data-change behavior.
- 15 deterministic legacy evaluation cases passed. These use fixtures, not a live model or live maps.
- Lint, TypeScript and both Next.js/Vinext production builds passed. The build contains no OneMap credentials.

## Actual OneMap checks (not fixtures)

Authenticated against the official service using locally configured credentials; no credentials or tokens are published. Probe began at **2026-09-26 23:52 SGT**.

Public address: **705 Clementi West Street 2, Singapore 120705**. Destination: **NUS University Hall, 21 Lower Kent Ridge Road, Singapore 119077**.

| Check | Observed response |
|---|---|
| Exact block/road match | Successful; 1.305664208488289, 103.7606506986118 |
| Walking | 34 minutes, 2.8 km, 242 geometry points |
| Driving | 11 minutes, 4.04 km, 102 geometry points |
| MRT / bus | 35 minutes, 3.22 km, 155 geometry points; walking → bus 963 → walking |
| Nearby bus stops within 1 km | 40; nearest returned stop BLK 705, 69 m straight line |
| Park points within 1 km | 5; source Parks / National Parks Board |
| Hawker centres within 1 km | 4; source National Environment Agency |
| Healthcare points within 1 km | 1 returned pharmacy point |
| MRT/LRT within 1 km | No points returned for this block; not a guarantee of absence |
| Official theme catalog | 165 themes; selected point datasets are available, but no supported general school or shopping layer in this catalog |

These are timestamped observations, not permanent travel-time promises. Transit schedules and available itineraries vary by departure time; estimates do not claim live traffic or real-time arrivals. The frontend exposes the resolved destination, source and schedule context.

## Release procedure

After committing this source, deploy the exact Git SHA to the existing Lightsail instance, preserve private OneMap credentials and the sessions volume, then run authenticated HTTPS workflow checks and a real OneMap smoke test through `/api/homes/map`. Compare `/api/status` with the pushed commit. Deployment reports and access credentials remain in ignored `.propmatch-data/`; verification results are reported in the delivery message.

## Boundaries

The HDB database remains historical, and availability changes remain simulated. OneMap supplies independent current queries, not real-time sale listings. Nearby facilities are exploratory overlays, not verified hard school/MRT-proximity requirements. Unsupported or unavailable layers remain explicit; Google Maps is an external link with no Google API key or embedded API use.

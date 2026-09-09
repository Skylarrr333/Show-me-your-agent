# Quality assurance

This file records observed checks for the final repository state. Commands run against the npm lockfile in demo mode with no AWS credentials.

## Automated checks

The final checks ran after a clean `npm ci` on 10 September 2026:

| Gate | Observed result |
| --- | --- |
| `npm run lint` | Passed with zero ESLint errors |
| `npm run typecheck` | Passed after generating Next route types |
| `npm test` | 32 passed, 0 failed |
| `npm run eval` | 15 passed, 0 failed; 78 evaluated recommendation occurrences, 0 hard-constraint violations and 0 ungrounded recommendations |
| `npm run build` | Passed; generated the Sites / Workers standalone bundle in `dist/standalone` |
| `npm run build:next` | Passed; generated the Next standalone server and all seven routes |

The Next standalone production server, its compiled CSS asset and the session API each returned HTTP 200. The Sites / Vite development server also started and returned HTTP 200.

## Browser workflow

The local Next development application returned HTTP 200 and was exercised through the rendered interface on 10 September 2026:

- Session creation completed and enabled the demo controls.
- **Load Demo Scenario** produced eight verified candidates and a three-property shortlist.
- The second turn changed S$1.6M to S$1.7M and added a five-minute MRT hard limit while retaining both destinations and lifestyle state.
- Two properties were compared with price, size, MRT, both commutes, amenities, all seven component scores and weights, explanations, trade-offs, warnings and source IDs.
- A human ranking override was recorded, then the shortlist was approved.
- A S$100k / four-bedroom update produced the explicit no-match state, zero visible matches and no approval control.
- `/debug` displayed the persisted session and full structured event trail with JSON export enabled.
- The redesigned workspace was visually checked at 1440 × 900 and 390 × 844. The three-panel desktop layout, stacked mobile layout, property details, comparison table and empty state all rendered without clipped or overlapping content.
- No browser console errors were observed during the tested workflow.

This browser check validates the deterministic demo path. It does not validate live Bedrock credentials, live property data, real transit data or AWS Lightsail infrastructure.

## Environment limit

Docker is not installed on the authoring host. The Dockerfile is covered by the repository CI configuration, but local image construction cannot be claimed here. See [Deployment](DEPLOYMENT.md).

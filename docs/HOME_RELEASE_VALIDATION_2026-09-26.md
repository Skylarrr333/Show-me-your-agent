# Homepage integration verification — 26 September 2026

This record concerns the desktop homepage, historical HDB retrieval and its shared stateful Agent workflow. Deployment identity must be checked against `/api/status`; local checks do not establish that a release is already online.

## Automated local checks

- 81/81 unit tests passed after the map-recovery update, including HDB feedback, alternatives, numeric constraint protection, dataset-change approval revocation, stale/failed commute evidence, exact block geocoding, route snapping and two temporary-provider-failure cases.
- 15/15 legacy fixture-based evaluation cases passed. Those cases use the original synthetic inventory; they are separate from the new HDB homepage and do not measure live listing accuracy.
- Type checking, ESLint, Next.js production build and Vinext build passed.
- Production dependency audit reported zero vulnerabilities.
- Pinned Kaggle v1 import verified the CSV checksum and all 228,225 records. Runtime retrieval retains parameterized SQL and materializes the latest historical comparable per group before buyer filters are applied.

## Live provider checks

One Chinese request was sent to the organiser's Claude Sonnet 4.5 gateway. It asked for a Clementi 4 ROOM home within S$800,000, at least 90 m², with a walking destination at NUS and MRT/park map categories. The returned filters were validated, 521 historical groups matched and three candidates were shortlisted. Observed request time was about 31 seconds. This is one successful integration sample, not an extraction-accuracy benchmark or latency guarantee. Raw local evidence is excluded from Git to keep private session material out of the handoff.

The desktop browser separately verified:

1. Form/demo search, three-card shortlist and collapsible execution summaries.
2. Rejection with a reason, remembered exclusion and replacement.
3. Human approval, followed by simulated withdrawal and revoked approval.
4. Exact OneMap coordinates for 705 CLEMENTI WEST ST 2.
5. Overpass markers for 52 nearby MRT/bus/park items in that lookup.
6. A real OSRM walking route to NUS University Hall, displayed as a blue map line: approximately 39 minutes and 2.88 km in this sample.

Map labels and route evidence come from external services, not the Kaggle CSV. Public map services can fail or change; errors remain visible, unknown commute values are not replaced with invented numbers, and required but unverified commutes block approval. Transit navigation is an external Google Maps link; no in-app transit timetable or duration is claimed.

## Deployment checks

The [CI run for a613365](https://github.com/Skylarrr333/Show-me-your-agent/actions/runs/36247565548) passed the dataset import, production Docker build, HTTPS authentication, release identity, legacy and homepage workflows, and restart persistence.

Lightsail was then verified directly: `scripts/verify-deployment.ts --homes` passed, a separate live organiser-model request and real map lookups passed, and `--resume` confirmed the same HDB state after an actual container restart. The deployed Chinese request took approximately 35 seconds and returned 521 matching groups. The sample map route remained 39 minutes / 2.88 km to NUS, with 52 surrounding transport/park items. See [deployment evidence](DEPLOYMENT.md) and its sanitized machine-readable reports. These live checks used the measured application code at `a613365`; later documentation commits do not retroactively change that measurement.

## Scope boundaries

A subsequently reported `Map provider unavailable (504)` exposed an unhelpful generic error. The follow-up recovery patch identifies OneMap/Overpass/OSRM errors, retries temporary HTTP 502/503/504 responses once, keeps a verified block visible when nearby-place lookup fails and retains previous successful evidence with a warning. The two added tests verify recovery and that repeated failures stop after one retry. No fabricated route or place result substitutes for a failed provider.

The inventory is a historical simulation. Withdrawal and price-rise actions are explicitly simulated and scoped to a buyer session. Imported source-revision changes are detected and trigger redecision, but there is no automatic live listing feed or real delisting detector. Ranking covers a bounded loaded batch. Public route services have no application-level SLA, and driving estimates exclude live traffic. No local LLM training or claim of measured business time savings is involved.

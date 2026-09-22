# Validation — 22 September 2026

This file records the earlier DeepSeek baseline. The later organiser-gateway integration, 47-test suite and separate live results are recorded in [Gateway validation](GATEWAY_VALIDATION_2026-09-22.md).

Base commit: `15e7ff99b7847bd7d729292b27d32f8912867d1e`. Local branch: `codex/hackathon-training-plan`.

| Check | Actual result |
|---|---|
| Lint / TypeScript | Passed |
| Unit and workflow tests | 41 / 41 passed |
| Deterministic evaluation | 15 / 15 passed |
| Regression hard-constraint violations | 0 across 78 recommendation occurrences |
| Real-provider authored scenarios | 8 / 8 passed (6 English-path cases, 2 Chinese cases) |
| Recorded calls in final live reports | 12 successful DeepSeek calls; 6024 input and 2614 output tokens |
| Next.js production build | Passed |
| Alternative portable build | Passed |
| Browser flow | Real DeepSeek → recommendations → approve → simulate withdrawal → approval revoked and shortlist replaced |
| Front-end secret scan | 54 generated client files checked, zero occurrences of the configured key |
| Local secret file | Mode 600; ignored by Git and Docker |
| Deployment | Local loopback demo running; public / AWS deployment not performed |

The injection case is blocked locally before reaching the model. Token totals cover the final saved successful evaluations, not earlier debugging calls or browser rehearsals. API usage is not an asserted currency cost. These are small authored scenarios, not general model accuracy or measured business improvement.

Government data: 7,295 HDB historical resale records for June–August 2026, fetched through the official API. Source provenance is in `data/hdb-transactions.json`. Inventory, routing and market-change events remain clearly marked simulations; no actual live inventory is claimed.

The browser test generated PM-069 / PM-021 / PM-009 as the initial shortlist, approved it, then simulated withdrawal of PM-069. The revised shortlist began with PM-021 / PM-009 / PM-015 and returned to the waiting-for-review state. The buyer profile was retained and no new model call was needed for refresh.

Reports: `evals/results.json`, `evals/live-results.json`, `evals/live-chinese-results.json`, `evals/readiness-results.json`. The optional ranking experiment is documented separately in `training/artifacts/REPORT.md` and is not used by production recommendations.

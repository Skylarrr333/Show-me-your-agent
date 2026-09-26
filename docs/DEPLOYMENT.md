# Verified Lightsail deployment

**Live application:** <https://propmatch-18-142-198-52.sslip.io/>

**Latest homepage rollout verified:** 26 September 2026, 23:00 Singapore time (15:00 UTC).

**Access:** shared judge username/password, supplied privately by the team. These are website credentials, not AWS credentials. Unauthenticated requests receive HTTP 401.

## 26 September homepage release

The integrated desktop homepage is deployed on Lightsail. The current workflow uses the pinned Kaggle HDB dataset and parameterized SQL, persistent rejection feedback, alternative shortlists, human approval and redecision after a source revision or a disclosed simulated availability event. The new map panels retrieve real OneMap locations, OpenStreetMap amenities and OSRM walking/driving routes.

Measured source commit: `a613365b932077e314cc64b210cd80080c4603bc`. The subsequent documentation-only commit adds these reports without changing the measured application code; final rollout identity is checked against `/api/status` and GitHub `main`.

| Production check | Observed result |
|---|---|
| HDB import | All 228,225 historical transactions present; pinned checksum verified in the image build |
| Homepage workflow | SQL search → three-home shortlist → rejection remembered and replaced → approval → simulated withdrawal → approval revoked |
| Real organiser model | One Chinese request correctly extracted Clementi, 4 ROOM, maximum S$800,000 and minimum 90 m²; 521 matching historical groups; approximately 35 seconds |
| Real map evidence | 705 CLEMENTI WEST ST 2 resolved with OneMap; 52 MRT/bus/park items returned in the sample |
| Real walking route | NUS destination: 39 minutes, 2.88 km, 224 geometry points in the sample; no live traffic or in-app transit duration |
| Restart persistence | Same session, version, status, buyer profile and HDB state restored after an actual application-container restart |
| Access controls | Public HTTPS certificate accepted normally; unauthenticated and incorrect-password requests blocked; Secure/HttpOnly/SameSite=Strict session cookie |
| GitHub validation | [Successful full CI](https://github.com/Skylarrr333/Show-me-your-agent/actions/runs/36247565548): 79 tests, 15 legacy eval cases, both production builds, Docker and HTTPS/restart checks |

Sanitized reports: [homepage workflow](../evals/lightsail-homes-2026-09-26.json), [live model and maps](../evals/lightsail-home-live-2026-09-26.json), [restart persistence](../evals/lightsail-home-restart-2026-09-26.json). These are bounded integration checks, not an accuracy benchmark or a claim of live property availability. Credentials and session identifiers are excluded.

## Running infrastructure

| Item | Observed configuration |
|---|---|
| Instance | `propmatch-303forward` |
| Region / zone | Singapore, `ap-southeast-1a` |
| OS / plan | Ubuntu 24.04 LTS; 4GB RAM, 2 vCPUs, 80GB SSD; approved US$24/month plan, billed by usage time |
| Static IPv4 | `18.142.198.52`, attached resource `propmatch-static-ip` |
| Runtime | Docker 29.8.1, Compose 5.5.1, Node 22.23.2, Next.js 16.3.5 |
| Application | Next standalone container, UID 1001, healthy; port 3000 bound to host loopback |
| HTTPS | Caddy with publicly trusted certificate, HTTP 308 redirect, bcrypt access gate |
| Model | `LLM_MODE=gateway`; organiser Claude Sonnet 4.5 service, exercised through the deployed app |
| Homepage data | 228,225 pinned historical HDB transactions; representative home groups, real map lookups, explicitly simulated availability changes |
| Legacy evidence | 72 synthetic fixtures and 7,295 official historical HDB transactions retained for the original tools and regression tests |
| Storage | Persistent Docker `propmatch_sessions`, `propmatch_caddy_data`, `propmatch_caddy_config` volumes |
| Private settings | `/opt/propmatch/shared/app.env`, mode 600; no API keys or SSH keys in GitHub or image build context |

SSH is restricted to the deployment operator's IP and the Lightsail browser SSH service. Web ports are 80/443; an external connection to port 3000 was blocked. No load balancer, paid automatic snapshots or extra database service was provisioned for this rollout. The static-IP-derived hostname uses sslip.io DNS; its availability is an external dependency.

## Previous release verification — 22 September

The live workflow ran on source commit `6bbedf71d427c8406539115ec19bc36adb4d305a`. The reports deliberately retain the commit actually tested; documentation added afterward does not retroactively change that measurement. Subsequent documentation releases are deployed from `main` and checked against the live `/api/status` → `release.commit` value.

| Check | Result / evidence |
|---|---|
| Public TLS | Certificate verification succeeded without a bypass; curl TLS result 0 |
| HTTP redirect | 308 to the HTTPS origin |
| Access protection | Home, status, session and debug blocked without credentials; incorrect credentials rejected |
| Release identity | Authenticated status returned the expected 40-character Git commit |
| Cookie | Secure, HttpOnly, SameSite=Strict |
| Actual Claude call | Successful gateway model trace and reviewable shortlist; no demo fallback |
| Recommendation constraints | All recommendations passed deterministic hard constraints |
| Human review | Explicit approval persisted |
| Simulated withdrawal / over-budget repricing | Old first candidate removed, buyer profile preserved, old approval revoked; refresh used no further model calls |
| Container restart | The same session, version, status and buyer profile were restored afterward |
| Automated regression | 47 tests and 15 deterministic evaluation cases passed |
| Production dependencies | `npm audit --omit=dev` reported 0 known findings; development-tool findings remain documented in [Security](SECURITY.md) |
| GitHub CI | [Successful full run for the tested release](https://github.com/Skylarrr333/Show-me-your-agent/actions/runs/35692131338), including both builds, Docker runtime HTTPS workflow and restart persistence |

Sanitized machine-readable evidence:

- [Real gateway workflow](../evals/lightsail-live-2026-09-22.json)
- [Session persistence after a real container restart](../evals/lightsail-restart-2026-09-22.json)

These reports contain no passwords, API keys, SSH private keys, cookies or session IDs. The private verification probe remains local and is excluded from Git.

## Reproduce, update and operate

Follow the [Lightsail runbook](../deployment/LIGHTSAIL_RUNBOOK.md). Source is transferred as an exact Git archive over SSH with a verified host fingerprint; the server does not hold a personal GitHub token. Releases live under `/opt/propmatch/releases/FULL_COMMIT_SHA`, and `/opt/propmatch/current` identifies the active release. Keep Compose project name `propmatch` on every update to reuse volumes.

`npm run verify:deployment` checks the public endpoint using private local verification settings. `--live` makes real model requests; `--resume` checks the existing probe after a controlled restart without more model requests. See the runbook for configuration. Read `/api/status` with the private website credentials and compare `release.commit` with `git ls-remote origin refs/heads/main` to check the deployed source version.

The instance remains running for judging. Hosting and gateway calls share the team's competition allocation; monitor actual use. Removing the app's containers does not delete the VM, and stopping a VM is not a promise that all charges stop. Any eventual resource removal must preserve required evidence/session backups first.

## Scope limits and other targets

This is an access-controlled hackathon demo, not a production agency account system. The shared password is not per-user authorization or comprehensive rate limiting. No real current listing feed, automatic real-world listing alerts, email/WhatsApp delivery or property transaction operation is claimed. The documented change scenarios are session-local simulations; historical HDB sales are not current inventory.

The repository also builds a Vinext/Cloudflare Workers target with D1 storage. This deployment record verifies the **Lightsail Next.js target only**. Video recording, final PDF export and submission to the competition Slack channel are separate deliverables.

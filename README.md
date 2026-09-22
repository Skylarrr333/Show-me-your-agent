# PropMatch Agent

**303forward · Team code D1IZFT7E**  
NUS-ISS Show Me Your Agents Hackathon · Property Recommendation

An AI property recommendation copilot for property agents. Convert a messy buyer conversation into validated buyer state, retrieve evidence, enforce hard constraints, compare scored candidates and approve a shortlist. The desktop workspace shows conversation, property recommendations and an auditable action trace side by side.

**Hybrid evidence demo.** The 72 listing scenarios, availability changes, amenities and routes are fictional. A separate market tool uses 7,295 official HDB historical transactions from June–August 2026. Historical sales do not establish current availability or condo valuations. The organiser gateway and DeepSeek have separate providers and validation reports. See [中文参赛方案](docs/参赛方案.md) and [本机设置](docs/LIVE_SETUP_ZH.md).

## September 22 implementation

- Organiser Ollama-compatible gateway provider (`LLM_MODE=gateway`), alongside DeepSeek and direct Bedrock providers; structured state validation, token/latency trace and fail-closed errors.
- Official public HDB snapshot, reproducible fetch script, source records and sample-scoped statistics.
- Manual refresh, optional 30-second checks while the visible page is open, and session-local simulated withdrawal / over-budget events. Changed sources revoke approval and trigger re-ranking; unchanged sources use no model calls.
- Sourced inventory JSON provider for future real listing access, with explicit unknown facts and freshness checks. It is not currently populated with real inventory.
- Live API evaluation, bilingual numeric anchors, workflow regression tests and a separate optional CPU ranking experiment.

To run locally: set private `.env.local` as documented, then `npm exec -- next dev --hostname 127.0.0.1`. `npm run check:setup` prints configuration status without keys. `npm run eval:live -- --full` and `-- --chinese` call the selected real provider and incur normal API usage. `npm run data:public` updates the government snapshot; rebuild production deployments afterward.

## What works

- One-click couple / NUS / Raffles Place / S$1.6M demo, plus reset.
- Multi-turn update to S$1.7M and MRT within 5 minutes; existing bedrooms, destinations, no-car and lifestyle requirements persist.
- Validated inputs and outputs for the original six tools plus a public market-evidence tool; deterministic hard constraints and explainable weighted ranking.
- Adaptive tool selection: no route calls without destinations, no amenities calls without relevant preferences.
- Details with component scores, why recommended, trade-offs, source IDs and timestamps.
- Comparison of 2-4 verified listings; shortlist toggles, approval, rejection, alternative and recorded ranking override.
- No-match escalation with conflict counts; no automatic relaxation.
- Streaming action trace, persistent session state and `/debug` / `/trace` with JSON export.
- Golden, edge and adversarial tests; machine-readable eval results.

## Business problem and scope

Agents repeatedly reconcile budgets, bedrooms, transport and lifestyle while listings change. PropMatch makes the shortlist reviewable: each candidate carries source evidence, constraint results and a concise explanation. Business value is reduced manual comparison effort and clearer buyer discussions; actual time savings have not been measured. No messaging, purchases, booking, financing or eligibility decisions are automated.

## Why an agent

A buyer changes requirements conversationally and different briefs require different evidence. A stateful orchestrator interprets updates, selects the required tool set, rechecks current listings and knows when to stop for human input. A static search form alone would not demonstrate this update / planning / verification loop. Demo mode is a deterministic parser and planner; live mode uses the organiser gateway, DeepSeek or direct Bedrock for structured interpretation and a bounded tool-plan proposal. The system does not pretend that demo mode is a live LLM.

## Architecture and reasoning loop

`React workspace → Next.js route handlers → single orchestrator → typed providers/tools → deterministic constraints + ranking → provider re-verification → human approval`

1. Read server-side session and validated BuyerProfile.
2. Parse the current message and merge only explicit changes.
3. Validate the complete model response with strict Zod schemas; compare numeric edits against independent extraction.
4. Ask for clarification on missing, conflicting or unsupported requirements.
5. Request a bounded tool plan. Policy ensures evidence tools required by the profile are present and omits unnecessary tools.
6. Search, enrich requested commutes/amenities, check constraints and rank.
7. Re-read candidate IDs and remove changed or withdrawn listings.
8. Produce evidence-based explanations and an unapproved top three; or escalate no-match.
9. Persist messages, buyer state, results and trace with optimistic concurrency.

The UI displays action summaries and tool facts, never private chain-of-thought. Explanations are deterministic, evidence-grounded templates in both modes; free LLM prose cannot change scores or introduce listings. See [Architecture](docs/ARCHITECTURE.md).

## Tools

| Tool | Purpose | Validation |
|---|---|---|
| `search_properties` | Read-only provider search by budget, bedrooms, type, area, availability | `SearchInput` → `Property[]` |
| `calculate_commute` | Requested destination and mode only | `CommuteInput` → `Commute` |
| `find_nearby_amenities` | Requested categories and bounded radius | `AmenitiesInput` → `Amenity[]` |
| `check_constraints` | Numeric limits, availability, freshness, excluded areas, commute limits | `ConstraintInput` → passed, violations, warnings |
| `rank_properties` | Weighted reproducible scoring of eligible candidates | `RankInput` → ranked evidence |
| `lookup_market_comparables` | Query official historical HDB evidence by budget, town and size; never current inventory | BuyerProfile → MarketEvidence |
| `compare_properties` | 2-4 distinct current verified property IDs | `CompareInput` → structured comparison |

All contracts are exported in `tools/index.ts`. Providers implement `ListingProvider`, `RoutingProvider`, `AmenitiesProvider`, `LLMProvider` from `providers/contracts.ts`. There is no model-accessible SQL, shell, URL fetch or arbitrary code tool.

## State and memory

BuyerProfile includes budget, property requirements, preferred/excluded areas, destinations, transport, six lifestyle preferences, hard/soft summaries, unknowns and other preferences. Numeric limits and excluded areas are hard. `preferredAreas` are soft and influence location score. Mandatory geography / subjective hard limits that cannot be encoded must trigger clarification.

Sessions use an opaque HttpOnly SameSite cookie, server-owned IDs, monotonic versions and optimistic compare-and-swap. Updates append events with before/after field changes. Node deployment writes atomic private JSON files to `SESSION_DIR`; Sites preview/deployment maps the adapter to D1. A reset creates a fresh session; previous records are retained on the server. The same browser cookie restores the current session after reload. There is no cross-device user account system. `/debug` sees only the current cookie session.

## Human review and guardrails

The agent recommends but cannot approve. An explicit human action is required; approval rechecks provider records and constraints. Changing the shortlist or overriding ranking revokes previous approval. An override changes presentation order and records the original score; it cannot edit the score or make an ineligible property valid.

Strict schemas, source-ID grounding, independent hard-constraint update checks, untrusted listing text isolation, no executable tools, byte-based request limits, same-origin mutation checks and version checks protect the flow. See [Security](docs/SECURITY.md) for threats and limits, including the difference between a hackathon demo and a production multi-tenant service.

## Tech stack

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, Zod 3, Radix UI primitives and Lucide icons. Node's built-in test runner runs TypeScript through tsx. A secondary Vinext/Vite build runs the same application on Sites / Cloudflare Workers with D1. AWS Docker uses Next.js standalone output.

## Local setup (Node 22.13+)

```bash
npm ci
cp .env.example .env.local
```

For the organiser gateway, set `LLM_MODE=gateway`, `LLM_GATEWAY_URL`, `LLM_GATEWAY_API_KEY`, and `LLM_MODEL` from the team email in `.env.local`. The adapter uses `/api/chat` and `X-API-Key`; it does not need an AWS access key or a local model.

For real DeepSeek, set `LLM_MODE=deepseek`, `DEEPSEEK_API_KEY`, and `DEEPSEEK_MODEL=deepseek-flash` in `.env.local`. Never expose the key through `NEXT_PUBLIC_*`.

Leave `SESSION_DIR` blank for project-local `.propmatch-sessions`, or set it to an existing writable absolute directory.

```bash
npm run dev:next
```

Open `http://localhost:3000`. Demo needs no credentials or network calls. `npm run dev` is the included Sites/Vite development target. `npm run build:next && npm run start:next` runs a Next production build. `npm run build` creates the alternative Sites/Workers bundle.

## Environment variables

| Variable | Default / use |
|---|---|
| `LLM_MODE` | `auto`; `.env.example` sets `demo`. Explicit `gateway` / `deepseek` / `bedrock` fail closed if configuration is missing. |
| `LLM_GATEWAY_URL` | Organiser HTTPS origin; `/api/chat` is appended by the adapter |
| `LLM_GATEWAY_API_KEY` | Server-only team key, sent only to the configured gateway |
| `LLM_MODEL` | Model/profile ID from the organiser email |
| `DEEPSEEK_API_KEY` | Server-only official DeepSeek key |
| `DEEPSEEK_MODEL` | `deepseek-flash`, configurable |
| `DEEPSEEK_BASE_URL` | `https://api.deepseek.com`; optional `/v1` path supported |
| `DATA_MODE` | `synthetic` or `file` (sourced local inventory snapshots) |
| `LISTING_DATA_FILE` | Absolute server path when `DATA_MODE=file`; Node deployment only |
| `AWS_REGION` | `ap-southeast-1` |
| `AWS_BEARER_TOKEN_BEDROCK` | Bedrock API bearer token; server only, never `NEXT_PUBLIC_*` |
| `BEDROCK_MODEL_ID` | Enabled Claude Sonnet 4.5 model/inference-profile ID from your account; no invented default |
| `BEDROCK_ENDPOINT` | Optional documented Converse-compatible HTTPS origin; blank uses regional AWS runtime |
| `SESSION_DIR` | Private writable Node storage folder; Docker uses `/app/storage`; ignored for D1 |
| `NEXT_TELEMETRY_DISABLED` | `1` in Docker |
| `DOMAIN` | Hostname used only by optional Caddy HTTPS compose profile |

**Organiser gateway and direct AWS are separate protocols.** `GatewayProvider` follows the [Starter Kit weather client](https://github.com/kenken64/ShowMeYourAgent-Starter-Kit/blob/main/weather_demo.py): Ollama `/api/chat`, `X-API-Key`, non-streaming messages. `BedrockProvider` separately implements the documented AWS Converse API with a bearer token. Never put the team gateway key in `AWS_BEARER_TOKEN_BEDROCK`. There are no silent provider switches or automatic paid retries. See [gateway validation](docs/GATEWAY_VALIDATION_2026-09-22.md) for actual checks and limits.

The independent numeric-edit guard is deliberately conservative; unsupported phrasings for relaxing existing constraints require restating explicit numbers. Supported fixture destinations: NUS, Raffles Place, Jurong East, Changi Airport. Unknown routing destinations trigger clarification.

## Evaluation and quality gates

```bash
npm run lint
npm run typecheck
npm run test
npm run eval
npm run build
npm run build:next
```

`npm run eval` regenerates `docs/EVALUATION.md` and `evals/results.json`. It includes the required golden, edge and adversarial cases. Unit tests additionally cover scoring arithmetic, re-verification, human actions, request streaming, concurrency and mocked Bedrock failures. See [QA](docs/QA.md) for actual build and browser verification. These are fixture-based results; they are not live market or LLM accuracy metrics.

## Docker

```bash
cp .env.example .env
docker compose up -d --build
curl http://localhost:3000/api/session
```

The app binds to the host loopback by default; sessions survive container recreation in the named `sessions` volume. The image runs as UID 1001, has a healthcheck and includes only standalone runtime output and public assets. Docker was not available in the authoring environment, so image execution must be checked on a Docker-enabled machine; CI includes a Docker build gate.

## Amazon Lightsail deployment

Use a Lightsail Linux instance with Docker Engine and Compose installed, a static IP and enough RAM to build Next (4 GB is a practical starting point; deploy prebuilt images if using a smaller instance). Upload or clone this repository. Set `.env` with demo mode initially, then run Docker Compose as above. Keep the `sessions` volume backed up. Restrict SSH to your IP. Do not open port 3000 publicly.

For HTTPS, point your domain to the instance static IP, set `DOMAIN=your-domain.example` in `.env`, open Lightsail firewall ports 80/443, then:

```bash
docker compose --profile https up -d --build
```

Caddy obtains HTTPS certificates and proxies streaming responses. Before enabling paid Bedrock mode on a public URL, put the service behind authentication and an edge rate limiter, or restrict access for the demo. The supplied app is a session-isolated hackathon prototype, not an authenticated agency tenant system.

For a private rehearsal without a domain, forward the loopback-bound port:

```bash
ssh -L 3000:127.0.0.1:3000 ubuntu@YOUR_LIGHTSAIL_IP
```

Open `http://localhost:3000`. A Lightsail Container Service alternative needs durable external session storage because container filesystem state is ephemeral; use the VM + named-volume deployment for this version.

## Demo instructions

1. Click **Load Demo Scenario** and show the buyer profile, weighted property scores and tool trace.
2. Click **Try: S$1.7M, MRT within 5 minutes**. Show changed fields and retained destinations/lifestyle.
3. Select two **Compare** checkboxes, then click **Compare**.
4. Open **View details**, explain components and **Move to first · human override**.
5. Click **Approve shortlist**, then open `/debug` to show the audit record.
6. Submit `Budget SGD 100k, 4 bedrooms.` to demonstrate no-match escalation.
7. Reset and reload the demo for the next judge.

See [Demo script](DEMO_SCRIPT.md) and [video script](submission/DEMO_VIDEO_SCRIPT.md).

## GitHub and submission

GitHub is the source of truth:

[Skylarrr333/iss-show-me-your-agent](https://github.com/Skylarrr333/iss-show-me-your-agent)

Submission materials are in `submission/`: write-up, video narration, shot list and the remaining owner checklist. The repository does not fabricate video or AWS deployment evidence.

## Documentation

- [Repository audit](docs/AUDIT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security](docs/SECURITY.md)
- [Evaluation](docs/EVALUATION.md)
- [Data provenance](docs/DATA_PROVENANCE.md)
- [QA evidence](docs/QA.md)
- [Deployment status](docs/DEPLOYMENT.md)
- [Submission checklist](submission/SUBMISSION_CHECKLIST.md)

Technical references: [AWS Converse](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html), [Bedrock API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys.html), [Next.js self-hosting](https://nextjs.org/docs/app/guides/self-hosting), [Lightsail containers documentation](https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-container-services.html). Organiser-specific examples: [Starter Kit](https://github.com/kenken64/ShowMeYourAgent-Starter-Kit).

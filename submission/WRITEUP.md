# PropMatch Agent

**Team:** 303forward  
**Team code:** D1IZFT7E  
**Hackathon:** NUS-ISS Show Me Your Agents, powered by AWS, supported by Singapore Business Federation  
**Problem:** Property Recommendation

## 1. Goal & Scope Definition

Property agents need to reconcile buyers' budgets, location preferences, size and lifestyle with a changing set of listings. PropMatch is an agent-facing recommendation copilot. It converts a conversation into structured buyer memory and produces an evidence-backed shortlist for review. Business value is reduced manual reconciliation and clearer trade-off conversations. This version demonstrates the workflow; it does not claim measured productivity uplift. External client messaging, transactions, financing and eligibility decisions are out of scope.

## 2. Architecture & Reasoning Loop

One orchestrator owns explicit session state and a validated BuyerProfile. It reads existing requirements, merges the current turn, asks for clarification when needed, plans required tools, retrieves evidence, checks hard constraints, ranks candidates, re-verifies source rows and stops for human review. A second turn changing S$1.6M to S$1.7M and requiring MRT within five minutes preserves bedrooms, destinations and lifestyle. Trace records before/after field diffs. Demo mode uses deterministic interpretation; the Bedrock provider supports a bounded live parse/plan workflow. The policy layer constrains the model's plan to required evidence tools. No private chain-of-thought is displayed.

## 3. Tool Use & Integration

Six typed tools cover property search, commute estimation, nearby amenities, deterministic constraint checks, weighted ranking and structured comparison. Every input/output uses strict Zod schemas. ListingProvider, RoutingProvider, AmenitiesProvider and LLMProvider interfaces isolate data sources. Route tools are omitted when no destinations exist; amenities tools run only for requested categories. Each recommendation stores source/listing ID, timestamp and evidence. The AWS provider uses the documented Bedrock Converse REST contract; an undocumented organiser gateway is not assumed to share that schema.

## 4. Autonomy & Human-in-the-Loop

The agent autonomously retrieves, validates, ranks and suggests. It cannot approve or send business communications. The property agent can approve, reject, edit the shortlist, request alternatives or override ordering. Every override is recorded with the moved property, previous first property and original numeric score. Any edit revokes prior approval. If no candidate passes all hard constraints, PropMatch reports the conflict and asks which requirement may change. It never silently increases the budget or distance limit.

## 5. Safety, Security & Guardrails

Listing descriptions are untrusted data and never enter model instructions or ranking. Suspicious descriptions are quarantined in the audit trail. Strict schemas reject malformed model JSON and unsupported tool fields. Model-generated numerical changes are checked independently, and code rechecks exact budget/bedroom/size/MRT/availability limits before and after ranking. Provider IDs are re-read before recommendation and approval. No generic shell, SQL, URL-execution or transaction tool exists. Server-only credentials, private session storage, same-origin request checks and optimistic versioning support least privilege. Production identity, retention and edge abuse controls remain deployment hardening work; this is a hackathon prototype.

## 6. Observability & Evaluation

Every completed run persists a session ID, run ID, timestamp, profile changes, plan, tool parameters/results, constraints, ranking components, human decisions and errors. The activity panel summarizes actual events; `/debug` exposes full structured trace and JSON export. Tests cover the golden demo, dual commutes, lifestyle, persistent updates, comparison, no-match, ambiguity, contradictions, missing information, stale/unavailable listings, user/listing injection, budget bypass, unsupported IDs and malformed model output. `npm run eval` generates the actual measured report and machine-readable results. These fixture-based checks do not measure live LLM or market accuracy; see the accompanying EVALUATION.md for exact current counts.

## 7. Platform & Tooling Usage

The single TypeScript repository uses Next.js, React, Tailwind, Zod and explicit tool orchestration. The Next standalone Docker image targets a Lightsail VM with persistent session volume and optional Caddy HTTPS. The same App Router source has a Vinext/Workers target for private demo hosting with D1 storage. Bedrock endpoint, token, region and model/profile ID are environment-driven. Demo mode runs without API credentials, while live authentication/schema errors fail visibly. GitHub CI runs lint, typecheck, tests, eval, Next build and Docker build.

## Data and demonstration boundary

The application includes 72 clearly marked fictional Singapore listings across 12 areas, synthetic amenities and illustrative low-confidence travel estimates. A generated condominium image is reused as an explicitly labeled illustration. No official property dataset or organiser-specific JSON API schema was available during implementation. All actual property suitability, availability, eligibility and travel claims require real-provider verification.

## Reproduction and deliverables

Run `npm install`, then `npm run dev:next`. No key is required in demo mode. Run `npm run lint`, `npm run test`, `npm run eval` and `npm run build:next` for the primary quality gates. See README for environments, Docker and Lightsail deployment. Submission package includes this write-up, PDF, a demo video script, shot list, evaluation report and source repository.

## Submission links

- GitHub repository: to be supplied by team owner after pushing to their GitHub account.
- Demo video: to be supplied after recording and uploading.
- Private demo: deployment evidence is recorded in docs/DEPLOYMENT.md when published.
- AWS Lightsail evidence: to be supplied after deployment in the team's AWS account.

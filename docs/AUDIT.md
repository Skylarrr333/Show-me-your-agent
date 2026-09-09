# Repository audit — 9 September 2026

GitHub is the source of truth: https://github.com/Skylarrr333/iss-show-me-your-agent, branch `main`.

## Preservation

The supplied local directory initially contained only an unborn Git repository, no remote, and no source files. Fetching the requested origin restored the existing project at `1a2a7b418db6b52a619dd870e858b154cc1699a2`. The working tree was clean. `codex/prop-match-hardening` branches from that exact rollback point. No reset, clean, force push or discarded local work was used.

## Baseline

After installing the npm lockfile: lint passed; 19/19 tests and 15/15 eval cases passed (86 recommendation occurrences, zero hard-constraint violations). Typecheck, default dev, default build and the Next production build failed because `vite.config.ts` imported the absent `build/sites-vite-plugin`. Next compilation itself succeeded before typechecking failed. Network-restricted installation and local port binding required running with the appropriate environment permissions; these are environment failures, separate from source defects.

## Inventory and findings

- Next 16 / React 19 / TypeScript / Tailwind 4, npm lockfile. One App Router workspace; no second app.
- Four session/run/action/compare APIs. Typed BuyerProfile, six Zod tools, deterministic ranking and constraints already implemented.
- Four provider contracts, synthetic dataset (72 records), demo parser and AWS Converse provider already present. No live AWS credentials were supplied.
- Persistent Node JSON sessions and D1 adapter; optimistic concurrency and action audit events present.
- Three-panel UI, streaming activity, details, approval/rejection/override/alternatives, reset and no-match present.
- Compare data exists, but the table omitted amenities, component scores, weights, rationale and trade-offs.
- Clarification/guardrail branches retained old recommendations; the UI could show stale approval controls. Numeric edits were anchored, but nonnumeric hard-constraint removals were not.
- Demo parsing misinterpreted `not in Clementi` as both preferred and excluded; budget-minimum and shared-currency ranges were incomplete. Unsupported mandatory requirements could be ignored when mixed with recognized requirements.
- Tool schemas checked shape, but route destination/mode and amenity category/radius needed semantic output validation. Ranking trusted incoming constraint labels even when recomputing eligibility.
- Root/docs technical documents and submission checklists/scripts were duplicates. Canonical technical documents now live in `docs/`, submission-specific material lives in `submission/`, and README links to files that exist.
- `app/chatgpt-auth.ts`, `db/index.ts`, `examples/d1`, starter SVGs and unused UI catalog entries were starter remnants. Runtime storage directly uses prepared D1 statements. Existing database/schema config needs an actual session schema.
- `/trace` already reused `/debug`; no separate trace implementation to discard.
- Docker is multi-stage, non-root, with durable volume, runtime env and healthcheck. The host has no Docker executable; CI can validate the image.
- CI only built Next, so the broken Sites import/deployment path lacked its own build gate.

Changes and validation evidence are recorded in the commit history and [QA.md](QA.md). Canonical domain responsibilities remain in `agents/`, `providers/`, `schemas/`, `tools/` and `lib/`.

## Verified cleanup

A TypeScript import-graph walk from both rendered workspaces found exactly five reachable UI primitives: dialog, button, tabs, checkbox and skeleton. The 56 unreachable catalog entries and their unused mobile hook were removed after checking project/test imports. Unreferenced starter auth/db helpers, opt-in notes examples and three starter SVGs were also removed. All are recoverable from the Git checkpoint. The existing property illustration, active UI primitives and domain code were preserved.

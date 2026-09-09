# Security and guardrails

## Trust boundaries

Buyer messages and listing descriptions are untrusted. Model output is untrusted until schema validation. Only server-owned structured fields reach typed tools. The browser never supplies a BuyerProfile, score, candidate object or approval status; it supplies a message, current version, or allowed human action and ID. The server owns authoritative state.

## Implemented controls

- Strict Zod object schemas and bounds reject unexpected tool/model fields, malformed JSON, invalid coordinates, IDs, ranges and oversized input.
- User instruction-override patterns trigger a clarification checkpoint before any LLM call. This heuristic is only one layer, not a comprehensive injection classifier.
- Listing descriptions never enter LLM context, planning, ranking or executable code. Suspicious descriptions are audited. React escapes all displayed text.
- Only six domain tools exist. No model-accessible shell, raw SQL, generic URL fetching, filesystem operation or external messaging tool exists.
- Numeric constraints are enforced after retrieval, inside ranking, after provider re-read and at approval. Independent extraction anchors supported numeric edits. Excluded areas, property types and commute limits also cannot be removed or relaxed by valid-schema model output unless the buyer explicitly requests the change.
- Source IDs are verified against the provider; duplicate IDs and unsupported compare/override IDs are rejected. Route and amenity outputs must match the requested destination, mode, category and radius.
- The Bedrock endpoint is server configuration only, HTTPS-only, with credentials prohibited in the URL. Only documented Converse JSON is sent; auth headers and raw upstream errors are not logged.
- Session IDs are random UUID capabilities stored in HttpOnly SameSite cookies. Mutating JSON is limited by bytes while streaming. Cross-site browser requests are rejected, including through a reverse proxy. Payloads cannot choose arbitrary session IDs. Version checks prevent stale writes.
- Node files use private permissions and atomic writes; D1 statements are parameterized. Docker uses a non-root runtime user. `.env*`, session data and build caches are ignored by Git and Docker.
- Approval is an explicit human endpoint. Any shortlist/ranking edit resets approval. There is no send-to-client or transaction operation.

## Least privilege deployment

Grant a Bedrock credential only the model invocation scope needed for the selected model/profile. Do not expose the token in NEXT_PUBLIC variables or commit it. Run the public website behind HTTPS and authentication, with edge rate limits before enabling paid inference. The shipped Caddy example provides HTTPS and request-size limits; it does not implement user login or rate limiting. The app's 50-turn session cap is not an account-level abuse prevention system.

## Known limits

This is a hackathon prototype, not a production multi-tenant CRM. It has no identity-based agent roles, cross-device accounts, retention automation, encryption-at-rest policy, tamper-evident audit ledger or external monitoring integration. Possession of a session capability grants access to that session, so do not share exported traces containing its ID. Node process termination in the tiny lock-held interval can leave a lock file requiring operator recovery; D1 avoids local filesystem locks. In-flight traces commit at run completion, not durably event-by-event.

The independent numeric parser conservatively blocks existing-limit edits it cannot recognize. Other semantic prompt-injection variants and novel contradictory phrasings require broader live model evaluation. Synthetic scores and route estimates are not evidence of actual property suitability, eligibility or availability. HDB rows are fictional test records and no resale eligibility check is implemented. Agents must verify real records and domain requirements before real use.

## Adversarial regression evidence

See tests for user/listing injection, numeric and nonnumeric hard-constraint bypass attempts, stale recommendations, invalid/duplicate IDs, semantically wrong tool evidence, malformed model JSON, request limits and stale-write protection. See `docs/EVALUATION.md` for real results. Passing these cases is not a claim of universal injection resistance.

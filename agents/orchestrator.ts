import {
  Session,
  SessionSchema,
  Trace,
  ParseSchema,
  PlanSchema,
  Candidate,
  emptyProfile,
} from "../schemas";
import {
  changes,
  profileConflict,
  normalizeProfile,
  suspicious,
} from "../lib/profile";
import { getLLM } from "../providers/bedrock";
import {
  LLMProvider,
  ListingProvider,
  RoutingProvider,
  AmenitiesProvider,
} from "../providers/contracts";
import { destinations } from "../providers/synthetic";
import { getDataProviders, dataRevision, EvidenceUnavailableError } from "../providers/evidence";
import {
  validateProfileUpdate,
  unsupportedHardRequirement,
} from "../lib/profile-update";
import { requiredPlan } from "../providers/demo-llm";
import * as tools from "../tools";
import { lookup_market_comparables } from "../tools/market";
import { applyBriefConstraints, briefMessage, hasConstraints, type BriefConstraints } from "../lib/brief-input";
export function newSession(id = crypto.randomUUID()): Session {
  return {
    id,
    version: 0,
    profile: emptyProfile(),
    messages: [],
    trace: [],
    recommendations: [],
    shortlist: [],
    rejected: [],
    status: "empty",
    notice:
      "Describe your buyers, then let the agent build an evidence-backed shortlist.",
    mode: getLLM().mode,
    lastRunId: null,
    updatedAt: new Date().toISOString(),
  };
}
export function event(
  s: Session,
  stage: Trace["stage"],
  summary: string,
  data?: unknown,
): Trace {
  const t: Trace = {
    id: crypto.randomUUID(),
    runId: s.lastRunId ?? crypto.randomUUID(),
    sessionId: s.id,
    timestamp: new Date().toISOString(),
    stage,
    summary,
    ...(data === undefined ? {} : { data }),
  };
  s.trace.push(t);
  return t;
}
export type Dependencies = {
  llm?: LLMProvider;
  listings?: ListingProvider;
  routing?: RoutingProvider;
  amenities?: AmenitiesProvider;
};
export async function runAgent(
  old: Session,
  message: string,
  emit: (t: Trace) => void = () => {},
  deps: Dependencies = {},
  options: { refresh?: boolean; constraints?: BriefConstraints } = {},
): Promise<Session> {
  const s = SessionSchema.parse(structuredClone(old));
  s.lastRunId = crypto.randomUUID();
  s.updatedAt = new Date().toISOString();
  if (!options.refresh) s.messages.push({ role: "user", content: briefMessage(message, options.constraints), timestamp: s.updatedAt });
  const add = (stage: Trace["stage"], summary: string, data?: unknown) =>
    emit(event(s, stage, summary, data));
  const llm = deps.llm ?? getLLM();
  s.mode = llm.mode;
  const start = Date.now();
  s.recommendations = [];
  s.shortlist = [];
  s.marketEvidence = undefined;
  s.rejected = options.refresh ? [...old.rejected] : [];
  try {
    const providers = getDataProviders(s);
    const listings = deps.listings ?? providers.listings;
    const routing = deps.routing ?? providers.routing;
    const amenities = deps.amenities ?? providers.amenities;
    s.dataMode = providers.mode;
    if (!deps.listings && !deps.routing && !deps.amenities) s.dataRevision = await dataRevision(s);
    add("UNDERSTAND", "Reading request and existing buyer state", {
      profileVersion: s.version,
      mode: llm.mode,
    });
    if (suspicious(message)) {
      s.status = "clarification";
      s.notice =
        "Instruction override blocked. Existing buyer constraints remain unchanged. Please state only buyer requirements.";
      add("GUARDRAIL", s.notice);
      return finish();
    }
    const base = applyBriefConstraints(s.profile, options.constraints);
    const formConflict = profileConflict(base);
    if (formConflict) {
      s.status = "clarification";
      s.notice = formConflict;
      add("HUMAN", formConflict);
      return finish();
    }
    const structuredOnly = !message.trim() && hasConstraints(options.constraints);
    const parsed = ParseSchema.parse(options.refresh || structuredOnly
      ? { profile: base, clarification: null, summary: "Using structured buyer profile" }
      : await llm.parse(message, base));
    const next = applyBriefConstraints(normalizeProfile(parsed.profile), options.constraints);
    const diff = changes(s.profile, next);
    // Independent numeric extraction anchors explicit limits even if a model tries to relax them.
    const { DemoLLMProvider } = await import("../providers/demo-llm");
    const anchor = await new DemoLLMProvider().parse(message, base);
    if (!options.refresh) validateProfileUpdate(base, next, applyBriefConstraints(anchor.profile, options.constraints));
    const unsupportedHard = unsupportedHardRequirement(message);
    if (unsupportedHard) {
      s.status = "clarification";
      s.notice = unsupportedHard;
      add("HUMAN", s.notice);
      return finish();
    }
    const conflict = profileConflict(next);
    if (conflict) {
      s.status = "clarification";
      s.notice = conflict;
      add("HUMAN", "Contradictory request: previous valid state retained", {
        conflict,
      });
      return finish();
    }
    s.profile = next;
    add(
      "STATE",
      diff.length
        ? "Buyer profile updated; previous preferences retained"
        : "Buyer profile unchanged",
      { changes: diff },
    );
    const unsupported = s.profile.commuteDestinations.find(
      (d) => !destinations[d.place],
    );
    // A conflicting numeric suggestion in text cannot invalidate explicit form limits.
    const clarification = hasConstraints(options.constraints) && parsed.clarification === profileConflict(parsed.profile)
      ? null : parsed.clarification;
    if (clarification || next.unknownFields.length || unsupported) {
      s.status = "clarification";
      s.recommendations = [];
      s.shortlist = [];
      s.notice =
        clarification ??
        (unsupported
          ? `Please clarify ${unsupported.place}; supported demo destinations are NUS, Raffles Place, Jurong East and Changi Airport.`
          : "Please provide a maximum SGD budget and minimum bedrooms.");
      add("HUMAN", s.notice);
      return finish();
    }
    s.recommendations = [];
    s.shortlist = [];
    const proposed = PlanSchema.parse(options.refresh || structuredOnly ? requiredPlan(s.profile) : await llm.plan(s.profile));
    const required = requiredPlan(s.profile);
    const selected = required.tools;
    add("PLAN", required.summary, {
      proposedTools: proposed.tools,
      selectedTools: selected,
      policy:
        "Minimum required evidence tools enforced; unnecessary calls omitted.",
    });
    async function call<T>(
      name: string,
      input: unknown,
      fn: () => Promise<T> | T,
    ): Promise<T> {
      const started = Date.now();
      const result = await fn();
      const t = event(s, "TOOL", `${name}()`, {
        parameters: input,
        result: Array.isArray(result) ? { count: result.length } : result,
      });
      t.durationMs = Date.now() - started;
      emit(t);
      return result;
    }
    if (selected.includes("lookup_market_comparables")) {
      s.marketEvidence = await call("lookup_market_comparables", {
        budget: s.profile.budget, areas: s.profile.locations, size: s.profile.property,
        purpose: "Historical HDB context only; never current inventory",
      }, () => lookup_market_comparables(s.profile));
    }
    const search = {
      budget: s.profile.budget,
      bedrooms: s.profile.property.minBedrooms,
      propertyType: s.profile.property.propertyTypes,
      areas: [],
      availability: "available" as const,
    };
    const found = await call("search_properties", search, () =>
      tools.search_properties(search, listings),
    );
    const evaluated: Candidate[] = [];
    for (const p of found) {
      if (s.rejected.includes(p.id)) continue;
      if (suspicious(p.description))
        add(
          "GUARDRAIL",
          "Listing description quarantined; never passed to model",
          { listingId: p.id },
        );
      const preliminary = tools.check_constraints({
        property: p,
        profile: { ...s.profile, commuteDestinations: [] },
      });
      if (!preliminary.passed) {
        evaluated.push({
          property: p,
          commutes: [],
          amenities: [],
          constraints: preliminary,
        });
        continue;
      }
      const coordinates = { latitude: p.latitude, longitude: p.longitude };
      const commutes = [];
      if (selected.includes("calculate_commute"))
        for (const d of s.profile.commuteDestinations) {
          const input = {
            coordinates,
            destination: d.place,
            mode:
              s.profile.transport.hasCar === true
                ? ("car" as const)
                : ("transit" as const),
          };
          try { commutes.push(
            await call("calculate_commute", { listingId: p.id, ...input }, () =>
              tools.calculate_commute(input, routing),
            ),
          ); } catch (error) {
            if (!(error instanceof EvidenceUnavailableError)) throw error;
            add("VERIFY", "Requested route has no current evidence; not estimated", { listingId: p.id, destination: d.place });
          }
        }
      let nearby: Candidate["amenities"] = [];
      if (selected.includes("find_nearby_amenities")) {
        const categories = Object.entries(s.profile.lifestyle)
          .filter(([k, v]) => k !== "quiet" && v)
          .map(([k]) => k) as Candidate["amenities"][number]["category"][];
        const input = { coordinates, categories, radius: 2000 };
        nearby = await call(
          "find_nearby_amenities",
          { listingId: p.id, ...input },
          () => tools.find_nearby_amenities(input, amenities),
        );
      }
      const constraints = tools.check_constraints({
        property: p,
        profile: s.profile,
        commutes,
      });
      evaluated.push({ property: p, commutes, amenities: nearby, constraints });
    }
    add("VERIFY", "Hard constraints checked", {
      tool: "check_constraints",
      results: evaluated.map((c) => ({
        listingId: c.property.id,
        ...c.constraints,
      })),
    });
    const ranked = await call(
      "rank_properties",
      {
        candidateIds: evaluated.map((c) => c.property.id),
        profileVersion: s.version + 1,
      },
      () =>
        tools.rank_properties({ candidates: evaluated, profile: s.profile }),
    );
    add("RANK", `${ranked.length} eligible properties ranked`, {
      scores: ranked.map((r) => ({
        listingId: r.property.id,
        score: r.score,
        components: r.components,
        weights: r.weights,
      })),
    });
    // Re-read listing provider after ranking. A changed or withdrawn row cannot enter the shortlist.
    for (const candidate of ranked) {
      const latest = await listings.get(candidate.property.id);
      if (
        !latest ||
        JSON.stringify(latest) !== JSON.stringify(candidate.property) ||
        !tools.check_constraints({
          property: latest,
          profile: s.profile,
          commutes: candidate.commutes,
        }).passed
      ) {
        add("VERIFY", "Listing changed during verification; removed", {
          listingId: candidate.property.id,
        });
        continue;
      }
      s.recommendations.push(candidate);
      if (s.recommendations.length === 8) break;
    }
    if (!s.recommendations.length) {
      s.status = "no-match";
      const all = await call(
        "search_properties",
        { purpose: "conflict diagnosis only" },
        () =>
          tools.search_properties(
            {
              budget: { min: null, max: null },
              bedrooms: null,
              propertyType: [],
              areas: [],
              availability: "all",
            },
            listings,
          ),
      );
      const counts: Record<string, number> = {};
      for (const p of all) {
        const evaluatedCandidate = evaluated.find(
          (candidate) => candidate.property.id === p.id,
        );
        const result = evaluatedCandidate?.constraints ??
          tools.check_constraints({
            property: p,
            profile: { ...s.profile, commuteDestinations: [] },
          });
        for (const v of result.violations)
          counts[v] = (counts[v] ?? 0) + 1;
      }
      s.notice =
        "No listing currently satisfies all hard constraints. Would you allow a higher budget, longer MRT walk, different area or smaller size? No limits have been relaxed.";
      add("HUMAN", s.notice, { conflicts: counts, limitsUnchanged: true });
    } else {
      s.shortlist = s.recommendations.slice(0, 3).map((r) => r.property.id);
      s.status = "waiting";
      s.notice = `${s.recommendations.length} candidates pass the recorded hard constraints. Top ${s.shortlist.length} ready for your review. ${s.dataMode === "file" ? "Imported evidence snapshots; review unknown facts and source times." : "Synthetic demonstration data."}`;
      add("RECOMMEND", `Top ${s.shortlist.length} generated`, {
        listingIds: s.shortlist,
        evidence: s.recommendations.slice(0, 3).map((r) => r.evidence),
      });
      add("HUMAN", "Waiting for Agent Approval", { shortlist: s.shortlist });
    }
  } catch (error) {
    s.profile = old.profile;
    s.recommendations = [];
    s.shortlist = [];
    s.status = "error";
    s.notice =
      error instanceof Error &&
      /^(Bedrock|DeepSeek|Gateway|Model numeric|Unconfirmed|Unsupported)/.test(error.message)
        ? error.message
        : "Run stopped safely: invalid provider output or tool failure. Buyer profile retained; retry or reset demo.";
    add("ERROR", s.notice, { category: "VALIDATION_OR_PROVIDER_ERROR" });
  }
  return finish();
  function finish() {
    for (const metric of llm.drainMetrics?.() ?? [])
      add("TOOL", `${llm.mode}_model_call()`, metric);
    s.messages.push({
      role: "assistant",
      content: s.notice,
      timestamp: new Date().toISOString(),
    });
    s.updatedAt = new Date().toISOString();
    add("STATE", "Run completed and state ready to persist", {
      elapsedMs: Date.now() - start,
      status: s.status,
    });
    return SessionSchema.parse(s);
  }
}

import { mkdir, writeFile } from "node:fs/promises";
import { newSession, runAgent } from "../agents/orchestrator";
import { DemoLLMProvider, requiredPlan } from "../providers/demo-llm";
import { DEMO, UPDATE } from "../schemas";
import { properties, SyntheticListingProvider } from "../providers/synthetic";
import { verifyCurrentListings } from "../agents/verification";
import { refreshAgent } from "../agents/refresh";
import { humanAction } from "../agents/human";
import { marketMetadata } from "../tools/market";
const llm = new DemoLLMProvider();
const basic = await runAgent(newSession(), DEMO, () => {}, { llm });
const update = await runAgent(basic, UPDATE, () => {}, { llm });
const chinese = await runAgent(newSession(), "预算160万新币，两间卧室，我们都不开车，分别在NUS和Raffles Place工作，喜欢安静和公园。", () => {}, { llm });
const proposed: string[] = [];
const plannerProbe = await runAgent(newSession(), DEMO, () => {}, { llm: {
  mode: "demo", parse: llm.parse.bind(llm),
  async plan() { proposed.push("search_properties"); return { tools: ["search_properties"], summary: "probe" }; },
} });
const changedRows = properties.map((p) => p.id === basic.shortlist[0] ? { ...p, availability: "unavailable" as const } : p);
let withdrawnApprovalBlocked = false;
try { await verifyCurrentListings(basic, basic.shortlist, new SyntheticListingProvider(changedRows)); }
catch { withdrawnApprovalBlocked = true; }
const approved = humanAction(basic, { action: "approve", version: basic.version });
const refreshed = await refreshAgent(approved, { kind: "withdraw", propertyId: approved.shortlist[0] });
const report = {
  timestamp: new Date().toISOString(), mode: "demo", synthetic: true,
  checks: {
    initialRecommendation: { passed: basic.status === "waiting", shortlist: basic.shortlist },
    multiTurnUpdate: { passed: update.profile.budget.max === 1700000 && update.profile.transport.maxMrtWalkingMinutes === 5 && update.profile.commuteDestinations.length === 2 },
    withdrawnApprovalBlocked: { passed: withdrawnApprovalBlocked },
    changedSourceReplans: { passed: refreshed.changed && refreshed.session.status === "waiting" && !refreshed.session.shortlist.includes(approved.shortlist[0]) && JSON.stringify(refreshed.session.profile) === JSON.stringify(approved.profile) },
    publicHistoricalData: { passed: marketMetadata.count > 1000, metadata: marketMetadata },
  },
  discoveredLimitations: {
    chineseBrief: { expectedForReadiness: "waiting with budget=1600000 and minBedrooms=2", actual: {
      status: chinese.status, budget: chinese.profile.budget.max, bedrooms: chinese.profile.property.minBedrooms,
    }, ready: chinese.status === "waiting" && chinese.profile.budget.max === 1600000 && chinese.profile.property.minBedrooms === 2 },
    llmPlanControlsExecution: { ready: false, note: "Code always uses requiredPlan(profile).tools. LLM proposal is recorded but does not choose the executed plan.",
      proposed, policySelected: requiredPlan(plannerProbe.profile).tools },
    proactiveListingRefresh: { ready: true, note: "Manual refresh and optional 30-second checks while the page is open and visible. No always-on server scheduler or external listing subscription. Demo events are explicitly simulated." },
    liveData: { ready: false, note: "Default listing, routing and amenities providers are synthetic." },
  },
};
await mkdir("evals", { recursive: true });
await writeFile("evals/readiness-results.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (Object.values(report.checks).some((c) => !c.passed)) process.exitCode = 1;

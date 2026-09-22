import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { emptyProfile, type Candidate, type BuyerProfile } from "../schemas";
import { normalizeProfile } from "../lib/profile";
import { properties, SyntheticRoutingProvider } from "../providers/synthetic";
import { check_constraints, rank_properties } from "../tools";
import { FEATURES, dot, evaluate, features, fit, ModelSchema, pairs, rerank,
  validateDataset, type Dataset, type Group } from "./ranker";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const args = process.argv.slice(2);
function argument(name: string, fallback: string) {
  const i = args.indexOf(name);
  if (i < 0) return fallback;
  if (!args[i + 1] || args[i + 1].startsWith("--")) throw new Error(`Missing ${name} value`);
  return args[i + 1];
}
for (let i = 0; i < args.length; i += 2)
  if (!["--data", "--out"].includes(args[i])) throw new Error(`Unknown argument ${args[i]}`);
const output = argument("--out", "training/artifacts");
const dataPath = argument("--data", "");
const routing = new SyntheticRoutingProvider();
let seed = 20260922;
function random() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 4294967296;
}
const pick = <T,>(values: T[]) => values[Math.floor(random() * values.length)];

async function candidatesFor(profile: BuyerProfile, listingIds?: Set<string>): Promise<Candidate[]> {
  const result: Candidate[] = [];
  for (const property of properties) {
    if (listingIds && !listingIds.has(property.id)) continue;
    const commutes = await Promise.all(profile.commuteDestinations.map((d) =>
      routing.route(property, d.place, profile.transport.hasCar ? "car" : "transit")));
    const amenities = property.amenities.filter((a) => profile.lifestyle[a.category] && a.distanceMeters <= 2000);
    result.push({ property, commutes, amenities,
      constraints: check_constraints({ property, profile, commutes }) });
  }
  return result;
}

async function syntheticDataset(): Promise<Dataset> {
  const areas = [...new Set(properties.map((p) => p.area))];
  const groups: Group[] = [];
  const usedProfiles = new Set<string>();
  // Hold out entire areas, as well as buyer profiles; no listing IDs cross splits.
  const splitAreas = { train: areas.slice(0, 8), validation: areas.slice(8, 10), test: areas.slice(10) };
  for (const split of ["train", "validation", "test"] as const) {
    const desired = split === "train" ? 120 : 40;
    let accepted = 0;
    for (let attempt = 0; accepted < desired && attempt < 10000; attempt++) {
      const p = emptyProfile();
      p.budget.max = pick([1500000, 1600000, 1700000, 1800000, 2000000, 2300000]);
      p.property.minBedrooms = pick([1, 2, 2, 3]);
      p.property.minSize = pick([null, 700, 850]);
      p.transport.hasCar = pick([false, false, true]);
      p.transport.maxMrtWalkingMinutes = pick([null, 5, 8, 12]);
      p.locations.preferredAreas = random() < 0.5 ? [pick(splitAreas[split])] : [];
      p.lifestyle.quiet = random() < 0.7;
      p.lifestyle.parks = random() < 0.7;
      p.lifestyle.food = random() < 0.5;
      p.lifestyle.schools = random() < 0.3;
      p.lifestyle.shopping = random() < 0.3;
      p.lifestyle.nightlife = random() < 0.2;
      p.commuteDestinations = pick([[], ["NUS"], ["Raffles Place"], ["NUS", "Raffles Place"], ["Jurong East", "Changi Airport"]])
        .map((place) => ({ place, priority: pick<"high" | "medium">(["high", "medium"]), maxTravelMinutes: null }));
      const profile = normalizeProfile(p);
      const profileHash = sha(JSON.stringify(profile));
      if (usedProfiles.has(profileHash)) continue;
      const listingIds = new Set(properties.filter((row) => splitAreas[split].includes(row.area)).map((row) => row.id));
      const candidates = await candidatesFor(profile, listingIds);
      const ranked = rank_properties({ candidates, profile });
      if (ranked.length < 3) continue;
      // Explicitly invented preference policy, not expert truth. Only tests learnability.
      const teacher = [0.6, 0.35, 1.5, 0.9, 0.85, 0.4, 0.2, 0.6];
      const rows = ranked.map((row) => ({
        listingId: row.property.id, listingGroup: row.property.area,
        features: features(row, profile), baseline: row.score, relevance: 0,
      })).sort((a, b) => dot(b.features, teacher) - dot(a.features, teacher));
      rows.forEach((row, i) => { row.relevance = 3 - Math.min(3, Math.floor(i * 4 / rows.length)); });
      // Do not leave the rows in label order; ties use listing ID in evaluation.
      rows.sort((a, b) => a.listingId.localeCompare(b.listingId));
      groups.push({ buyerId: `synthetic-${split}-${accepted + 1}`, profileHash, split, rows });
      usedProfiles.add(profileHash);
      accepted++;
    }
    if (accepted !== desired) throw new Error(`Could not generate ${split}`);
  }
  return { schemaVersion: 1, labelSource: "synthetic-policy",
    description: "Fictional listings and algorithmic relevance labels. Pipeline smoke test only; no human feedback, LLM fine-tuning or market accuracy evidence.", groups };
}

const data = validateDataset(dataPath ? JSON.parse(await readFile(dataPath, "utf8")) : await syntheticDataset());
const canonicalData = JSON.stringify(data, null, 2) + "\n";
const train = data.groups.filter((g) => g.split === "train");
const validation = data.groups.filter((g) => g.split === "validation");
const test = data.groups.filter((g) => g.split === "test");
const trials = [0.0001, 0.001, 0.01].map((l2) => {
  const weights = fit(train, l2);
  return { l2, weights, validation: evaluate(validation, (r) => dot(r.features, weights)) };
}).sort((a, b) => b.validation.ndcgAt3 - a.validation.ndcgAt3 ||
  (b.validation.pairwiseAgreement ?? 0) - (a.validation.pairwiseAgreement ?? 0) || b.l2 - a.l2);
const chosen = trials[0];
const model = ModelSchema.parse({ schemaVersion: 1, kind: "nonnegative-pairwise-logistic",
  features: [...FEATURES], weights: chosen.weights, trainedOn: data.labelSource,
  datasetSha256: sha(canonicalData), epochs: 500, l2: chosen.l2,
  limitation: data.labelSource === "synthetic-policy"
    ? "Synthetic-policy distillation only. Not a trained LLM; no demonstrated human preference or business benefit. Do not enable in production."
    : "Label provenance is caller-declared. Independently review labels and live evaluation before deployment.",
});
const report = {
  labelSource: data.labelSource, datasetSha256: model.datasetSha256,
  sampleCounts: Object.fromEntries(["train", "validation", "test"].map((split) => {
    const groups = data.groups.filter((g) => g.split === split);
    return [split, { buyers: groups.length, candidateRows: groups.reduce((n, g) => n + g.rows.length, 0),
      uniqueListings: new Set(groups.flatMap((g) => g.rows.map((r) => r.listingId))).size,
      pairs: pairs(groups).length }];
  })),
  splitPolicy: "Disjoint buyer IDs, profile hashes, listing IDs and building/area groups. Validate before fitting.",
  selectedL2: chosen.l2,
  validationTrials: trials.map(({ l2, validation }) => ({ l2, ...validation })),
  heldOutTest: { ruleBaseline: evaluate(test, (r) => r.baseline), learned: evaluate(test, (r) => dot(r.features, model.weights)) },
  limitation: model.limitation,
};
await mkdir(output, { recursive: true });
await writeFile(join(output, "dataset.json"), canonicalData);
await writeFile(join(output, "ranker.json"), JSON.stringify(model, null, 2) + "\n");
await writeFile(join(output, "metrics.json"), JSON.stringify(report, null, 2) + "\n");
// A separate, realistic brief demonstrates guarded inference; it is not evaluation evidence.
const profile = normalizeProfile({ ...emptyProfile(), budget: { min: null, max: 1700000 },
  property: { minBedrooms: 2, propertyTypes: [], minSize: null, maxSize: null },
  commuteDestinations: [{ place: "NUS", priority: "high", maxTravelMinutes: null }, { place: "Raffles Place", priority: "high", maxTravelMinutes: null }],
  transport: { hasCar: false, mrtPriority: "high", maxMrtWalkingMinutes: 5 },
  lifestyle: { quiet: true, parks: true, food: false, shopping: false, schools: false, nightlife: false },
});
const demoCandidates = await candidatesFor(profile);
const demo = rerank(demoCandidates, profile, model).slice(0, 3);
await writeFile(join(output, "prediction-example.json"), JSON.stringify({
  synthetic: true, experimental: true, profile,
  top3: demo.map((r) => ({ id: r.property.id, name: r.property.name, ruleFitScore: r.score,
    learnedUtility: r.learnedUtility, constraints: r.constraints, evidence: r.evidence })),
}, null, 2) + "\n");
const baseline = report.heldOutTest.ruleBaseline, learned = report.heldOutTest.learned;
await writeFile(join(output, "REPORT.md"), `# Local ranking experiment\n\nLabel source: **${data.labelSource}**. ${model.limitation}\n\n| Held-out test metric | Existing rules | Learned ranker |\n|---|---:|---:|\n| NDCG@3 | ${baseline.ndcgAt3.toFixed(4)} | ${learned.ndcgAt3.toFixed(4)} |\n| Pairwise agreement (ties = 0.5) | ${baseline.pairwiseAgreement?.toFixed(4)} | ${learned.pairwiseAgreement?.toFixed(4)} |\n\n${test.length} held-out buyer scenarios; ${learned.comparablePairs} comparable pairs. Higher scores on synthetic labels mean closer agreement with the invented policy, not better real recommendations.\n\nTraining uses train only; L2 is chosen on validation; test is evaluated after selection. No IDs or raw descriptions enter model features. Source data hash: \`${model.datasetSha256}\`. Rerun with \`npm run train:ranker\`.\n\nProduction UI still uses the original rules. \`prediction-example.json\` demonstrates the experimental scorer after fresh hard-constraint filtering. Provider freshness and human approval must still be applied by the application's orchestrator before any future live integration.\n`);
console.log(JSON.stringify(report, null, 2));

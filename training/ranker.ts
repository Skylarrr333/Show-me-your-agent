import { z } from "zod";
import type { BuyerProfile, Candidate, Ranked } from "../schemas";
import { rank_properties } from "../tools";

// Experimental offline reranker. Production ranking is deliberately unchanged.
export const FEATURES = [
  "budget", "property", "commute", "transport", "lifestyle", "location",
  "amenities", "worstCommuteFit",
] as const;
const vector = z.array(z.number().finite().min(0).max(1)).length(FEATURES.length);
export const GroupSchema = z.object({
  buyerId: z.string().min(1),
  profileHash: z.string().min(1),
  split: z.enum(["train", "validation", "test"]),
  rows: z.array(z.object({
    listingId: z.string().min(1),
    listingGroup: z.string().min(1),
    features: vector,
    baseline: z.number().finite().min(0).max(100),
    relevance: z.number().int().min(0).max(3),
  }).strict()).min(3),
}).strict();
export const DatasetSchema = z.object({
  schemaVersion: z.literal(1),
  labelSource: z.enum(["synthetic-policy", "human-reviewed"]),
  description: z.string().min(1),
  groups: z.array(GroupSchema).min(3),
}).strict();
export type Group = z.infer<typeof GroupSchema>;
export type Dataset = z.infer<typeof DatasetSchema>;
export const ModelSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("nonnegative-pairwise-logistic"),
  features: z.array(z.string()).refine(
    (names) => JSON.stringify(names) === JSON.stringify(FEATURES),
    "Model feature names/order do not match the runtime",
  ),
  weights: z.array(z.number().finite().min(0).max(100)).length(FEATURES.length),
  trainedOn: z.enum(["synthetic-policy", "human-reviewed"]),
  datasetSha256: z.string().regex(/^[a-f0-9]{64}$/),
  epochs: z.number().int().positive(),
  l2: z.number().finite().positive(),
  limitation: z.string(),
}).strict();
export type Model = z.infer<typeof ModelSchema>;

export function features(row: Ranked, profile: BuyerProfile): number[] {
  const total = Object.values(row.weights).reduce((a, b) => a + b, 0);
  // First seven reproduce the unrounded rule score when multiplied by 100.
  const base = FEATURES.slice(0, 7).map((name) =>
    row.components[name] * row.weights[name] / total / 100,
  );
  const complete = profile.commuteDestinations.length > 1 &&
    profile.commuteDestinations.every((d) => row.commutes.some((c) => c.destination === d.place));
  const minutes = profile.commuteDestinations.map((d) =>
    row.commutes.find((c) => c.destination === d.place)?.travelMinutes ?? 0,
  );
  return vector.parse([...base, complete ? Math.max(0, 1 - Math.max(...minutes) / 90) : 0]);
}
export const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i], 0);

/** Always recompute hard eligibility and features from current candidate facts. */
export function rerank(candidates: Candidate[], profile: BuyerProfile, rawModel: unknown) {
  const model = ModelSchema.parse(rawModel);
  return rank_properties({ candidates, profile }).map((row) => ({
    ...row,
    // This utility is not a percentage, probability, confidence or the existing fit score.
    learnedUtility: dot(features(row, profile), model.weights),
  })).sort((a, b) => b.learnedUtility - a.learnedUtility ||
    a.property.price - b.property.price || a.property.id.localeCompare(b.property.id));
}

export function validateDataset(input: unknown): Dataset {
  const data = DatasetSchema.parse(input);
  const partitions = new Map<string, string>();
  const buyers = new Set<string>();
  for (const group of data.groups) {
    if (buyers.has(group.buyerId)) throw new Error("Duplicate buyer group");
    buyers.add(group.buyerId);
    if (new Set(group.rows.map((r) => r.listingId)).size !== group.rows.length)
      throw new Error("Duplicate listing within buyer group");
    const keys = [`buyer:${group.buyerId}`, `profile:${group.profileHash}`,
      ...group.rows.flatMap((r) => [`listing:${r.listingId}`, `building:${r.listingGroup}`])];
    for (const key of keys) {
      const existing = partitions.get(key);
      if (existing && existing !== group.split) throw new Error(`Split leakage: ${key}`);
      partitions.set(key, group.split);
    }
  }
  for (const split of ["train", "validation", "test"] as const) {
    const groups = data.groups.filter((g) => g.split === split);
    if (!groups.length || !pairs(groups).length) throw new Error(`No labeled comparisons in ${split}`);
  }
  return data;
}

export function pairs(groups: Group[]) {
  const result: number[][] = [];
  for (const group of groups) {
    for (let i = 0; i < group.rows.length; i++) {
      for (let j = i + 1; j < group.rows.length; j++) {
        const a = group.rows[i], b = group.rows[j];
        if (a.relevance === b.relevance) continue;
        const direction = Math.sign(a.relevance - b.relevance);
        result.push(a.features.map((x, k) => direction * (x - b.features[k])));
      }
    }
  }
  return result;
}

export function fit(groups: Group[], l2: number, epochs = 500) {
  const comparisons = pairs(groups);
  if (!comparisons.length) throw new Error("No training pairs");
  const weights = FEATURES.map(() => 0);
  for (let epoch = 0; epoch < epochs; epoch++) {
    const gradient = weights.map((w) => l2 * w);
    for (const delta of comparisons) {
      const error = -1 / (1 + Math.exp(Math.min(60, dot(weights, delta))));
      delta.forEach((x, k) => { gradient[k] += error * x / comparisons.length; });
    }
    weights.forEach((w, k) => { weights[k] = Math.max(0, w - 4 * gradient[k]); });
  }
  return weights;
}

export function evaluate(groups: Group[], score: (r: Group["rows"][number]) => number) {
  if (!groups.length) throw new Error("Empty evaluation split");
  let ndcg = 0, agreement = 0, compared = 0;
  const gain = (rows: Group["rows"]) => rows.slice(0, 3).reduce(
    (sum, r, i) => sum + (2 ** r.relevance - 1) / Math.log2(i + 2), 0,
  );
  for (const group of groups) {
    const ordered = [...group.rows].sort((a, b) => score(b) - score(a) || a.listingId.localeCompare(b.listingId));
    const ideal = [...group.rows].sort((a, b) => b.relevance - a.relevance);
    const idcg = gain(ideal);
    ndcg += idcg ? gain(ordered) / idcg : 1;
    for (let i = 0; i < group.rows.length; i++) {
      for (let j = i + 1; j < group.rows.length; j++) {
        const a = group.rows[i], b = group.rows[j];
        if (a.relevance === b.relevance) continue;
        const margin = (score(a) - score(b)) * Math.sign(a.relevance - b.relevance);
        agreement += margin > 0 ? 1 : margin === 0 ? 0.5 : 0;
        compared++;
      }
    }
  }
  return { groups: groups.length, comparablePairs: compared, ndcgAt3: ndcg / groups.length,
    pairwiseAgreement: compared ? agreement / compared : null };
}

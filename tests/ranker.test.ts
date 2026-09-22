import test from "node:test";
import assert from "node:assert/strict";
import { emptyProfile } from "../schemas";
import { properties } from "../providers/synthetic";
import { FEATURES, evaluate, fit, dot, rerank, validateDataset } from "../training/ranker";
import type { Dataset, Group } from "../training/ranker";

const vec = (x: number) => [x, ...Array(7).fill(0)];
function dataset(): Dataset {
  return { schemaVersion: 1, labelSource: "synthetic-policy", description: "test fixture",
    groups: (["train", "validation", "test"] as const).map((split) => ({
      buyerId: split, profileHash: split, split,
      rows: [0.1, 0.5, 0.9].map((v, i) => ({ listingId: `${split}-${i}`, listingGroup: split,
        features: vec(v), baseline: (1 - v) * 100, relevance: i })),
    })),
  };
}
test("ranker learns held-out preferences and ties receive half credit", () => {
  const data = validateDataset(dataset());
  const weights = fit([data.groups[0]], 0.001, 100);
  const scores = evaluate([data.groups[2]], (r) => dot(r.features, weights));
  assert.equal(scores.ndcgAt3, 1);
  assert.equal(scores.pairwiseAgreement, 1);
  assert.equal(evaluate([data.groups[2]], () => 0).pairwiseAgreement, 0.5);
});
test("training rejects entity leakage and unreviewed labels", () => {
  for (const field of ["listingId", "listingGroup"] as const) {
    const data = dataset();
    data.groups[1].rows[0][field] = data.groups[0].rows[0][field];
    assert.throws(() => validateDataset(data), /Split leakage/);
  }
  const sameProfile = dataset();
  sameProfile.groups[2].profileHash = sameProfile.groups[0].profileHash;
  assert.throws(() => validateDataset(sameProfile), /Split leakage/);
  const unlabeled = dataset();
  (unlabeled.groups[0].rows[0] as unknown as { relevance: null }).relevance = null;
  assert.throws(() => validateDataset(unlabeled));
});
test("experimental inference cannot rank an over-budget, stale or withdrawn listing", () => {
  const p = emptyProfile();
  p.budget.max = 1600000;
  p.property.minBedrooms = 2;
  const eligible = { ...properties[1], price: 1500000, bedrooms: 2 };
  const rows = [eligible, { ...eligible, id: "PM-090", price: 9999999 },
    { ...eligible, id: "PM-091", availability: "unavailable" as const },
    { ...eligible, id: "PM-092", updatedAt: "2025-01-01T00:00:00.000Z" }];
  const candidates = rows.map((property) => ({ property, commutes: [], amenities: [],
    constraints: { passed: true, violations: [], warnings: [] } }));
  const model = { schemaVersion: 1, kind: "nonnegative-pairwise-logistic", features: [...FEATURES],
    weights: Array(8).fill(100), trainedOn: "synthetic-policy", datasetSha256: "0".repeat(64),
    epochs: 1, l2: 0.01, limitation: "test only" };
  assert.deepEqual(rerank(candidates, p, model).map((r) => r.property.id), [eligible.id]);
  assert.throws(() => rerank(candidates, p, { ...model, features: [...FEATURES].reverse() }));
  assert.throws(() => rerank(candidates, p, { ...model, weights: Array(8).fill(NaN) }));
});
test("NDCG uses graded relevance and reports multiple groups", () => {
  const group: Group = dataset().groups[0];
  assert.equal(evaluate([group, group], (r) => r.relevance).ndcgAt3, 1);
  assert(evaluate([group], (r) => -r.relevance).ndcgAt3 < 1);
  assert.throws(() => evaluate([], () => 0), /Empty evaluation/);
});

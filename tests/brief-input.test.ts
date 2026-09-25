import test from "node:test";
import assert from "node:assert/strict";
import { RunInputSchema } from "../lib/brief-input";
import { newSession, runAgent } from "../agents/orchestrator";
import { DemoLLMProvider } from "../providers/demo-llm";
import { type LLMProvider } from "../providers/contracts";

const constraints = { budget: { min: 800000, max: 1700000 },
  property: { minBedrooms: 2, minSize: 700, maxSize: 1600, propertyTypes: ["Condo" as const] },
  transport: { maxMrtWalkingMinutes: 10 } };
const llm = new DemoLLMProvider();
test("form-only input directly filters candidates without language extraction", async () => {
  const noParse: LLMProvider = { mode: "demo", parse: async () => { throw new Error("Should not parse a form"); }, plan: async () => { throw new Error("Form-only input needs no model plan"); } };
  const result = await runAgent(newSession(), "", () => {}, { llm: noParse }, { constraints });
  assert.equal(result.status, "waiting");
  assert(result.recommendations.length > 0);
  for (const { property: p } of result.recommendations) {
    assert(p.price >= 800000 && p.price <= 1700000);
    assert(p.sizeSqft >= 700 && p.sizeSqft <= 1600);
    assert(p.bedrooms >= 2);
    assert.equal(p.propertyType, "Condo");
    assert(p.mrtWalkingMinutes !== null && p.mrtWalkingMinutes <= 10);
  }
  assert.match(result.messages[0].content, /Maximum budget \(SGD\): 1700000/);
});
test("supplementary language adds preferences while form limits take priority", async () => {
  const result = await runAgent(newSession(), "Budget SGD 2M. We like parks and prefer quiet. Neither drives.", () => {}, { llm }, { constraints });
  assert.equal(result.status, "waiting");
  assert.equal(result.profile.budget.max, 1700000);
  assert.equal(result.profile.lifestyle.parks, true);
  assert.equal(result.profile.lifestyle.quiet, true);
  assert.equal(result.profile.transport.hasCar, false);
});
test("explicit form changes and clears preserve other buyer memory", async () => {
  const first = await runAgent(newSession(), "We like parks and work at NUS.", () => {}, { llm }, { constraints });
  const result = await runAgent(first, "", () => {}, { llm }, { constraints: {
    budget: { max: 1900000 }, property: { minSize: null, maxSize: null, propertyTypes: [] },
  } });
  assert.equal(result.profile.budget.max, 1900000);
  assert.equal(result.profile.budget.min, 800000);
  assert.equal(result.profile.property.minSize, null);
  assert.equal(result.profile.property.maxSize, null);
  assert.deepEqual(result.profile.property.propertyTypes, []);
  assert.deepEqual(result.profile.commuteDestinations, first.profile.commuteDestinations);
  assert.equal(result.profile.lifestyle.parks, true);
});
test("invalid ranges retain prior profile and invalidate recommendations", async () => {
  const first = await runAgent(newSession(), "", () => {}, { llm }, { constraints });
  for (const invalid of [{ budget: { min: 2000000, max: 1000000 } }, { property: { minSize: 1000, maxSize: 500 } }]) {
    const result = await runAgent(first, "", () => {}, { llm }, { constraints: invalid });
    assert.equal(result.status, "clarification");
    assert.deepEqual(result.profile, first.profile);
    assert.deepEqual(result.recommendations, []);
  }
});
test("form locks do not permit model changes to unrelated hard constraints", async () => {
  const first = await runAgent(newSession(), "", () => {}, { llm }, { constraints });
  const malicious: LLMProvider = { mode: "demo", plan: (p) => llm.plan(p), parse: async (_message, current) => ({
    profile: { ...current, property: { ...current.property, minBedrooms: 1 } }, clarification: null, summary: "changed",
  }) };
  const result = await runAgent(first, "Prefer parks", () => {}, { llm: malicious }, { constraints: { budget: { max: 1900000 } } });
  assert.equal(result.status, "error");
  assert.deepEqual(result.profile, first.profile);
});
test("run schema rejects empty, negative, fractional bedroom and injected fields", () => {
  for (const input of [{}, { constraints: {} }, { constraints: { budget: { max: -1 } } },
    { constraints: { property: { minBedrooms: 1.5 } } }, { constraints: { transport: { maxMrtWalkingMinutes: 121 } } },
    { constraints: { status: "approved" } }, { constraints: { budget: { unknown: 1 } } }]) {
    assert.equal(RunInputSchema.safeParse({ version: 1, ...input }).success, false);
  }
  assert(RunInputSchema.safeParse({ version: 1, message: "Budget SGD 1M, 2 bedrooms" }).success);
  assert(RunInputSchema.safeParse({ version: 1, constraints }).success);
});
test("conflicting text range cannot supersede a valid form range", async () => {
  const result = await runAgent(newSession(), "Maximum budget SGD 500k, prefer parks.", () => {}, { llm }, { constraints });
  assert.equal(result.status, "waiting");
  assert.equal(result.profile.budget.max, 1700000);
  assert.equal(result.profile.budget.min, 800000);
});
test("clearing required budget asks for clarification without reusing old approval", async () => {
  const first = await runAgent(newSession(), "", () => {}, { llm }, { constraints });
  const result = await runAgent({ ...first, status: "approved" }, "", () => {}, { llm }, { constraints: { budget: { max: null } } });
  assert.equal(result.status, "clarification");
  assert.equal(result.profile.budget.max, null);
  assert(result.profile.unknownFields.includes("budget.max"));
  assert.deepEqual(result.shortlist, []);
});

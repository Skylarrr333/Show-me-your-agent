import assert from "node:assert/strict";
import test from "node:test";
import { matchingDemoListings } from "../lib/demo-listings";
import { ResaleFilterSchema } from "../lib/resale-schema";
import { homeKey } from "../lib/home-schema";

test("complete demo listings obey the same budget, town and type filters as historical rows", () => {
  const rows = matchingDemoListings(ResaleFilterSchema.parse({ town: "CLEMENTI", flatType: "4 ROOM", maxPrice: 800000 }));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].listing?.bedrooms, 3);
  assert.equal(rows[0].listing?.status, "available");
  assert.equal(rows[0].listing?.id, "DEMO-CLE-441A-08123");
});

test("a complete demo listing has an identity independent of its historical comparison fields", () => {
  const row = matchingDemoListings(ResaleFilterSchema.parse({}))[0];
  assert.match(homeKey(row), /^listing:DEMO-/);
});

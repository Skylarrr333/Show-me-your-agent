import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { searchResales } from "../lib/resale-store-runtime";
import { ResaleFilterSchema } from "../lib/resale-schema";
import { interpretResaleFilters } from "../lib/resale-language";
import { DemoLLMProvider } from "../providers/demo-llm";
const folder = mkdtempSync(path.join(tmpdir(),"resale-test-"));
const previous = process.env.HDB_RESALE_DB;
before(() => {
  process.env.HDB_RESALE_DB = path.join(folder,"test.sqlite");
  const db = new DatabaseSync(process.env.HDB_RESALE_DB);
  db.exec(`CREATE TABLE resales (id INTEGER PRIMARY KEY, month TEXT, town TEXT, flat_type TEXT, block TEXT, street_name TEXT,
    storey_range TEXT, floor_area_sqm REAL, flat_model TEXT, lease_commence_date INTEGER, remaining_lease TEXT, resale_price REAL)`);
  const insert = db.prepare("INSERT INTO resales VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i=1;i<=45;i++) insert.run(i,i<=25?"2026-03":"2026-04",i<=40?"CLEMENTI":"BISHAN","4 ROOM","101","TEST ST","01 TO 03",90,"Model",1980,"50 years",500000+i*1000);
  db.close();
});
after(()=>{if(previous===undefined) delete process.env.HDB_RESALE_DB; else process.env.HDB_RESALE_DB=previous;rmSync(folder,{recursive:true,force:true});});
test("resale search applies inclusive price, size, town, type and month filters",async()=>{
 const result=await searchResales(ResaleFilterSchema.parse({town:"CLEMENTI",flatType:"4 ROOM",minPrice:510000,maxPrice:520000,minArea:90,maxArea:90,fromMonth:"2026-03",toMonth:"2026-03",sort:"price-asc"}));
 assert.equal(result.count,11);assert.equal(result.rows[0].resale_price,510000);assert.equal(result.rows.at(-1)?.resale_price,520000);
});
test("pagination has a stable tie breaker, disjoint rows and accurate total",async()=>{
 const first=await searchResales(ResaleFilterSchema.parse({}));const second=await searchResales(ResaleFilterSchema.parse({page:2}));
 assert.equal(first.count,45);assert.equal(first.rows.length,20);assert.equal(first.pages,3);assert.equal(first.rows[0].id,45);
 assert(!second.rows.some(r=>first.rows.some(a=>a.id===r.id)));
 const last=await searchResales(ResaleFilterSchema.parse({page:20000}));assert.equal(last.page,3);assert.equal(last.rows.length,5);
});
test("SQL injection and literal wildcard street input do not broaden results",async()=>{
 for(const input of [{town:"CLEMENTI' OR 1=1 --"},{street:"%"},{street:"_"}]) assert.equal((await searchResales(ResaleFilterSchema.parse(input))).count,0);
});
test("simulated homes consolidate comparable records before price filtering",async()=>{
 const homes=await searchResales(ResaleFilterSchema.parse({}),true);
 assert.equal(homes.count,2);
 assert.deepEqual(homes.rows.map(r=>r.id),[45,40]);
 const cheap=await searchResales(ResaleFilterSchema.parse({maxPrice:539000}),true);
 assert.equal(cheap.count,0,"old lower prices must not revive an over-budget simulated home");
 const match=await searchResales(ResaleFilterSchema.parse({town:"CLEMENTI",maxPrice:540000}),true);
 assert.equal(match.count,1);assert.equal(match.rows[0].resale_price,540000);
});
test("search schema rejects reversed ranges, invalid dates, negative values and sort injection",()=>{
 for(const input of [{minPrice:10,maxPrice:1},{minArea:50,maxArea:20},{fromMonth:"2026-04",toMonth:"2025-01"},{fromMonth:"2026-13"},{maxPrice:-1},{sort:"DROP TABLE resales"},{page:0}]) assert.equal(ResaleFilterSchema.safeParse(input).success,false);
});
test("natural language adds town and flat type without inventing bedrooms",async()=>{
 const r=await interpretResaleFilters(ResaleFilterSchema.parse({}),"4 ROOM in Clementi, budget SGD 800k",["CLEMENTI","BISHAN"],new DemoLLMProvider());
 assert.equal(r.filters.town,"CLEMENTI");assert.equal(r.filters.flatType,"4 ROOM");assert.equal(r.filters.maxPrice,800000);
});
test("explicit filters win over supplementary text and unsupported evidence is disclosed",async()=>{
 const r=await interpretResaleFilters(ResaleFilterSchema.parse({maxPrice:600000}),"Budget SGD 800k, 2 bedrooms, MRT within 5 minutes",["CLEMENTI"],new DemoLLMProvider());
 assert.equal(r.filters.maxPrice,600000);assert(r.warnings.some(w=>w.includes("Bedroom")));assert(r.warnings.some(w=>w.includes("Commute")));
});
test("mandatory unsupported requirements cannot be silently marked as satisfied",async()=>{
 await assert.rejects(()=>interpretResaleFilters(ResaleFilterSchema.parse({}),"Must have a pool",[],new DemoLLMProvider()));
});
test("structured searches never invoke a model",async()=>{
 const r=await interpretResaleFilters(ResaleFilterSchema.parse({}),"",[],{mode:"demo",parse:async()=>{throw new Error("No model calls");},plan:async()=>{throw new Error("No model calls");}});
 assert.equal(r.modelMode,"not-used");
});

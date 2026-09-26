import test from "node:test";
import assert from "node:assert/strict";
import { newSession } from "../agents/orchestrator";
import { homeAction,runHomeAgent,refreshHomes,approvable,type HomeDependencies } from "../agents/home-agent";
import { homeKey } from "../lib/home-schema";
import type { ResaleRow } from "../lib/resale-schema";
const rows:ResaleRow[]=Array.from({length:8},(_,i)=>({id:i+1,month:"2026-04",town:"CLEMENTI",flat_type:"4 ROOM",block:String(101+i),street_name:"CLEMENTI AVE 3",storey_range:"01 TO 03",floor_area_sqm:90+i,flat_model:"Improved",lease_commence_date:1980,remaining_lease:"53 years",resale_price:500000+i*10000}));
const metadata=async()=>({dataset:{count:8,firstMonth:"2017-01",lastMonth:"2026-04",sourceUrl:"https://www.kaggle.com/datasets/yingghui233/hdb-resale-pricing-singapore",title:"test",version:1,license:"Unknown",sha256:"version-1",importedAt:"2026-09-01",sourceFilename:"test.csv",idMeaning:"CSV row",boundary:"historical"},towns:["CLEMENTI"]});
const deps:HomeDependencies={metadata,search:async filters=>({rows:filters.maxPrice!==null?rows.filter(r=>r.resale_price<=filters.maxPrice!):rows,count:8,page:1,pages:1,pageSize:20,minPrice:500000,maxPrice:570000,filters})};
const create=()=>runHomeAgent(newSession(),{version:0,message:"",filters:{maxPrice:600000}},deps);
test("SQL homes run through shared session, trace, constraints and human checkpoint",async()=>{
 const s=await create();assert.equal(s.status,"waiting");assert.equal(s.homeSearch?.shortlist.length,3);assert(s.trace.some(t=>t.stage==="PLAN"));assert(s.trace.some(t=>t.stage==="VERIFY"));assert.equal(s.homeSearch?.total,8);
 const approved=await homeAction(s,{version:s.version,action:"approve",reason:""},deps);assert.equal(approved.status,"approved");
});
test("rejection remembers the home and reason across alternative requests and searches",async()=>{
 let s=await create();const key=s.homeSearch!.shortlist[0];s=await homeAction(s,{version:s.version,action:"reject",key,reason:"Too small"},deps);
 assert(!s.homeSearch!.shortlist.includes(key));assert.equal(s.homeSearch!.feedback[0].reason,"Too small");
 s=await homeAction(s,{version:s.version,action:"alternative",reason:""},deps);assert(!s.homeSearch!.shortlist.includes(key));
 s=await runHomeAgent(s,{version:s.version,message:"",filters:{maxPrice:800000}},deps);assert(!s.homeSearch!.candidates.some(c=>c.key===key));
});
test("approved shortlist is recomputed and revoked on simulated withdrawal",async()=>{
 let s=await create();const key=s.homeSearch!.shortlist[0];s=await homeAction(s,{version:s.version,action:"approve",reason:""},deps);
 s=await homeAction(s,{version:s.version,action:"withdraw",key,reason:""},deps);
 assert.equal(s.status,"waiting");assert(!s.homeSearch!.shortlist.includes(key));assert(s.notice.includes("approval revoked"));assert(s.trace.some(t=>t.stage==="VERIFY"&&t.summary.includes("Simulation")));
});
test("simulated price increase cannot leave an over-budget recommendation approvable",async()=>{
 let s=await create();const key=s.homeSearch!.shortlist[0];s=await homeAction(s,{version:s.version,action:"raise-price",key,reason:""},deps);assert(!s.homeSearch!.candidates.some(c=>c.key===key));
});
test("unknown and over-limit commutes fail approval; verified in-limit routes pass",async()=>{
 let s=await runHomeAgent(newSession(),{version:0,message:"",filters:{maxPrice:600000},commute:{destination:"NUS",mode:"walk",maxMinutes:30}},deps);
 await assert.rejects(()=>homeAction(s,{version:0,action:"approve",reason:""},deps),/Check/);
 const route:NonNullable<HomeDependencies["route"]>=async(row,destination,mode)=>({destination,mode,minutes:row.id===1?45:20,distanceKm:1,coordinates:[[103.76,1.31],[103.77,1.30]],start:{lat:1.31,lon:103.76,label:"block",source:"test",exact:true},end:{lat:1.30,lon:103.77,label:"NUS",source:"test",exact:true},checkedAt:new Date().toISOString(),source:"OneMap test fixture",note:"no traffic"});
 s=await homeAction(s,{version:0,action:"check-commutes",reason:""},{...deps,route});assert(s.homeSearch!.shortlist.every(k=>approvable(s.homeSearch!.candidates.find(c=>c.key===k)!,s.homeSearch!)));
 s=await homeAction(s,{version:0,action:"approve",reason:""},deps);assert.equal(s.status,"approved");
});
test("failed route service cannot create a fake zero-minute commute",async()=>{
 let s=await runHomeAgent(newSession(),{version:0,message:"",filters:{maxPrice:600000},commute:{destination:"NUS",mode:"walk",maxMinutes:30}},deps);
 s=await homeAction(s,{version:0,action:"check-commutes",reason:""},{...deps,route:async()=>{throw new Error("offline");}});
 assert.equal(s.homeSearch!.checkedRoutes,0);await assert.rejects(()=>homeAction(s,{version:0,action:"approve",reason:""},deps));
});
test("source changes revoke approval and stable grouping keys survive row reordering",async()=>{
 let s=await create();s=await homeAction(s,{version:0,action:"approve",reason:""},deps);
 assert.equal(homeKey(rows[0]),homeKey({...rows[0],id:900,month:"2026-09",resale_price:999999}));
 const fresh=await refreshHomes(s,{...deps,metadata:async()=>{const m=await metadata();m.dataset.sha256="version-2";return m;}});
 assert.equal(fresh.changed,true);assert.notEqual(fresh.session.status,"approved");
 const failed=await refreshHomes(s,{...deps,metadata:async()=>{throw new Error("missing db");}});assert.equal(failed.session.status,"error");assert.equal(failed.session.homeSearch!.shortlist.length,0);
});
test("version conflicts and unknown keys fail closed",async()=>{
 const s=await create();await assert.rejects(()=>homeAction(s,{version:999,action:"approve",reason:""},deps),/CONFLICT/);
 await assert.rejects(()=>homeAction(s,{version:0,action:"reject",key:"not-a-home",reason:""},deps));

});
test("a clarification clears the old shortlist and cannot keep its approval",async()=>{
 let s=await create();s=await homeAction(s,{version:0,action:"approve",reason:""},deps);
 const llm={mode:"gateway" as const,parse:async()=>{throw new Error("unused");},plan:async()=>{throw new Error("unused");},home:async()=>({filters:s.homeSearch!.filters,commute:s.homeSearch!.commute,categories:[],clarification:"Bedrooms are not recorded. Choose a flat type.",summary:"Clarify"})};
 s=await runHomeAgent(s,{version:0,message:"Need four bedrooms"},{...deps,llm});assert.equal(s.status,"clarification");assert.equal(s.homeSearch!.shortlist.length,0);
});
test("model cannot relax an existing budget when the user only asks about parks",async()=>{
 const s=await create();const llm={mode:"gateway" as const,parse:async()=>{throw new Error("unused");},plan:async()=>{throw new Error("unused");},home:async()=>({filters:{...s.homeSearch!.filters,maxPrice:9999999},commute:s.homeSearch!.commute,categories:["parks"],clarification:null,summary:"Parks"})};
 await assert.rejects(()=>runHomeAgent(s,{version:0,message:"I like parks"},{...deps,llm}),/Budget/);
});
test("alternatives advance through unseen homes rather than toggling the same two trios",async()=>{
 let s=await create();const first=s.homeSearch!.shortlist;s=await homeAction(s,{version:0,action:"alternative",reason:""},deps);const second=s.homeSearch!.shortlist;
 s=await homeAction(s,{version:0,action:"alternative",reason:""},deps);assert(s.homeSearch!.shortlist.every(k=>!first.includes(k)&&!second.includes(k)));
});

test("transit hard limits require current scheduled OneMap evidence and stale approval fails",async()=>{
 let s=await runHomeAgent(newSession(),{version:0,message:"",commute:{destination:"NUS",mode:"transit",maxMinutes:30}},deps);
 await assert.rejects(()=>homeAction(s,{version:0,action:"approve",reason:""},deps));
 s=await homeAction(s,{version:0,action:"check-commutes",reason:""},{...deps,route:async(_row,destination,mode)=>({destination,mode,minutes:20,distanceKm:2,coordinates:[[103.76,1.31],[103.77,1.3]],start:{lat:1.31,lon:103.76,label:"home",source:"test",exact:true},end:{lat:1.3,lon:103.77,label:"NUS",source:"test",exact:true},checkedAt:new Date().toISOString(),departureAt:new Date().toISOString(),source:"OneMap test fixture",note:"scheduled"})});
 s=await homeAction(s,{version:0,action:"approve",reason:""},deps);assert.equal(s.status,"approved");
 for(const c of s.homeSearch!.candidates)if(c.route)c.route.departureAt=new Date(Date.now()-360000).toISOString();
 const refreshed=await refreshHomes(s,deps);assert.equal(refreshed.changed,true);assert.equal(refreshed.session.status,"waiting");
 await assert.rejects(()=>homeAction(refreshed.session,{version:0,action:"approve",reason:""},deps));
});

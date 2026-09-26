import test from "node:test";
import assert from "node:assert/strict";
import {OneMapClient} from "../lib/onemap-client";
const path="/api/common/elastic/search",params={searchVal:"NUS"};
const parse=(raw:unknown)=>{if(!(raw as {results?:unknown})?.results)throw new Error("missing results");return raw as {results:unknown[]};};
const now=Date.parse("2026-09-26T01:00:00Z");
test("server auth token renewal, concurrent deduplication and cache preserve retrieval time",async()=>{
 let clock=now,auth=0,queries=0;
 const c=new OneMapClient({credentials:()=>({email:"test@example.invalid",password:"test_only"}),now:()=>clock,wait:async()=>{},fetch:async(url,init)=>{
  assert.equal(new URL(String(url)).origin,"https://www.onemap.gov.sg");
  if(String(url).endsWith("getToken")){auth++;return Response.json({access_token:`token${auth}`,expiry_timestamp:(clock+180000)/1000});}
  queries++;assert.equal((init?.headers as Record<string,string>).Authorization,`token${auth}`);return Response.json({results:[]});
 }});
 const [a,b]=await Promise.all([c.get(path,params,parse,1000),c.get(path,params,parse,1000)]);assert.equal(auth,1);assert.equal(queries,1);assert.deepEqual(a,b);
 clock+=500;assert.equal((await c.get(path,params,parse,1000)).checkedAt,a.checkedAt);assert.equal(queries,1);
 clock+=180000;await c.get(path,params,parse,1000);assert.equal(auth,2);assert.equal(queries,2);
 await assert.rejects(()=>c.get("https://evil.test",{},parse),/Unsupported/);
});
test("HTTP 200 token errors refresh once and never cache an authentication failure",async()=>{
 let auth=0,queries=0;const c=new OneMapClient({credentials:()=>({email:"test@example.invalid",password:"test_only"}),now:()=>now,wait:async()=>{},fetch:async url=>{
  if(String(url).endsWith("getToken")){auth++;return Response.json({access_token:`t${auth}`,expiry_timestamp:(now+999999)/1000});}
  queries++;return Response.json(queries===1?{error:"Authentication token expired",results:[]}:{results:["verified"]});
 }});
 assert.deepEqual((await c.get(path,params,parse)).value.results,["verified"]);assert.equal(auth,2);assert.equal(queries,2);
});
test("malformed successful responses are not cached and raw upstream messages are never exposed",async()=>{
 let calls=0;const c=new OneMapClient({credentials:()=>({token:"secret_test"}),now:()=>now,wait:async()=>{},fetch:async()=>{calls++;return Response.json(calls===1?{}:calls===2?{error:"raw_secret_payload"}:{results:[]});}});
 await assert.rejects(()=>c.get(path,params,parse),/incomplete/);await assert.rejects(()=>c.get(path,params,parse),e=>e instanceof Error&&!e.message.includes("raw_secret_payload"));await c.get(path,params,parse);assert.equal(calls,3);
});
test("temporary HTML gateway failures retry once; quota and forbidden responses do not loop",async()=>{
 for(const status of [504,429,403]){let calls=0;const c=new OneMapClient({credentials:()=>({token:"test"}),now:()=>now,wait:async()=>{},fetch:async()=>{calls++;return new Response("html gateway error",{status});}});await assert.rejects(()=>c.get(path,params,parse));assert.equal(calls,status===504?2:1);}
});
test("missing credentials make no network calls and invalid sign-in has a cooldown",async()=>{
 let calls=0;const c=new OneMapClient({credentials:()=>({}),fetch:async()=>{calls++;throw new Error("must not call");}});await assert.rejects(()=>c.get(path,params,parse),/not configured/);assert.equal(calls,0);
 const bad=new OneMapClient({credentials:()=>({email:"test@example.invalid",password:"test_only"}),now:()=>now,wait:async()=>{},fetch:async()=>{calls++;return Response.json({error:"sensitive upstream detail"},{status:401});}});
 await assert.rejects(()=>bad.get(path,params,parse),/sign-in failed/);await assert.rejects(()=>bad.get(path,params,parse),/retry in a minute/);assert.equal(calls,1);
});

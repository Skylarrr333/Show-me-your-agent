import test from "node:test";
import assert from "node:assert/strict";
import {googleMapLinks,homeAddress} from "../lib/google-maps";
test("external Google links are keyless and preserve address and travel mode",()=>{
 const address=homeAddress({block:"705",street_name:"A&B ROAD"});
 for(const [mode,googleMode] of [["walk","walking"],["car","driving"],["transit","transit"]] as const){
  const u=new URL(googleMapLinks(address,{kind:"journey",mode,destination:"NUS & University Hall"}).externalUrl);
  assert.equal(u.origin,"https://www.google.com");assert.equal(u.searchParams.get("api"),"1");assert.equal(u.searchParams.get("travelmode"),googleMode);assert.equal(u.searchParams.get("origin"),address);assert.equal(u.searchParams.get("destination"),"NUS & University Hall");assert(!u.searchParams.has("key"));
 }
 const nearby=new URL(googleMapLinks(address,{kind:"nearby",category:"parks"}).externalUrl);assert.equal(nearby.searchParams.get("query"),`parks near ${address}`);
 assert.equal(new URL(googleMapLinks(address,{kind:"journey",mode:"walk",destination:"  "}).externalUrl).searchParams.get("query"),address);
});

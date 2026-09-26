import test from "node:test";
import assert from "node:assert/strict";
import {locateHome,roadRoute,distanceMeters,nearbyPlaces} from "../lib/maps";
import type {ResaleRow} from "../lib/resale-schema";
const start={lat:1.31,lon:103.76,label:"home",source:"test",exact:true};
const end={lat:1.30,lon:103.77,label:"destination",source:"test",exact:true};
test("MRT/bus never silently uses a walking/driving duration",async()=>{await assert.rejects(()=>roadRoute(start,end,"transit","NUS"),/Public transport/);});
test("map evidence requires the requested exact block rather than a nearby address",async()=>{
 const fetchBefore=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({results:[{BLK_NO:"999",ROAD_NAME:"CLEMENTI AVENUE 3",ADDRESS:"999 CLEMENTI",LATITUDE:"1.31",LONGITUDE:"103.76"}]});
 try {await assert.rejects(()=>locateHome({block:"777",street_name:"CLEMENTI AVE 3"} as ResaleRow),/exact block/);}finally{globalThis.fetch=fetchBefore;}
});
test("route minutes and geometry come from the routing response; long snapping fails",async()=>{
 const fetchBefore=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({code:"Ok",routes:[{duration:601,distance:950,geometry:{coordinates:[[103.76,1.31],[103.77,1.3]]}}],waypoints:[{distance:2},{distance:3}]});
 try {const route=await roadRoute(start,end,"walk","NUS");assert.equal(route.minutes,11);assert.equal(route.distanceKm,.95);assert.equal(route.coordinates.length,2);
 globalThis.fetch=async()=>Response.json({code:"Ok",routes:[{duration:1,distance:1,geometry:{coordinates:[]}}],waypoints:[{distance:400}]});
 await assert.rejects(()=>roadRoute({...start,lon:103.761},end,"car","NUS"),/reliable road route/);
 }finally{globalThis.fetch=fetchBefore;}
});
test("POIs preserve source category, safe OSM links and straight-line distance",async()=>{
 const fetchBefore=globalThis.fetch;
 globalThis.fetch=async()=>Response.json({elements:[{type:"node",id:1,lat:1.311,lon:103.76,tags:{highway:"bus_stop",name:"Test bus"}}]});
 try {const places=await nearbyPlaces(start,["bus"]);assert.equal(places[0].category,"bus");assert.equal(places[0].url,"https://www.openstreetmap.org/node/1");assert(places[0].distanceMeters>=110&&places[0].distanceMeters<=112);assert.equal(distanceMeters(start,start),0);}finally{globalThis.fetch=fetchBefore;}
});
test("a temporary Overpass gateway failure is retried once and recovers",async()=>{
 const fetchBefore=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>++calls===1?new Response("upstream timeout",{status:504}):Response.json({elements:[]});
 try {assert.deepEqual(await nearbyPlaces({...start,lat:1.315},["parks"]),[]);assert.equal(calls,2);}finally{globalThis.fetch=fetchBefore;}
});
test("repeated routing failure stops after one retry and identifies the service",async()=>{
 const fetchBefore=globalThis.fetch;let calls=0;
 globalThis.fetch=async()=>{calls++;return new Response("upstream timeout",{status:504});};
 try {await assert.rejects(()=>roadRoute({...start,lat:1.316},end,"walk","NUS"),/Walking\/driving routes \(OSRM\) timed out/);assert.equal(calls,2);}finally{globalThis.fetch=fetchBefore;}
});

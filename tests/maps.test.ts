import test from "node:test";
import assert from "node:assert/strict";
import {locateHome,roadRoute,decodePolyline,singaporeDeparture,distanceMeters,nearbyPlaces} from "../lib/maps";
import {OneMapClient} from "../lib/onemap-client";
import {routeIsCurrent} from "../lib/home-schema";
import type {ResaleRow} from "../lib/resale-schema";
const now=Date.parse("2026-09-26T01:12:00Z"),start={lat:1.31,lon:103.76,label:"home",source:"test",exact:true},end={lat:1.30,lon:103.77,label:"destination",source:"test",exact:true};
function client(fetcher:typeof fetch){return new OneMapClient({credentials:()=>({token:"test_token"}),fetch:fetcher,now:()=>now,wait:async()=>{}});}
function polyline(points:[number,number][]){let lat=0,lon=0;function enc(n:number){n=n<0?~(n<<1):n<<1;let s="";while(n>=32){s+=String.fromCharCode((32|(n&31))+63);n>>=5;}return s+String.fromCharCode(n+63);}return points.map(([y,x])=>{const a=Math.round(y*1e5),b=Math.round(x*1e5),s=enc(a-lat)+enc(b-lon);lat=a;lon=b;return s;}).join("");}
const geometry=polyline([[start.lat,start.lon],[end.lat,end.lon]]);
test("exact home block required, with normalized road abbreviations",async()=>{
 const c=client(async()=>Response.json({results:[{BLK_NO:"999",ROAD_NAME:"CLEMENTI AVENUE 3",ADDRESS:"999 CLEMENTI",LATITUDE:"1.31",LONGITUDE:"103.76"}]}));
 await assert.rejects(()=>locateHome({block:"777",street_name:"CLEMENTI AVE 3"} as ResaleRow,c),/exact block/);
 assert.equal((await locateHome({block:"999",street_name:"CLEMENTI AVE 3"} as ResaleRow,c)).exact,true);
});
test("OneMap seconds/metres and encoded path determine driving evidence, never a straight-line estimate",async()=>{
 let url="";const c=client(async input=>{url=String(input);return Response.json({status:0,route_geometry:geometry,route_summary:{total_time:601,total_distance:1950}});});
 const route=await roadRoute(start,end,"car","NUS",c,new Date(now));assert.equal(route.minutes,11);assert.equal(route.distanceKm,1.95);assert.deepEqual(route.coordinates,[[103.76,1.31],[103.77,1.3]]);assert.equal(new URL(url).searchParams.get("routeType"),"drive");assert(route.source.startsWith("OneMap"));
 assert.throws(()=>decodePolyline("???"));assert.throws(()=>decodePolyline(polyline([[40,-70],[40,-71]])));
 await assert.rejects(()=>roadRoute({...start,lat:1.4},end,"car","NUS",c,new Date(now)),/incomplete/);
});
test("MRT/bus uses scheduled itinerary, Singapore departure, geometry and initial waiting",async()=>{
 let params=new URLSearchParams();const c=client(async input=>{params=new URL(String(input)).searchParams;return Response.json({plan:{itineraries:[{duration:1200,startTime:now+120000,endTime:now+1320000,legs:[{mode:"BUS",route:"96",duration:1200,distance:5300,from:{name:"Stop A"},to:{name:"NUS"},legGeometry:{points:geometry}}]}]}});});
 const r=await roadRoute(start,end,"transit","NUS",c,new Date(now));assert.equal(r.minutes,22);assert.equal(r.legs?.[0].label,"96");assert.equal(r.departureAt,new Date(now).toISOString());assert.equal(params.get("routeType"),"pt");assert.equal(params.get("date"),"09-26-2026");assert.equal(params.get("time"),"09:12:00");assert.equal(params.get("mode"),"TRANSIT");
 assert(routeIsCurrent(r,now+1000));assert(!routeIsCurrent(r,now+300000));assert(!routeIsCurrent({...r,checkedAt:"invalid"},now));assert(!routeIsCurrent({...r,source:"old OSRM"},now));
 assert.equal(singaporeDeparture(new Date("2026-09-26T17:00:20Z")).date,"09-27-2026");
});
test("missing or malformed public transport response cannot fall back to a walking duration",async()=>{
 const c=client(async()=>Response.json({status:0,route_geometry:geometry,route_summary:{total_time:2,total_distance:1}}));
 await assert.rejects(()=>roadRoute(start,end,"transit","NUS",c,new Date(now)),/incomplete/);
});
test("official nearby transport uses returned IDs and coordinates and filters the radius",async()=>{
 const c=client(async input=>{assert(String(input).includes("getNearestBusStops"));return Response.json([{id:10,name:"Test bus",lat:1.311,lon:103.76},{id:11,name:"Far away",lat:1.4,lon:103.9}]);});
 const result=await nearbyPlaces(start,["bus"],1000,c),p=result.places[0];assert.equal(result.places.length,1);assert.equal(p.category,"bus");assert(p.source.startsWith("OneMap"));assert.equal(new URL(p.url).hostname,"www.google.com");assert(p.distanceMeters>=110 && p.distanceMeters<=112);assert.equal(distanceMeters(start,start),0);
});
test("facility catalog lookup preserves partial failures and cannot invent park points from polygons",async()=>{
 const urls:string[]=[];const c=client(async input=>{const u=new URL(String(input));urls.push(u.pathname);if(u.pathname.endsWith("getAllThemesInfo"))return Response.json({Theme_Names:[{THEMENAME:"Parks",QUERYNAME:"parks"},{THEMENAME:"Schools",QUERYNAME:"schools"},{THEMENAME:"Kindergartens",QUERYNAME:"kindergartens"}]});if(u.searchParams.get("queryName")==="kindergartens")return new Response("unavailable",{status:503});return Response.json({SrchResults:[{FeatCount:2},{NAME:"Point",LatLng:"1.311,103.76",Type:"Point"},{NAME:"Area",LatLng:"[[103.76,1.31]]",Type:"Polygon"}]});});
 const result=await nearbyPlaces(start,["parks","schools","shopping"],1000,c);assert.equal(result.places.length,2);assert(result.warnings.some(w=>w.includes("area")));assert(result.warnings.some(w=>w.includes("Kindergartens")&&w.includes("unavailable")));assert(result.warnings.some(w=>w.includes("shopping")));assert.equal(urls.filter(u=>u.endsWith("getAllThemesInfo")).length,1);
});

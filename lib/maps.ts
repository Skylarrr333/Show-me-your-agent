import { PointSchema, RouteEvidenceSchema, type MapPoint, type MapCategory } from "./home-schema";
import type { ResaleRow } from "./resale-schema";
export type NearbyPlace = MapPoint & { id:string; category:MapCategory; distanceMeters:number; url:string };
const userAgent = "PropMatch-303forward/1.0 (+https://github.com/Skylarrr333/Show-me-your-agent)";
const cache = new Map<string,{ expires:number; value:unknown }>();
const pending = new Map<string,Promise<unknown>>();
const queues = new Map<string,Promise<unknown>>();
const nextAt = new Map<string,number>();
function endpoint(name:string,fallback:string) { const u=new URL(process.env[name] || fallback); if(u.protocol!=="https:" || u.username || u.password || u.search || u.hash) throw new Error("Invalid map provider configuration"); return u.toString().replace(/\/$/,""); }
async function request(url:string, init:RequestInit={}, ttl=86400000):Promise<unknown> {
  const key=url+String(init.body??""), hit=cache.get(key);
  if(hit && hit.expires>Date.now()) return hit.value;
  if(pending.has(key)) return pending.get(key)!;
  const host=new URL(url).host;
  // One server process handles all app users. Serialize provider calls at <1/s.
  const promise=(queues.get(host)??Promise.resolve()).catch(()=>{}).then(async()=>{
    const pause=Math.max(0,(nextAt.get(host)??0)-Date.now());
    if(pause) await new Promise(r=>setTimeout(r,pause));
    nextAt.set(host,Date.now()+1100);
    const response=await fetch(url,{...init,headers:{"User-Agent":userAgent,...init.headers},redirect:"error",signal:AbortSignal.timeout(18000)});
    if(!response.ok) throw new Error(`Map provider unavailable (${response.status}). Please retry later or open external maps.`);
    const bytes=await response.text(); if(bytes.length>5000000) throw new Error("Map response too large");
    const value=JSON.parse(bytes);
    if(cache.size>=1000) cache.delete(cache.keys().next().value!);
    cache.set(key,{expires:Date.now()+ttl,value}); return value;
  }).finally(()=>pending.delete(key));
  queues.set(host,promise);pending.set(key,promise);return promise;
}
function expanded(s:string) { return s.toUpperCase().replace(/\bAVE\b/g,"AVENUE").replace(/\bST\b/g,"STREET").replace(/\bDR\b/g,"DRIVE").replace(/\bRD\b/g,"ROAD").replace(/\bCTRL\b/g,"CENTRAL").replace(/\bNTH\b/g,"NORTH").replace(/\bSTH\b/g,"SOUTH").replace(/\bBT\b/g,"BUKIT").replace(/\bJLN\b/g,"JALAN").replace(/\bUPP\b/g,"UPPER").replace(/\s+/g," ").trim(); }
type Address = {BLK_NO:string;ROAD_NAME:string;ADDRESS:string;LATITUDE:string;LONGITUDE:string};
async function addresses(query:string) {
 const base=endpoint("ONEMAP_SEARCH_URL","https://www.onemap.gov.sg/api/common/elastic/search");
 const data=await request(`${base}?${new URLSearchParams({searchVal:query,returnGeom:"Y",getAddrDetails:"Y",pageNum:"1"})}`,{headers:process.env.ONEMAP_ACCESS_TOKEN ? {Authorization:process.env.ONEMAP_ACCESS_TOKEN} : {}}) as {results?:Address[]};
 if(!Array.isArray(data.results)) throw new Error("Address lookup unavailable. OneMap may require an access token.");
 return data.results;
}
function point(r:Address,exact:boolean) { return PointSchema.parse({lat:Number(r.LATITUDE),lon:Number(r.LONGITUDE),label:r.ADDRESS,source:"OneMap / Singapore Land Authority",exact}); }
export async function locateHome(row:ResaleRow) {
 const rows=await addresses(`${row.block} ${expanded(row.street_name)}`);
 const match=rows.find(r=>r.BLK_NO?.toUpperCase()===row.block.toUpperCase() && expanded(r.ROAD_NAME)===expanded(row.street_name));
 if(!match) throw new Error("This exact block could not be verified on the map. No approximate home location or travel time was substituted.");
 return point(match,true);
}
export async function locateDestination(query:string) {
 const aliases:Record<string,string>={nus:"NUS UNIVERSITY HALL","raffles place":"RAFFLES PLACE MRT","jurong east":"JURONG EAST MRT","changi airport":"CHANGI AIRPORT MRT"};
 const rows=await addresses(aliases[query.toLowerCase()]??query);
 if(!rows.length) throw new Error("Destination not found. Enter a specific Singapore building, station or postal code.");
 return point(rows[0],true);
}
export async function roadRoute(start:MapPoint,end:MapPoint,mode:"walk"|"car"|"transit",destination:string) {
 if(mode==="transit") throw new Error("Public transport minutes are not available in-app. Open Google Maps for MRT/bus routes, or choose walking/driving.");
 const host=endpoint("OSRM_BASE_URL","https://routing.openstreetmap.de");
 const path=mode==="walk" ? "routed-foot" : "routed-car";
 const data=await request(`${host}/${path}/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson&steps=false`,{},3600000) as {code?:string;routes?:{duration:number;distance:number;geometry:{coordinates:[number,number][]}}[];waypoints?:{distance:number}[]};
 const r=data.routes?.[0];
 if(data.code!=="Ok" || !r || data.waypoints?.some(p=>p.distance>300)) throw new Error("No reliable road route found for these locations.");
 return RouteEvidenceSchema.parse({destination,mode,minutes:Math.ceil(r.duration/60),distanceKm:Math.round(r.distance/10)/100,coordinates:r.geometry.coordinates,start,end,source:"FOSSGIS OSRM / OpenStreetMap",checkedAt:new Date().toISOString(),note:"Road-network estimate; no live traffic, transit schedules or indoor access. Verify the resolved destination."});
}
export async function commuteForHome(row:ResaleRow,destination:string,mode:"walk"|"car"|"transit") {
 const start=await locateHome(row),end=await locateDestination(destination);return roadRoute(start,end,mode,destination);
}
export function distanceMeters(a:{lat:number;lon:number},b:{lat:number;lon:number}) {
 const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;
 return Math.round(6371000*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2)));
}
const selectors:Record<MapCategory,string[]>={mrt:['[railway=station][station=subway]','[railway=subway_entrance]'],bus:['[highway=bus_stop]'],parks:['[leisure=park]'],schools:['[amenity~"^(school|kindergarten|college|university)$"]'],food:['[amenity~"^(food_court|restaurant|cafe|marketplace)$"]'],shopping:['[shop~"^(mall|supermarket|convenience)$"]'],healthcare:['[amenity~"^(clinic|hospital|pharmacy)$"]']};
export async function nearbyPlaces(center:MapPoint,categories:MapCategory[],radius=1000) {
 if(!categories.length) return [];
 const query=`[out:json][timeout:15];(${categories.flatMap(c=>selectors[c].map(s=>`nwr${s}(around:${radius},${center.lat},${center.lon});`)).join("")});out center tags 180;`;
 const base=endpoint("OVERPASS_URL","https://overpass-api.de/api/interpreter");
 const data=await request(base,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({data:query}).toString()}) as {elements?:{type:string;id:number;lat?:number;lon?:number;center?:{lat:number;lon:number};tags?:Record<string,string>}[];remark?:string};
 if(!Array.isArray(data.elements) || data.remark) throw new Error("Nearby places could not be fully checked. Try fewer categories or retry later.");
 const places:NearbyPlace[]=[];
 for(const e of data.elements) {
   const p=e.center??e,t=e.tags??{};
   const category:MapCategory=t.railway ? "mrt" : t.highway==="bus_stop" ? "bus" : t.leisure==="park" ? "parks" : t.shop ? "shopping" : /school|kindergarten|college|university/.test(t.amenity??"") ? "schools" : /clinic|hospital|pharmacy/.test(t.amenity??"") ? "healthcare" : "food";
   if(!categories.includes(category))continue;
   const value=PointSchema.safeParse({lat:p.lat,lon:p.lon,label:t["name:en"]||t.name||t["ref"]||`${category} (unnamed)`,source:"OpenStreetMap / Overpass",exact:true});
   if(value.success)places.push({...value.data,id:`${e.type}/${e.id}`,category,distanceMeters:distanceMeters(center,value.data),url:`https://www.openstreetmap.org/${e.type}/${e.id}`});
 }
 return places.sort((a,b)=>a.distanceMeters-b.distanceMeters).slice(0,100);
}
export function externalMapUrl(row:ResaleRow,destination:string,mode:string) {
 return `https://www.google.com/maps/dir/?${new URLSearchParams({api:"1",origin:`${row.block} ${row.street_name}, Singapore`,destination:destination||"Singapore",travelmode:mode==="car"?"driving":mode==="walk"?"walking":"transit"})}`;
}

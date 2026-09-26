import { z } from "zod";
import { PointSchema, RouteEvidenceSchema, type MapPoint, type MapCategory, type RouteEvidence } from "./home-schema";
import type { ResaleRow } from "./resale-schema";
import { oneMap, type OneMapClient } from "./onemap-client";
export { MapProviderError } from "./onemap-client";
export type NearbyPlace = MapPoint & { id:string; category:MapCategory; distanceMeters:number; url:string };
export type NearbyResult = { places:NearbyPlace[]; warnings:string[]; sources:string[]; checkedAt:string; note:string };
const source = "OneMap / Singapore Land Authority";
const AddressSchema = z.object({BLK_NO:z.string(),ROAD_NAME:z.string(),ADDRESS:z.string(),LATITUDE:z.string(),LONGITUDE:z.string()});
function expanded(s:string) { return s.toUpperCase().replace(/\bAVE\b/g,"AVENUE").replace(/\bST\b/g,"STREET").replace(/\bDR\b/g,"DRIVE").replace(/\bRD\b/g,"ROAD").replace(/\bCTRL\b/g,"CENTRAL").replace(/\bNTH\b/g,"NORTH").replace(/\bSTH\b/g,"SOUTH").replace(/\bBT\b/g,"BUKIT").replace(/\bJLN\b/g,"JALAN").replace(/\bUPP\b/g,"UPPER").replace(/\s+/g," ").trim(); }
async function addresses(query:string, client:OneMapClient) {
 const response=await client.get("/api/common/elastic/search", {searchVal:query,returnGeom:"Y",getAddrDetails:"Y",pageNum:"1"}, raw=>z.object({results:z.array(AddressSchema)}).parse(raw),86400000,"OneMap address lookup");
 return response.value.results;
}
function point(r:z.infer<typeof AddressSchema>) { return PointSchema.parse({lat:Number(r.LATITUDE),lon:Number(r.LONGITUDE),label:r.ADDRESS,source,exact:true}); }
export async function locateHome(row:ResaleRow,client=oneMap) {
 const rows=await addresses(`${row.block} ${expanded(row.street_name)}`,client);
 const match=rows.find(r=>r.BLK_NO.toUpperCase()===row.block.toUpperCase() && expanded(r.ROAD_NAME)===expanded(row.street_name));
 if(!match) throw new Error("This exact block could not be verified on the map. No approximate home location or travel time was substituted.");
 return point(match);
}
export async function locateDestination(query:string,client=oneMap) {
 const aliases:Record<string,string>={nus:"NUS UNIVERSITY HALL","raffles place":"RAFFLES PLACE MRT","jurong east":"JURONG EAST MRT","changi airport":"CHANGI AIRPORT MRT"};
 const rows=await addresses(aliases[query.toLowerCase()]??query,client);
 if(!rows.length) throw new Error("Destination not found. Enter a specific Singapore building, station or postal code.");
 return point(rows[0]);
}
export function distanceMeters(a:{lat:number;lon:number},b:{lat:number;lon:number}) {
 const rad=Math.PI/180,dlat=(b.lat-a.lat)*rad,dlon=(b.lon-a.lon)*rad;
 return Math.round(6371000*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.lat*rad)*Math.cos(b.lat*rad)*Math.sin(dlon/2)**2)));
}
/** OneMap's encoded polyline uses precision 5. Output is GeoJSON [longitude,latitude]. */
export function decodePolyline(encoded:string):[number,number][] {
 let at=0,lat=0,lon=0;
 const points:[number,number][]=[];
 function delta(){let value=0,shift=0,byte=0;do {if(at>=encoded.length || shift>30)throw new Error("Invalid route geometry");byte=encoded.charCodeAt(at++)-63;if(byte<0 || byte>63)throw new Error("Invalid route geometry");value|=(byte&31)<<shift;shift+=5;}while(byte>=32);return value&1?~(value>>>1):value>>>1;}
 while(at<encoded.length){lat+=delta();lon+=delta();const p=PointSchema.parse({lat:lat/1e5,lon:lon/1e5,label:"route",source,exact:true});points.push([p.lon,p.lat]);if(points.length>15000)throw new Error("Route geometry too large");}
 if(points.length<2)throw new Error("Route geometry missing");return points;
}
function checkGeometry(coords:[number,number][],start:MapPoint,end:MapPoint) {
 if(coords.length<2 || distanceMeters(start,{lon:coords[0][0],lat:coords[0][1]})>300 || distanceMeters(end,{lon:coords.at(-1)![0],lat:coords.at(-1)![1]})>300) throw new Error("Route endpoints do not match the requested locations");
 return coords;
}
export function singaporeDeparture(now=new Date()) {
 const date=new Date(Math.floor(now.getTime()/60000)*60000);
 const local=new Date(date.getTime()+8*3600000).toISOString();
 return {date:`${local.slice(5,7)}-${local.slice(8,10)}-${local.slice(0,4)}`,time:local.slice(11,19),iso:date.toISOString()};
}
const roadSchema=z.object({status:z.literal(0),route_geometry:z.string(),route_summary:z.object({total_time:z.number().nonnegative().max(86400),total_distance:z.number().nonnegative()})});
const legSchema=z.object({mode:z.string().max(40),route:z.string().max(100).optional(),distance:z.number().nonnegative(),duration:z.number().nonnegative(),from:z.object({name:z.string().max(300)}),to:z.object({name:z.string().max(300)}),legGeometry:z.object({points:z.string()})});
const itinerarySchema=z.object({duration:z.number().nonnegative(),startTime:z.number(),endTime:z.number(),legs:z.array(legSchema).min(1).max(60)});
export async function roadRoute(start:MapPoint,end:MapPoint,mode:"walk"|"car"|"transit",destination:string,client=oneMap,now=new Date()):Promise<RouteEvidence> {
 const params:Record<string,string>={start:`${start.lat},${start.lon}`,end:`${end.lat},${end.lon}`,routeType:mode==="car"?"drive":mode==="transit"?"pt":"walk"};
 const departure=singaporeDeparture(now);
 if(mode==="transit")Object.assign(params,{date:departure.date,time:departure.time,mode:"TRANSIT",numItineraries:"3"});
 const result=await client.get("/api/public/routingsvc/route",params,raw=>{
   if(mode!=="transit") {const r=roadSchema.parse(raw);return {seconds:r.route_summary.total_time,meters:r.route_summary.total_distance,coordinates:checkGeometry(decodePolyline(r.route_geometry),start,end),legs:undefined};}
   const itineraries=z.object({plan:z.object({itineraries:z.array(itinerarySchema).min(1)})}).parse(raw).plan.itineraries;
   const requested=Date.parse(departure.iso);
   const r=itineraries.filter(r=>r.startTime>=requested-60000 && r.endTime>=r.startTime && r.endTime>requested && r.endTime-requested<=86400000 && Math.abs((r.endTime-r.startTime)/1000-r.duration)<60).sort((a,b)=>a.endTime-b.endTime)[0];
   if(!r)throw new Error("No valid public transport itinerary");
   return {seconds:(r.endTime-requested)/1000,meters:r.legs.reduce((n,l)=>n+l.distance,0),coordinates:checkGeometry(r.legs.flatMap(l=>decodePolyline(l.legGeometry.points)),start,end),legs:r.legs.map(l=>({mode:l.mode,label:l.route||l.mode,from:l.from.name,to:l.to.name,minutes:Math.ceil(l.duration/60)}))};
 },mode==="transit"?300000:3600000,"OneMap routes");
 const r=result.value;
 return RouteEvidenceSchema.parse({destination,mode,minutes:Math.ceil(r.seconds/60),distanceKm:Math.round(r.meters/10)/100,coordinates:r.coordinates,start,end,source,checkedAt:result.checkedAt,departureAt:mode==="transit"?departure.iso:undefined,legs:r.legs,note:mode==="transit"?"Scheduled MRT/bus itinerary for the displayed Singapore departure time, including initial waiting. Not live arrivals or a guaranteed travel time. Verify the resolved destination.":"OneMap road-network estimate; no live traffic or indoor-access guarantee. Verify the resolved destination."});
}
export async function commuteForHome(row:ResaleRow,destination:string,mode:"walk"|"car"|"transit") {
 const start=await locateHome(row),end=await locateDestination(destination);return roadRoute(start,end,mode,destination);
}
const themeSchema=z.object({THEMENAME:z.string(),QUERYNAME:z.string().regex(/^[a-zA-Z0-9_-]+$/),THEME_OWNER:z.string().optional()});
const themePatterns:Partial<Record<MapCategory,RegExp>>={parks:/^(?:national parks|parks|nparks parks|nature reserves)$/i,schools:/school|kindergarten/i,food:/hawker cent/i,shopping:/supermarket|shopping mall|shopping cent/i,healthcare:/polyclinic|hospital|chas clinic|medical clinic|pharmac/i};
function googlePlace(p:MapPoint) {return `https://www.google.com/maps/search/?${new URLSearchParams({api:"1",query:`${p.lat},${p.lon}`})}`;}
function makePlace(center:MapPoint,category:MapCategory,id:string,label:string,lat:unknown,lon:unknown,placeSource:string,radius:number):NearbyPlace|null {
 const result=PointSchema.safeParse({lat:Number(lat),lon:Number(lon),label:label.slice(0,300),source:placeSource,exact:true});
 if(!result.success)return null;
 const p=result.data,distance=distanceMeters(center,p);
 return distance<=radius?{...p,id,category,distanceMeters:distance,url:googlePlace(p)}:null;
}
export async function nearbyPlaces(center:MapPoint,categories:MapCategory[],radius=1000,client=oneMap):Promise<NearbyResult> {
 const places:NearbyPlace[]=[],warnings:string[]=[],sources:string[]=[],times:string[]=[];
 for(const category of [...new Set(categories)]) {
  try {
   if(category==="mrt" || category==="bus") {
    const result=await client.get(`/api/public/nearbysvc/${category==="mrt"?"getNearestMrtStops":"getNearestBusStops"}`,{latitude:String(center.lat),longitude:String(center.lon),radius_in_meters:String(radius)},raw=>z.array(z.object({id:z.union([z.string(),z.number()]),name:z.string(),lat:z.number(),lon:z.number()})).parse(raw),3600000,`OneMap ${category==="mrt"?"MRT/LRT stations":"bus stops"}`);
    times.push(result.checkedAt);sources.push(`${source} · ${category==="mrt"?"Nearby MRT/LRT":"Nearby bus stops"}`);
    for(const r of result.value){const p=makePlace(center,category,`${category}/${r.id}`,r.name,r.lat,r.lon,source,radius);if(p)places.push(p);}
    continue;
   }
   const catalog=await client.get("/api/public/themesvc/getAllThemesInfo",{moreInfo:"Y"},raw=>z.object({Theme_Names:z.array(themeSchema)}).parse(raw),86400000,"OneMap facility catalog");
   const matches=catalog.value.Theme_Names.filter(t=>themePatterns[category]?.test(t.THEMENAME));
   if(!matches.length){warnings.push(`OneMap has no supported ${category} layer in its current catalog. Explore this category in Google Maps.`);continue;}
   if(matches.length>4)warnings.push(`Showing four ${category} datasets; this is not a complete facilities directory.`);
   const dLat=radius/111000,dLon=dLat/Math.cos(center.lat*Math.PI/180);
   for(const theme of matches.slice(0,4)) {
    try {
     const result=await client.get("/api/public/themesvc/retrieveTheme",{queryName:theme.QUERYNAME,extents:[center.lat-dLat,center.lon-dLon,center.lat+dLat,center.lon+dLon].join(",")},raw=>z.object({SrchResults:z.array(z.record(z.unknown()))}).parse(raw),3600000,`OneMap ${theme.THEMENAME}`);
     sources.push(`${theme.THEMENAME}${theme.THEME_OWNER?` · ${theme.THEME_OWNER}`:""}`);times.push(result.checkedAt);
     let skipped=0;
     for(const row of result.value.SrchResults) {
      if("FeatCount" in row)continue;
      // Point layers use LatLng as latitude,longitude. Never invent a point from an area polygon.
      if(typeof row.NAME!=="string" || typeof row.LatLng!=="string" || (row.Type && String(row.Type).toLowerCase()!=="point")){skipped++;continue;}
      const parts=row.LatLng.split(",");if(parts.length!==2){skipped++;continue;}
      const p=makePlace(center,category,`${theme.QUERYNAME}/${row.LatLng}/${row.NAME}`,row.NAME,parts[0],parts[1],`${source} · ${theme.THEMENAME}`,radius);
      if(p)places.push(p);
     }
     if(skipped)warnings.push(`${theme.THEMENAME}: ${skipped} area or incomplete records could not be marked as exact points.`);
    }catch{warnings.push(`${theme.THEMENAME} is temporarily unavailable. Its places are not included.`);}
   }
  }catch(e){warnings.push(e instanceof Error?e.message:`OneMap ${category} lookup is unavailable.`);}
 }
 const unique=[...new Map(places.map(p=>[`${p.category}/${p.label.toLowerCase()}/${p.lat.toFixed(5)}/${p.lon.toFixed(5)}`,p])).values()].sort((a,b)=>a.distanceMeters-b.distanceMeters);
 if(unique.length>100)warnings.push("Showing the 100 nearest returned places.");
 return {places:unique.slice(0,100),warnings,sources:[...new Set(sources)],checkedAt:times.sort()[0]??new Date().toISOString(),note:"Within 1 km straight-line distance, not walking distance. Official layer coverage may be incomplete; no result does not mean no facilities exist."};
}

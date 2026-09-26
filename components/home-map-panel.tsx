"use client";
import { useState } from "react";
import dynamic from "next/dynamic";
import { MapPin,Route,LoaderCircle,ExternalLink } from "lucide-react";
import type { Session } from "../schemas";
import type { HomeCandidate,MapCategory,MapPoint,RouteEvidence } from "../lib/home-schema";
import type { NearbyPlace } from "../lib/maps";
const Map=dynamic(()=>import("./home-map"),{ssr:false,loading:()=> <div className="map-loading">Loading map…</div>});
export const categoryNames:Record<MapCategory,string>={mrt:"MRT",bus:"Bus stops",parks:"Parks",schools:"Schools",food:"Food",shopping:"Shops",healthcare:"Healthcare"};
export function mapsUrl(c:HomeCandidate,destination:string,mode:string) { return `https://www.google.com/maps/dir/?${new URLSearchParams({api:"1",origin:`${c.row.block} ${c.row.street_name}, Singapore`,destination,travelmode:mode==="walk"?"walking":mode==="car"?"driving":"transit"})}`; }
export default function HomeMapPanel({home,session,onSession}:{home:HomeCandidate;session:Session;onSession:(s:Session)=>void}) {
 const [location,setLocation]=useState<MapPoint|null>(null),[places,setPlaces]=useState<NearbyPlace[]>([]),[route,setRoute]=useState<RouteEvidence|null>(null);
 const [busy,setBusy]=useState(false),[error,setError]=useState(""),[note,setNote]=useState("");
 const [lastAction,setLastAction]=useState<"locate"|"places"|"route">("places");
 const [categories,setCategories]=useState<MapCategory[]>(session.homeSearch?.categories??["mrt","bus"]);
 const [destination,setDestination]=useState(session.homeSearch?.commute.destination??"NUS"),[mode,setMode]=useState<"walk"|"car"|"transit">(session.homeSearch?.commute.mode??"walk");
 async function load(action:"locate"|"places"|"route") {
  setBusy(true);setError("");setLastAction(action);
  try {const response=await fetch("/api/homes/map",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:session.version,key:home.key,action,categories,destination,mode})});const data=await response.json() as {session?:Session;error?:string;location?:MapPoint;places?:NearbyPlace[];route?:RouteEvidence;note?:string};if(data.session)onSession(data.session);if(data.location)setLocation(data.location);if(!response.ok)throw new Error(data.error||"Map request failed.");if(data.places)setPlaces(data.places);if(data.route)setRoute(data.route);setNote(data.note||"");}
  catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 const visiblePlaces=places.filter(p=>categories.includes(p.category));
 return <section className="map-panel">
  <p className="map-help">Explore the actual block and local area. Public map providers receive the selected address and destination.</p>
  {!location && <><button className="button primary" disabled={busy} onClick={()=>load("places")}><MapPin size={16}/> {busy?"Finding block…":"Show home & nearby places"}</button><button className="button" disabled={busy} onClick={()=>load("locate")}>Show map only</button></>}
  <fieldset disabled={busy} className="map-controls"><legend>Show nearby · within 1 km</legend><div className="map-categories">{(Object.keys(categoryNames) as MapCategory[]).map(c=><label key={c}><input type="checkbox" checked={categories.includes(c)} onChange={()=>setCategories(v=>v.includes(c)?v.filter(x=>x!==c):[...v,c])}/>{categoryNames[c]}</label>)}</div>{location&&<button className="button" onClick={()=>load("places")}>Update places</button>}</fieldset>
  <form className="map-trip" onSubmit={e=>{e.preventDefault();void load("route");}}><label className="brief-field"><span>Travel to</span><input value={destination} onChange={e=>{setDestination(e.target.value);setRoute(null);}} maxLength={100} placeholder="e.g. NUS University Hall" required/></label><label className="brief-field"><span>Transport</span><select value={mode} onChange={e=>{setMode(e.target.value as typeof mode);setRoute(null);}}><option value="walk">Walking</option><option value="car">Driving</option><option value="transit">MRT / bus</option></select></label><button className="button primary" disabled={busy}>{busy?<LoaderCircle size={16} className="spin"/>:<Route size={16}/>} {mode==="transit"?"Check transit options":"Calculate route"}</button></form>
  {error&&<div role="alert" className="error-banner"><p>{error}</p>{location&&<p>The verified block and any previously loaded evidence remain visible. The failed lookup has not refreshed them.</p>}<button className="button" disabled={busy} onClick={()=>load(lastAction)}>Retry lookup</button></div>}
  {route&&<div className="route-answer"><strong>{route.minutes} min</strong><span>{route.distanceKm} km · {route.mode==="walk"?"walk":"drive"} · road estimate</span><p>To: {route.end.label}</p><small>{route.note}</small></div>}
  {note&&<p className="map-help">{note}</p>}
  {destination&&<a className="map-external" href={mapsUrl(home,destination,mode)} target="_blank" rel="noreferrer">{mode==="transit"?"See MRT / bus routes in Google Maps":"Open this trip in Google Maps"}<ExternalLink size={13}/></a>}
  {location&&<><Map location={location} places={visiblePlaces} route={route}/><p className="map-help">Block coordinates: OneMap / SLA. Places & road network: OpenStreetMap. Distances below are straight-line distances, not walking times.</p></>}
  {!!visiblePlaces.length&&<details className="nearby-list"><summary>{visiblePlaces.length} mapped places · view list</summary>{visiblePlaces.slice(0,40).map(p=><a key={p.id} href={p.url} target="_blank" rel="noreferrer"><span>{categoryNames[p.category]} · {p.label}</span><span>{p.distanceMeters} m</span></a>)}</details>}
  {location && !visiblePlaces.length && !busy && !error && <p className="map-help">No places loaded for these categories. Map coverage can be incomplete.</p>}
 </section>;
}

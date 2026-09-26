"use client";
import { useEffect,useRef,useState } from "react";
import { MapPin,Route,LoaderCircle,ExternalLink,Compass,RefreshCw } from "lucide-react";
import type { Session } from "../schemas";
import { routeIsCurrent,type HomeCandidate,type MapCategory,type MapPoint,type RouteEvidence } from "../lib/home-schema";
import type { NearbyResult,NearbyPlace } from "../lib/maps";
import { categoryNames,googleMapLinks,homeAddress,modeNames,type GoogleMapView,type TravelMode } from "../lib/google-maps";
import HomeMap from "./home-map";
const noPlaces:NearbyPlace[]=[];
type MapReply=Partial<NearbyResult>&{location?:MapPoint;route?:RouteEvidence;session?:Session;error?:string;appliedToSearch?:boolean};
export default function HomeMapPanel({home,session,onSession}:{home:HomeCandidate;session:Session;onSession:(s:Session)=>void}) {
 const [view,setView]=useState<"home"|"nearby"|"journey">("home");
 const [location,setLocation]=useState<MapPoint|null>(null),[nearby,setNearby]=useState<NearbyResult|null>(null),[route,setRoute]=useState<RouteEvidence|null>(home.route&&routeIsCurrent(home.route)?home.route:null);
 const [category,setCategory]=useState<MapCategory>(session.homeSearch?.categories[0]??"mrt");
 const [destination,setDestination]=useState(session.homeSearch?.commute.destination??""),[mode,setMode]=useState<TravelMode>(session.homeSearch?.commute.mode??"walk");
 const [busy,setBusy]=useState("Locating this block…"),[error,setError]=useState("");
 const live=useRef({session,onSession});useEffect(()=>{live.current={session,onSession};},[session,onSession]);
 const controller=useRef<AbortController|null>(null);
 const address=homeAddress(home.row);
 const googleView:GoogleMapView=view==="nearby"?{kind:"nearby",category}:view==="journey"?{kind:"journey",destination,mode}:{kind:"home"};
 const links=googleMapLinks(address,googleView);
 const matchingRoute=route && route.destination===destination.trim() && route.mode===mode ? route : null;
 const commute=session.homeSearch?.commute;
 const applies=matchingRoute && matchingRoute.destination===commute?.destination && matchingRoute.mode===commute?.mode;
 async function request(action:"locate"|"places"|"route",signal:AbortSignal,options:Record<string,unknown>={}) {
  const response=await fetch("/api/homes/map",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({version:live.current.session.version,key:home.key,action,...options}),signal});
  const data=await response.json() as MapReply;
  if(signal.aborted)return null;
  if(data.location)setLocation(data.location);
  if(data.session && data.session.version>=live.current.session.version)live.current.onSession(data.session);
  if(!response.ok){
   if(response.status===409 && !data.session){const latest=await fetch("/api/session",{signal}).then(r=>r.json()) as {session?:Session};if(latest.session)live.current.onSession(latest.session);}
   throw new Error(data.error||"OneMap could not complete this lookup.");
  }
  return data;
 }
 useEffect(()=>{
  const abort=new AbortController();controller.current=abort;
  void request("locate",abort.signal).catch(e=>{if(!abort.signal.aborted)setError((e as Error).message);}).finally(()=>{if(!abort.signal.aborted)setBusy("");});
  return()=>{abort.abort();controller.current?.abort();};
  // The component is keyed by home.key. Later actions use the latest session ref.
  // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);
 async function load(action:"locate"|"places"|"route",selectedCategory=category) {
  controller.current?.abort();const abort=new AbortController();controller.current=abort;
  setBusy(action==="route"?"Finding a OneMap route…":action==="places"?"Checking official nearby places…":"Locating this block…");setError("");
  try {const data=await request(action,abort.signal,{categories:[selectedCategory],destination:destination.trim(),mode});if(!data)return;
   if(action==="places")setNearby({places:data.places??[],warnings:data.warnings??[],sources:data.sources??[],checkedAt:data.checkedAt??"",note:data.note??""});
   if(action==="route")setRoute(data.route??null);
  }catch(e){if(!abort.signal.aborted){setError((e as Error).message);if(action==="route")setRoute(null);}}
  finally{if(!abort.signal.aborted)setBusy("");}
 }
 function showNearby(c:MapCategory){setView("nearby");setCategory(c);setNearby(null);void load("places",c);}
 return <section className="map-panel">
  <div className="map-view-bar"><div className="map-view-switch" aria-label="Map view">
   <button disabled={!!busy} aria-pressed={view==="home"} onClick={()=>{setView("home");setError("");}}><MapPin size={15}/> Home</button>
   <button disabled={!!busy} aria-pressed={view==="nearby"} onClick={()=>showNearby(category)}><Compass size={15}/> Nearby</button>
   <button disabled={!!busy} aria-pressed={view==="journey"} onClick={()=>{setView("journey");setError("");}}><Route size={15}/> Journey</button>
  </div><a className="map-external" href={links.externalUrl} target="_blank" rel="noopener noreferrer">Open Google Maps <ExternalLink size={13}/></a></div>
  {view==="nearby"&&<div className="map-category-chips" aria-label="Nearby place category">{(Object.keys(categoryNames) as MapCategory[]).map(c=><button key={c} disabled={!!busy} aria-pressed={category===c} onClick={()=>showNearby(c)}>{categoryNames[c]}</button>)}</div>}
  {view==="journey"&&<form className="map-trip" onSubmit={e=>{e.preventDefault();void load("route");}}>
   <label className="brief-field"><span>Travel to</span><input value={destination} disabled={!!busy} onChange={e=>setDestination(e.target.value)} maxLength={100} placeholder="e.g. NUS University Hall" required/></label>
   <label className="brief-field"><span>Transport</span><select value={mode} disabled={!!busy} onChange={e=>setMode(e.target.value as TravelMode)}><option value="walk">Walking</option><option value="car">Driving</option><option value="transit">MRT / bus · depart now</option></select></label>
   <button className="button primary" disabled={!!busy||!destination.trim()}>Show route <Route size={15}/></button>
  </form>}
  {busy&&<p className="map-status" role="status"><LoaderCircle size={15} className="spin"/>{busy}</p>}
  {error&&<div className="map-error" role="alert"><p>{error}</p><button className="text-button" disabled={!!busy} onClick={()=>void load(view==="journey"&&destination.trim()?"route":view==="nearby"?"places":"locate")}><RefreshCw size={13}/> Retry lookup</button></div>}
  <HomeMap location={location} places={view==="nearby"?nearby?.places??noPlaces:noPlaces} route={view==="journey"?matchingRoute:null}/>
  <div className="map-caption"><span>{location?location.label:"Singapore overview · exact block not yet verified"}</span><span>OneMap · GreyLite</span></div>
  {view==="home"&&<p className="map-help">Block-level location. Choose Nearby to explore local places, or Journey to check a route.</p>}
  {view==="nearby"&&nearby&&<>
   <div className="map-caption"><strong>{nearby.places.length} {categoryNames[category].toLowerCase()} returned within 1 km</strong><button className="text-button" disabled={!!busy} onClick={()=>void load("places")}>Refresh places</button></div>
   {nearby.warnings.map((w,i)=><p className="map-help map-warning" key={i}>{w}</p>)}
   {!nearby.places.length&&<p className="map-help">No verified points were returned for this view. Try another category or explore Google Maps.</p>}
   <div className="onemap-place-list">{nearby.places.map(p=><a key={p.id} href={p.url} target="_blank" rel="noopener noreferrer"><span>{p.label}</span><small>{p.distanceMeters} m <ExternalLink size={11}/></small></a>)}</div>
   <details className="map-agent-evidence"><summary>Data coverage & sources</summary><p>{nearby.note}</p><p>{nearby.sources.join("; ")||"No verified dataset returned."}</p><p>Retrieved: {nearby.checkedAt?new Date(nearby.checkedAt).toLocaleString("en-SG",{timeZone:"Asia/Singapore"}):"unknown"} SGT. Facility layers are exploratory; they do not verify hard proximity requirements.</p></details>
  </>}
  {view==="journey"&&matchingRoute&&<div className="route-answer"><strong>{matchingRoute.minutes} min</strong><span>{matchingRoute.distanceKm} km · {modeNames[matchingRoute.mode]} · OneMap</span>
   <p>To: {matchingRoute.end.label}</p>
   {matchingRoute.departureAt&&<p>Departing {new Date(matchingRoute.departureAt).toLocaleString("en-SG",{timeZone:"Asia/Singapore",dateStyle:"medium",timeStyle:"short"})} SGT</p>}
   <small>{matchingRoute.note}</small>
   <p>{!routeIsCurrent(matchingRoute)?"This estimate has expired. Show route again before using it for approval.":applies?"This route is saved as evidence for your current commute preference. Check travel times on the shortlist to compare and rerank homes.":"Exploring this journey does not change your search. Set the same destination and mode in Filters & commute to use it as a shortlist requirement."}</p>
   {matchingRoute.legs&&<details className="map-agent-evidence"><summary>Route steps</summary><ol className="route-steps">{matchingRoute.legs.map((l,i)=><li key={i}><strong>{l.label}</strong> · {l.minutes} min<br/>{l.from} → {l.to}</li>)}</ol></details>}
  </div>}
  <p className="map-help">OneMap receives the selected locations. Google receives them only when you open its link. Estimates and facility coverage can change.</p>
 </section>;
}

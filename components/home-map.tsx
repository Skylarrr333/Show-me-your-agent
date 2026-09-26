"use client";
import { useEffect,useRef,useState } from "react";
import type { MapPoint,RouteEvidence } from "../lib/home-schema";
import type { NearbyPlace } from "../lib/maps";
import { categoryNames } from "../lib/google-maps";
import "leaflet/dist/leaflet.css";
const colors:Record<string,string>={mrt:"#7666b1",bus:"#bd8534",parks:"#398667",schools:"#477cbb",food:"#d67459",shopping:"#c06392",healthcare:"#c44c64"};
export default function HomeMap({location,places,route}:{location:MapPoint|null;places:NearbyPlace[];route:RouteEvidence|null}) {
 const host=useRef<HTMLDivElement>(null);
 const [tileError,setTileError]=useState(false);
 useEffect(()=>{
  let cancelled=false,dispose:()=>void=()=>{};
  void import("leaflet").then(L=>{
   if(cancelled || !host.current)return;
   const map=L.map(host.current,{scrollWheelZoom:false,minZoom:11,maxZoom:19,maxBounds:[[1.144,103.535],[1.494,104.502]]}).setView(location?[location.lat,location.lon]:[1.3521,103.8198],location?16:12);
   L.tileLayer("https://www.onemap.gov.sg/maps/tiles/GreyLite/{z}/{x}/{y}.png",{maxZoom:19,minZoom:11,detectRetina:true,attribution:'<img src="https://www.onemap.gov.sg/web-assets/images/logo/om_logo.png" alt="" style="height:20px;width:20px;display:inline"/> <a href="https://www.onemap.gov.sg/" target="_blank" rel="noopener noreferrer">OneMap</a> &copy; contributors | <a href="https://www.sla.gov.sg/" target="_blank" rel="noopener noreferrer">Singapore Land Authority</a>'}).on("tileerror",()=>{if(!cancelled)setTileError(true);}).addTo(map);
   const text=(s:string)=>{const e=document.createElement("span");e.textContent=s;return e;};
   if(location) {
    const icon=L.divIcon({className:"home-pin",html:'<span aria-hidden="true">⌂</span>',iconSize:[34,34],iconAnchor:[17,17]});
    L.marker([location.lat,location.lon],{icon,keyboard:true,title:`Home: ${location.label}`}).addTo(map).bindPopup(text(`Home: ${location.label}`));
   }
   places.forEach(p=>L.circleMarker([p.lat,p.lon],{radius:7,color:"#fff",fillColor:colors[p.category],fillOpacity:1,weight:2}).addTo(map).bindPopup(text(`${p.label} · ${categoryNames[p.category]} · ${p.distanceMeters} m straight line`)));
   if(route){const line=L.polyline(route.coordinates.map(([lon,lat])=>[lat,lon]),{color:"#285c48",weight:5,opacity:.85}).addTo(map);L.circleMarker([route.end.lat,route.end.lon],{radius:9,color:"#fff",fillColor:"#cc8455",fillOpacity:1,weight:3}).addTo(map).bindPopup(text(route.end.label));map.fitBounds(line.getBounds(),{padding:[40,40],maxZoom:16});}
   else if(location && places.length)map.fitBounds(L.latLngBounds([[location.lat,location.lon],...places.map(p=>[p.lat,p.lon] as [number,number])]),{padding:[35,35],maxZoom:16});
   const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(host.current);
   dispose=()=>{observer.disconnect();map.remove();};
  }).catch(()=>{if(!cancelled)setTileError(true);});
  return()=>{cancelled=true;dispose();};
 },[location,places,route]);
 return <><div ref={host} className="home-map-canvas" role="region" aria-label="OneMap: home, nearby places and route"/>{tileError&&<p className="map-help" role="status">Some OneMap tiles could not load. You can still use the places list or open Google Maps.</p>}</>;
}

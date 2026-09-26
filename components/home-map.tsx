"use client";
import { useEffect,useRef } from "react";
import type { MapPoint,RouteEvidence } from "../lib/home-schema";
import type { NearbyPlace } from "../lib/maps";
import "leaflet/dist/leaflet.css";
const colors:Record<string,string>={mrt:"#7666b1",bus:"#bd8534",parks:"#398667",schools:"#477cbb",food:"#d67459",shopping:"#c06392",healthcare:"#c44c64"};
export default function HomeMap({location,places,route}:{location:MapPoint;places:NearbyPlace[];route:RouteEvidence|null}) {
 const host=useRef<HTMLDivElement>(null);
 useEffect(()=>{
  let cancelled=false,dispose:()=>void=()=>{};
  void import("leaflet").then(L=>{
   if(cancelled || !host.current)return;
   const map=L.map(host.current,{scrollWheelZoom:false}).setView([location.lat,location.lon],16);
   L.tileLayer(process.env.NEXT_PUBLIC_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · <a href="https://www.openstreetmap.org/fixthemap">Fix the map</a>'}).addTo(map);
   const title=(s:string)=>{const e=document.createElement("span");e.textContent=s;return e;};
   L.circleMarker([location.lat,location.lon],{radius:10,weight:3,color:"#fff",fillColor:"#1d5547",fillOpacity:1}).addTo(map).bindPopup(title(`Home: ${location.label}`));
   places.forEach(p=>L.circleMarker([p.lat,p.lon],{radius:6,color:colors[p.category],fillColor:colors[p.category],fillOpacity:.85,weight:2}).addTo(map).bindPopup(title(`${p.label} · ${p.category} · ${p.distanceMeters} m straight line`)));
   if(route){const line=L.polyline(route.coordinates.map(([lon,lat])=>[lat,lon]),{color:"#2469c1",weight:5,opacity:.9}).addTo(map);L.circleMarker([route.end.lat,route.end.lon],{radius:9,color:"#2469c1",fillOpacity:1}).addTo(map).bindPopup(title(route.end.label));map.fitBounds(line.getBounds(),{padding:[35,35],maxZoom:16});}
   const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(host.current);
   dispose=()=>{observer.disconnect();map.remove();};
  });
  return()=>{cancelled=true;dispose();};
 },[location,places,route]);
 return <div ref={host} className="home-map-canvas" role="img" aria-label="Interactive map showing the home, selected nearby places and route"/>;
}

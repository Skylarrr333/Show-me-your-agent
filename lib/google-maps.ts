import type { MapCategory } from "./home-schema";
export type TravelMode = "walk" | "car" | "transit";
export type GoogleMapView = {kind:"home"} | {kind:"nearby";category:MapCategory} | {kind:"journey";destination:string;mode:TravelMode};
export const categoryNames:Record<MapCategory,string>={mrt:"MRT / LRT",bus:"Bus stops",parks:"Parks",schools:"Schools",food:"Hawker centres",shopping:"Shops & markets",healthcare:"Healthcare"};
export const modeNames:Record<TravelMode,string>={walk:"walk",car:"drive",transit:"MRT / bus"};
const searchTerms:Record<MapCategory,string>={mrt:"MRT stations",bus:"bus stops",parks:"parks",schools:"schools",food:"hawker centres",shopping:"supermarkets and shops",healthcare:"clinics and pharmacies"};
export function homeAddress(row:{block:string;street_name:string}) {return `${row.block} ${row.street_name}, Singapore`;}
/** External navigation only: no Google API, embedded tracking, account or key. */
export function googleMapLinks(address:string,view:GoogleMapView) {
 const directions=view.kind==="journey" && view.destination.trim().length>0;
 const url=new URL(directions?"https://www.google.com/maps/dir/":"https://www.google.com/maps/search/");
 url.searchParams.set("api","1");
 if(directions){url.searchParams.set("origin",address);url.searchParams.set("destination",view.destination.trim());url.searchParams.set("travelmode",{walk:"walking",car:"driving",transit:"transit"}[view.mode]);}
 else url.searchParams.set("query",view.kind==="nearby"?`${searchTerms[view.category]} near ${address}`:address);
 return {externalUrl:url.toString()};
}

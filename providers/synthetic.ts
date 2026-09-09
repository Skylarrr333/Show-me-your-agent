import raw from '../data/properties.json';
import {PropertySchema,Commute,Property} from '../schemas';
import {ListingProvider,RoutingProvider,AmenitiesProvider,SearchFilter} from './contracts';
export const properties=raw.map(p=>PropertySchema.parse(p));
export const destinations:Record<string,[number,number]>={'NUS':[1.2966,103.7764],'Raffles Place':[1.2839,103.8515],'Jurong East':[1.333,103.742],'Changi Airport':[1.364,103.991]};
export function distance(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}){const r=Math.PI/180;const dlat=(b.latitude-a.latitude)*r,dlng=(b.longitude-a.longitude)*r;return 6371*2*Math.asin(Math.sqrt(Math.sin(dlat/2)**2+Math.cos(a.latitude*r)*Math.cos(b.latitude*r)*Math.sin(dlng/2)**2));}
export class SyntheticListingProvider implements ListingProvider{
 constructor(private rows:Property[]=properties){}
 async search(f:SearchFilter){return this.rows.filter(p=>(f.budget.max===null||p.price<=f.budget.max)&&(f.budget.min===null||p.price>=f.budget.min)&&(f.bedrooms===null||p.bedrooms>=f.bedrooms)&&(!f.propertyType.length||f.propertyType.includes(p.propertyType))&&(!f.areas.length||f.areas.some(a=>a.toLowerCase()===p.area.toLowerCase()))&&(f.availability==='all'||p.availability==='available'));}
 async get(id:string){return this.rows.find(p=>p.id===id);}
}
export class SyntheticRoutingProvider implements RoutingProvider{
 async route(c:{latitude:number;longitude:number},destination:string,mode:Commute['mode']):Promise<Commute>{const d=destinations[destination];if(!d)throw new Error('Unsupported destination; specify NUS, Raffles Place, Jurong East or Changi Airport.');const km=distance(c,{latitude:d[0],longitude:d[1]})*1.35;return {destination,travelMinutes:Math.ceil(km/(mode==='walk'?4.5:mode==='car'?28:22)*60+(mode==='transit'?12:3)),distanceKm:Math.round(km*10)/10,mode,confidence:'low',source:'synthetic-distance-heuristic-v1 (not live routing)'};}
}
export class SyntheticAmenitiesProvider implements AmenitiesProvider{
 async nearby(c:{latitude:number;longitude:number},categories:Property['amenities'][number]['category'][],radius:number){const p=properties.find(p=>p.latitude===c.latitude&&p.longitude===c.longitude);return (p?.amenities??[]).filter(a=>categories.includes(a.category)&&a.distanceMeters<=radius);}
}

import { z } from "zod";
import { body,session,errorResponse } from "../../../../lib/http";
import { save } from "../../../../lib/store";
import { MapCategorySchema,type MapPoint } from "../../../../lib/home-schema";
import { locateHome,nearbyPlaces,commuteForHome,externalMapUrl,MapProviderError } from "../../../../lib/maps";
import { event } from "../../../../agents/orchestrator";
import { approvable,refreshHomes } from "../../../../agents/home-agent";
const Input=z.object({version:z.number().int().nonnegative(),key:z.string().max(500),action:z.enum(["locate","places","route"]),categories:z.array(MapCategorySchema).max(7).default([]),destination:z.string().trim().max(100).default(""),mode:z.enum(["walk","car","transit"]).default("walk")}).strict();
export const dynamic="force-dynamic";
export async function POST(request:Request) {
 let location:MapPoint|undefined;
 try {
  const input=Input.parse(await body(request)),s=await session();if(!s?.homeSearch)return Response.json({error:"Search for homes first."},{status:401});
  if(input.version!==s.version)throw new Error("CONFLICT");
  const fresh=await refreshHomes(s);if(fresh.changed)return Response.json({error:"Dataset changed. Reload your current recommendations.",session:await save(fresh.session,s.version)},{status:409});
  const h=s.homeSearch,c=h.candidates.find(c=>c.key===input.key)??h.saved.find(c=>c.key===input.key);
  if(!c)throw new Error("Home is not in your search or saved list.");
  location=await locateHome(c.row);
  if(input.action==="locate")return Response.json({location});
  if(input.action==="places") {const places=await nearbyPlaces(location,input.categories);return Response.json({location,places,checkedAt:new Date().toISOString(),source:"OpenStreetMap / Overpass",note:"Within 1 km straight-line distance. Coverage may be incomplete; no absence guarantee."});}
  if(!input.destination)throw new Error("Enter a destination.");
  if(input.mode==="transit")return Response.json({location,externalUrl:externalMapUrl(c.row,input.destination,input.mode),note:"Open Google Maps to view MRT/bus routes and current schedules. No in-app transit minutes are claimed."});
  const route=await commuteForHome(c.row,input.destination,input.mode);
  const applies=h.commute.destination===input.destination && h.commute.mode===input.mode;
  if(applies){for(const r of [...h.candidates,...h.saved].filter(r=>r.key===c.key))r.route=route;
    if(s.status==="approved" && !h.shortlist.every(key=>{const r=h.candidates.find(c=>c.key===key);return r && approvable(r,h);})) {s.status="waiting";s.notice="New route evidence invalidated the prior approval. Review your commute limits.";}
  }
  event(s,"TOOL","calculate_commute: route retrieved from real road network",{key:c.key,destination:input.destination,mode:input.mode,minutes:route.minutes,source:route.source,appliedToSearch:applies});
  return Response.json({location,route,session:await save(s,s.version)});
 }catch(e){if(e instanceof MapProviderError){console.warn("map_provider_failure",{provider:e.provider,status:e.status});return Response.json({error:e.message,location,retryable:true},{status:503});}if(e instanceof Error && e.message!=="CONFLICT" && !("issues" in e))return Response.json({error:e.message,location},{status:400});return errorResponse(e);}
}

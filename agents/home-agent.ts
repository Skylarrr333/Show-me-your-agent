import { z } from "zod";
import { SessionSchema, emptyProfile, type Session } from "../schemas";
import { HomeActionInput, HomeSearchInput, HomeInterpretationSchema, HomeStateSchema, CommutePreferenceSchema, homeKey, type HomeState, type HomeCandidate } from "../lib/home-schema";
import { ResaleFilterSchema, type ResaleRow } from "../lib/resale-schema";
import { resaleMetadata, searchResales } from "../lib/resale-store";
import { DemoLLMProvider } from "../providers/demo-llm";
import { getLLM } from "../providers/bedrock";
import { suspicious } from "../lib/profile";
import { interpretResaleFilters } from "../lib/resale-language";
import { commuteForHome } from "../lib/maps";
import { event } from "./orchestrator";
import type { LLMProvider } from "../providers/contracts";
export type HomeDependencies = { metadata?:typeof resaleMetadata; search?:typeof searchResales; llm?:LLMProvider; route?:typeof commuteForHome };
const defaults=()=>HomeStateSchema.parse({filters:ResaleFilterSchema.parse({}),commute:CommutePreferenceSchema.parse({}),categories:["mrt","bus"],candidates:[],total:0,rejected:[],shortlist:[],saved:[],feedback:[],changes:[],sourceRevision:"",warnings:[],checkedAt:new Date().toISOString()});
export function eligible(c:HomeCandidate,h:HomeState) {
 const f=h.filters,r=c.row;
 return !h.rejected.includes(c.key) && !h.changes.some(x=>x.key===c.key && x.kind==="withdraw") &&
 (f.maxPrice===null || r.resale_price<=f.maxPrice) && (f.minPrice===null || r.resale_price>=f.minPrice) &&
 (f.minArea===null || r.floor_area_sqm>=f.minArea) && (f.maxArea===null || r.floor_area_sqm<=f.maxArea);
}
export function routeMatches(c:HomeCandidate,h:HomeState) { return !!c.route && c.route.destination===h.commute.destination && c.route.mode===h.commute.mode && Date.now()-Date.parse(c.route.checkedAt)<86400000; }
export function approvable(c:HomeCandidate,h:HomeState) {
 return eligible(c,h) && (h.commute.maxMinutes===null || (routeMatches(c,h) && c.route!.minutes<=h.commute.maxMinutes));
}
export function rankHome(row:ResaleRow,h:HomeState):HomeCandidate {
 const key=homeKey(row),changed=h.changes.find(c=>c.key===key && c.kind==="raise-price");
 const r={...row,...(changed?.price?{resale_price:changed.price}:{})};
 const budget=h.filters.maxPrice,headroom=budget?Math.max(0,(budget-r.resale_price)/budget):0;
 const score=Math.round(60+Math.min(25,headroom*100)+Math.min(15,r.floor_area_sqm/10));
 return {row:r,key,score,why:[budget?`S$${Math.max(0,budget-r.resale_price).toLocaleString("en-SG")} within your budget`:"Matches your selected price range",`${r.floor_area_sqm} m² · ${r.flat_type}`,`Historical reference: ${r.month}`]};
}
function finish(s:Session) { s.updatedAt=new Date().toISOString();s.messages.push({role:"assistant",content:s.notice,timestamp:s.updatedAt});s.messages=s.messages.slice(-100);s.trace=s.trace.slice(-400);return SessionSchema.parse(s); }
function select(h:HomeState,exclude:string[]=[]) {
 // Unknown hard commutes remain visibly provisional; they can never be approved.
 const known=h.candidates.filter(c=>eligible(c,h) && !exclude.includes(c.key) && (h.commute.maxMinutes===null || !routeMatches(c,h) || c.route!.minutes<=h.commute.maxMinutes));
 const ranked=known.sort((a,b)=>Number(approvable(b,h))-Number(approvable(a,h)) || b.score-a.score || b.row.id-a.row.id);
 const distinct:HomeCandidate[]=[],addresses=new Set<string>();
 for(const c of ranked){const a=c.row.block+" "+c.row.street_name;if(!addresses.has(a)){addresses.add(a);distinct.push(c);}}
 return [...distinct,...ranked.filter(c=>!distinct.includes(c))].slice(0,3).map(c=>c.key);
}
async function search(s:Session,deps:HomeDependencies,append=false) {
 const h=s.homeSearch!;
 const result=await (deps.search??searchResales)({...h.filters,page:h.page},true);
 const prior=new Map(h.candidates.map(c=>[c.key,c]));
 const rows=result.rows.map(r=>{const next=rankHome(r,h),old=prior.get(next.key);if(old?.route && routeMatches(old,h))next.route=old.route;return next;});
 h.candidates=append ? [...h.candidates,...rows.filter(r=>!prior.has(r.key))].slice(-60) : rows;
 h.total=result.count;h.page=result.page;h.filters.page=1;h.checkedAt=new Date().toISOString();
 event(s,"TOOL","search_properties: parameterized SQLite query",{filters:{...h.filters,page:h.page},matchingGroups:result.count,batch:result.rows.length,priceBasis:"latest historical comparable per group"});
 h.candidates=h.candidates.filter(c=>eligible(c,h));
 h.shortlist=select(h);
 h.saved=h.saved.map(c=>h.candidates.find(r=>r.key===c.key)??c);
 event(s,"VERIFY","Checked budget, floor area, feedback and simulation changes",{rejected:h.rejected.length,simulationChanges:h.changes.length,commuteLimit:h.commute.maxMinutes,uncheckedCommutes:h.candidates.filter(c=>!routeMatches(c,h)).length});
 event(s,"RANK","Ranked the loaded candidate batch",{formula:"60 + min(25, budget headroom percent) + min(15, area sqm / 10); verified hard commutes take priority",considered:h.candidates.length,availableInDatabase:h.total});
 s.status=h.candidates.length ? "waiting" : "no-match";
 s.notice=h.candidates.length ? `Found ${h.total.toLocaleString()} matching historical home groups. ${h.shortlist.length} shortlisted from this batch.${h.commute.maxMinutes!==null?" Check travel times before approving.":" Review the homes, then approve your shortlist."}` : "No eligible homes in this batch. Try another batch or adjust your requirements.";
 event(s,"RECOMMEND",s.notice,{shortlist:h.shortlist});
}
export async function runHomeAgent(old:Session,raw:z.infer<typeof HomeSearchInput>,deps:HomeDependencies={}):Promise<Session> {
 const input=HomeSearchInput.parse(raw);if(input.version!==old.version)throw new Error("CONFLICT");
 const s=SessionSchema.parse(structuredClone(old));s.lastRunId=crypto.randomUUID();
 const h=s.homeSearch??defaults();s.homeSearch=h;
 if(suspicious(input.message)){s.notice="Please describe housing requirements only. Instruction overrides were blocked; previous requirements are unchanged.";event(s,"GUARDRAIL",s.notice);return finish(s);}
 const {dataset,towns}=await (deps.metadata??resaleMetadata)();
 event(s,"UNDERSTAND","Read your request and saved preferences");
 let filters=h.filters,commute=h.commute,categories=h.categories;
 if(input.message) {
  const llm=deps.llm??getLLM();s.mode=llm.mode;
  let parsed;
  if(llm.home) parsed=HomeInterpretationSchema.parse(await llm.home({current:{filters,commute,categories},towns,message:input.message}));
  else { const basic=await interpretResaleFilters(ResaleFilterSchema.parse({}),input.message,towns,llm);parsed={filters:{...filters,...Object.fromEntries(Object.entries(basic.filters).filter(([k,v])=>v!==null && v!=="" && !["page","sort"].includes(k)))},commute,categories,clarification:null,summary:"Basic demo extraction; use form fields for travel preferences."}; }
  for(const metric of llm.drainMetrics?.()??[])event(s,"TOOL","Model interpreted housing requirements",metric);
  if(parsed.clarification){s.status="clarification";s.notice=parsed.clarification;h.shortlist=[];event(s,"HUMAN",s.notice);return finish(s);}
  // An independent parser anchors explicit budgets. Model interpretation is not permission to change limits.
  const anchor=await new DemoLLMProvider().parse(input.message,{...emptyProfile(),budget:{min:filters.minPrice,max:filters.maxPrice}});
  for(const [key,value] of [["minPrice",anchor.profile.budget.min],["maxPrice",anchor.profile.budget.max]] as const) {
    if(input.filters && key in input.filters)continue;
    if(parsed.filters[key]!==value)throw new Error("Budget interpretation disagrees with your explicit limit. Enter the amount in Filters & commute to confirm it.");
  }
  for(const key of ["minArea","maxArea"] as const) {
    if(filters[key]!==null && parsed.filters[key]!==filters[key] && !(input.filters && key in input.filters) && !/\d[^,.;]{0,25}(?:m²|m2|sqm|square met|平方米|平米)/i.test(input.message))
      throw new Error("An existing size limit cannot be changed without an explicit new size. Use the form to confirm.");
  }
  if(commute.maxMinutes!==null && (parsed.commute.maxMinutes!==commute.maxMinutes || parsed.commute.destination!==commute.destination || parsed.commute.mode!==commute.mode) && !input.commute && !/\d+\s*(?:min|分钟)/i.test(input.message))
    throw new Error("Confirm commute changes in Filters & commute; the previous hard travel limit is protected.");
  filters=parsed.filters;commute=parsed.commute;categories=parsed.categories;
 }
 filters=ResaleFilterSchema.parse({...filters,...input.filters,page:1});
 commute=input.commute??commute;categories=input.categories??categories;
 if(filters.town && !towns.includes(filters.town.toUpperCase())) throw new Error("Choose a town from the available HDB towns.");
 if(commute.maxMinutes!==null && !commute.destination)throw new Error("Enter a destination for your commute limit.");
 if(commute.maxMinutes!==null && commute.mode==="transit")throw new Error("Transit minutes cannot be verified in-app. Remove the limit or select walking/driving.");
 if(JSON.stringify(h.commute)!==JSON.stringify(commute))h.candidates=h.candidates.map(c=>({...c,route:undefined}));
 h.filters=filters;h.commute=commute;h.categories=categories;h.page=1;h.sourceRevision=dataset.sha256;
 h.warnings=["Historical HDB records create representative homes, not live listings. Availability changes are simulations.","Rankings cover the loaded batch, not every matching home. Bedroom counts are not recorded."];
 s.recommendations=[];s.shortlist=[];s.rejected=[];
 s.messages.push({role:"user",content:input.message||`Search: ${filters.town||"all towns"}, ${filters.flatType||"all HDB types"}, maximum ${filters.maxPrice??"any"} SGD`,timestamp:new Date().toISOString()});
 event(s,"STATE","Saved your search preferences; previous rejection feedback retained",{filters,commute,categories});
 event(s,"PLAN","Search → verify constraints → rank → request human review. Map checks run on demand.",{tools:["search_properties","check_constraints","rank_properties"],optionalTools:["calculate_commute","find_nearby_amenities"]});
 await search(s,deps);h.seen=[...h.shortlist];return finish(s);
}
export async function refreshHomes(old:Session,deps:HomeDependencies={}):Promise<{session:Session;changed:boolean}> {
 if(!old.homeSearch)return {session:old,changed:false};
 const s=SessionSchema.parse(structuredClone(old));
 try {
  const {dataset}=await (deps.metadata??resaleMetadata)();
  if(dataset.sha256===s.homeSearch!.sourceRevision)return {session:old,changed:false};
  s.lastRunId=crypto.randomUUID();s.homeSearch!.sourceRevision=dataset.sha256;
  // Group keys survive reordered rows. Recheck saved values before they can be shortlisted.
  s.homeSearch!.saved=[];s.homeSearch!.candidates=[];s.homeSearch!.page=1;
  await search(s,deps);s.notice="Dataset changed. Recommendations rebuilt and previous approval revoked. Review the updated shortlist.";
  event(s,"VERIFY",s.notice,{before:old.homeSearch.shortlist,after:s.homeSearch!.shortlist});return {session:finish(s),changed:true};
 } catch { s.status="error";s.homeSearch!.shortlist=[];s.notice="Data source could not be verified. Approval revoked; retry once the dataset is available.";event(s,"ERROR",s.notice);return {session:finish(s),changed:true}; }
}
export async function homeAction(old:Session,raw:z.infer<typeof HomeActionInput>,deps:HomeDependencies={}):Promise<Session> {
 const input=HomeActionInput.parse(raw);if(input.version!==old.version)throw new Error("CONFLICT");
 if(!old.homeSearch)throw new Error("Search for homes first.");
 if(input.action==="refresh") {const r=await refreshHomes(old,deps);if(r.changed)return r.session;const s=structuredClone(old);s.notice="Dataset unchanged. Current recommendations and approval are still valid.";event(s,"VERIFY",s.notice);return finish(s);}
 const checked=await refreshHomes(old,deps);if(checked.changed)return checked.session;
 const s=SessionSchema.parse(structuredClone(old)),h=s.homeSearch!;
 if(["empty","error","clarification"].includes(s.status))throw new Error("Complete a valid search before reviewing homes.");
 const c=h.candidates.find(c=>c.key===input.key),wasApproved=s.status==="approved";
 if(["reject","shortlist","withdraw","raise-price"].includes(input.action) && !c)throw new Error("Home is not in the current verified batch.");
 if(input.action==="approve") {
  if(!h.shortlist.length || !h.shortlist.every(key=>{const r=h.candidates.find(c=>c.key===key);return r && approvable(r,h);}))throw new Error("Check the shortlisted homes and any required commute times before approving.");
  s.status="approved";s.notice="Shortlist approved. No seller contacted, viewing booked or transaction made.";
 } else if(input.action==="save") {
  const saved=h.saved.find(r=>r.key===input.key);
  if(saved)h.saved=h.saved.filter(r=>r.key!==input.key);
  else {if(!c || h.saved.length>=30)throw new Error("Save up to 30 homes from your current matches.");h.saved.push(c);}
  s.notice=saved ? "Removed from saved homes." : "Home saved. Your saved homes persist when you reload.";
 } else {
  s.status="waiting";
  if(input.action==="reject") {
   if(!h.rejected.includes(c!.key))h.rejected.push(c!.key);
   h.feedback.push({key:c!.key,reason:input.reason||"Not for me",at:new Date().toISOString()});h.shortlist=select(h);
   s.notice=`Removed ${c!.row.block} ${c!.row.street_name} (storeys ${c!.row.storey_range}) and recomputed your shortlist. Your rejection will be remembered.`;
  }
  if(input.action==="shortlist") { if(!eligible(c!,h))throw new Error("This home no longer meets your requirements.");h.shortlist=h.shortlist.includes(c!.key)?h.shortlist.filter(k=>k!==c!.key):[...h.shortlist,c!.key].slice(-12);s.notice="Shortlist updated. Review before approving."; }
  if(input.action==="alternative") {
   const previous=[...new Set([...h.seen,...h.shortlist])];let next=select(h,previous);
   if(!next.length) {h.page++;await search(s,deps,true);next=select(h,previous);}
   if(!next.length)throw new Error("No additional homes in the next batch. Adjust your requirements.");
   h.shortlist=next;h.seen=[...new Set([...previous,...next])].slice(-500);s.notice="Selected another shortlist. Rejected homes were excluded and your requirements were retained.";
  }
  if(input.action==="withdraw" || input.action==="raise-price") {
   if(!h.shortlist.includes(c!.key))throw new Error("Simulate changes on a shortlisted home.");
   h.changes=[...h.changes.filter(x=>x.key!==c!.key),{key:c!.key,kind:input.action,...(input.action==="raise-price"?{price:Math.max(c!.row.resale_price,h.filters.maxPrice??c!.row.resale_price)+100000}:{})}];
   const before=[...h.shortlist];await search(s,deps);
   s.notice=`Simulation: ${c!.row.block} ${c!.row.street_name} (storeys ${c!.row.storey_range}) ${input.action==="withdraw"?"withdrawn":"price increased"}. Recommendations recomputed.${wasApproved?" Previous approval revoked.":""} Review the new shortlist.`;
   event(s,"VERIFY",s.notice,{trigger:`simulation:${input.action}`,before,after:h.shortlist,approvalRevoked:wasApproved});
  }
  if(input.action==="check-commutes") {
   if(!h.commute.destination || h.commute.mode==="transit")throw new Error("Choose a destination and walking/driving to check travel times.");
   const chosen=h.candidates.filter(c=>h.shortlist.includes(c.key));
   const extras=h.candidates.filter(c=>!h.shortlist.includes(c.key) && eligible(c,h)).slice(0,Math.max(0,6-chosen.length));
   for(const row of [...chosen,...extras].slice(0,12)) {
    try { if(!routeMatches(row,h))row.route=await (deps.route??commuteForHome)(row.row,h.commute.destination,h.commute.mode);row.mapError=undefined; }
    catch {row.route=undefined;row.mapError="Route unavailable; this home's commute remains unverified.";}
   }
   h.checkedRoutes=h.candidates.filter(c=>routeMatches(c,h)).length;h.shortlist=select(h);
   s.notice=`Checked routes for ${chosen.length+extras.length} candidates. ${h.checkedRoutes} have travel evidence. Shortlist updated; unknown or over-limit commutes cannot be approved.`;
   event(s,"TOOL","calculate_commute: verified road routes for a bounded candidate batch",{checked:h.checkedRoutes,mode:h.commute.mode,destination:h.commute.destination});
  }
  if(wasApproved && !s.notice.includes("approval revoked"))s.notice+=" Previous approval revoked.";
 }
 event(s,"HUMAN",s.notice,{action:input.action,key:input.key,reason:input.reason});return finish(s);
}

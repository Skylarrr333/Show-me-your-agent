import {body,session,errorResponse} from '../../../lib/http';
import {save} from '../../../lib/store';
import {ActionSchema,humanAction} from '../../../agents/human';
import {SyntheticListingProvider} from '../../../providers/synthetic';
import {check_constraints} from '../../../tools';
export async function POST(request:Request){try{const i=ActionSchema.parse(await body(request));const s=await session();if(!s)return Response.json({error:'Session required'},{status:401});if(i.action==='approve'){const provider=new SyntheticListingProvider();for(const id of s.shortlist){const latest=await provider.get(id);const current=s.recommendations.find(r=>r.property.id===id);if(!latest||!current||JSON.stringify(latest)!==JSON.stringify(current.property)||!check_constraints({property:latest,profile:s.profile,commutes:current.commutes}).passed)throw new Error('Listing changed; rerun before approval.');}}return Response.json({session:await save(humanAction(s,i),s.version)});}catch(e){return errorResponse(e);}}

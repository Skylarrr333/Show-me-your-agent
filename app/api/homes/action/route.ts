import { body, session, errorResponse } from "../../../../lib/http";
import { save } from "../../../../lib/store";
import { HomeActionInput } from "../../../../lib/home-schema";
import { homeAction } from "../../../../agents/home-agent";
export const dynamic="force-dynamic";
export async function POST(request:Request) {
 try {const input=HomeActionInput.parse(await body(request)),s=await session();if(!s)return Response.json({error:"Create a session first."},{status:401});
 const next=await homeAction(s,input);return Response.json({session:await save(next,s.version)});
 }catch(e){if(e instanceof Error && e.message!=="CONFLICT" && !("issues" in e))return Response.json({error:e.message},{status:400});return errorResponse(e);}
}

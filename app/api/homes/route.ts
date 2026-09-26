import { body } from "../../../lib/request";
import { HomeSearchInput } from "../../../lib/home-schema";
import { runHomeAgent } from "../../../agents/home-agent";
import { session,errorResponse } from "../../../lib/http";
import { save } from "../../../lib/store";
import { resaleMetadata } from "../../../lib/resale-store";
import { resolveLLMMode, isLLMConfigured } from "../../../providers/config";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const info = await resaleMetadata(), mode = resolveLLMMode();
    return Response.json({ ...info, model: { mode, configured: isLLMConfigured(mode) } }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "HDB dataset is not available. Import the Kaggle CSV into the local database first." }, { status: 503 });
  }
}
export async function POST(request: Request) {
  try {
    const input=HomeSearchInput.parse(await body(request)),s=await session();
    if(!s)return Response.json({error:"Create a session first."},{status:401});
    const result=await runHomeAgent(s,input);
    return Response.json({session:await save(result,s.version)});
  } catch(e) {
    if(e instanceof Error && e.message!=="CONFLICT" && !("issues" in e)) return Response.json({error:e.message},{status:400});
    return errorResponse(e);
  }
}

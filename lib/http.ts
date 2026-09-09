import {cookies} from 'next/headers';
import {z} from 'zod';
import {load,save} from './store';
import {newSession} from '../agents/orchestrator';
export const SESSION_COOKIE='propmatch_session';
export async function session(){const cookie=(await cookies()).get(SESSION_COOKIE)?.value;const valid=z.string().uuid().safeParse(cookie);if(!valid.success)return null;return load(valid.data);}
export async function create(){const s=await save(newSession(),0);return s;}
export function guard(request:Request){const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)throw new Error('Origin not allowed');if(Number(request.headers.get('content-length')??0)>12000)throw new Error('Request too large');}
export async function body(request:Request){guard(request);const raw=await request.text();if(raw.length>12000)throw new Error('Request too large');return JSON.parse(raw);}
export function errorResponse(error:unknown){const conflict=error instanceof Error&&error.message==='CONFLICT';return Response.json({error:conflict?'This session changed in another tab. Reload before trying again.':'Request rejected. Check input, reload the session and try again.'},{status:conflict?409:400});}

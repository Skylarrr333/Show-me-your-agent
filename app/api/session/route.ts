import {
  create,
  session,
  guard,
  SESSION_COOKIE,
  errorResponse,
} from "../../../lib/http";
import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const s = await session();
  return Response.json(
    { session: s },
    { headers: { "Cache-Control": "no-store" } },
  );
}
export async function POST(request: Request) {
  try {
    guard(request);
    const s = await create();
    const r = NextResponse.json({ session: s });
    r.cookies.set(SESSION_COOKIE, s.id, {
      httpOnly: true,
      sameSite: "strict",
      secure: new URL(request.url).protocol === "https:",
      maxAge: 60 * 60 * 24 * 7,
      path: "/",
    });
    return r;
  } catch (e) {
    return errorResponse(e);
  }
}

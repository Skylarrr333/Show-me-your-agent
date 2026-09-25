import { RunInputSchema } from "../../../lib/brief-input";
import { body, session, errorResponse } from "../../../lib/http";
import { save } from "../../../lib/store";
import { runAgent } from "../../../agents/orchestrator";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const input = RunInputSchema.parse(await body(request));
    const s = await session();
    if (!s)
      return Response.json(
        { error: "Create a session first." },
        { status: 401 },
      );
    if (input.version !== s.version) throw new Error("CONFLICT");
    if (s.messages.length >= 100)
      return Response.json(
        {
          error: "Demo session limit reached. Reset to begin another session.",
        },
        { status: 429 },
      );
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        let closed = false;
        function send(data: unknown) {
          if (!closed)
            try {
              controller.enqueue(encoder.encode(JSON.stringify(data) + "\n"));
            } catch {
              closed = true;
            }
        }
        try {
          const updated = await runAgent(s, input.message, (t) =>
            send({ type: "trace", trace: t }), {}, { constraints: input.constraints });
          const persisted = await save(updated, s.version);
          send({ type: "done", session: persisted });
        } catch {
          send({
            type: "error",
            error:
              "Could not commit this run. Reload the session; no approval was performed.",
          });
        } finally {
          if (!closed) controller.close();
        }
      },
    });
    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}

import {
  SessionSchema,
  TraceSchema,
  type Session,
  type Trace,
} from "../schemas";

/** A truncated response is a failure, never a silently successful buyer update. */
export async function readRunStream(
  stream: ReadableStream<Uint8Array>,
  onTrace: (trace: Trace) => void,
): Promise<Session> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "",
    completed: Session | null = null;
  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line);
    if (completed)
      throw new Error(
        "Unexpected data after completed run. Reload the session.",
      );
    if (event.type === "trace") onTrace(TraceSchema.parse(event.trace));
    else if (event.type === "done")
      completed = SessionSchema.parse(event.session);
    else if (event.type === "error")
      throw new Error(
        typeof event.error === "string"
          ? event.error
          : "Run failed. Reload the session.",
      );
    else throw new Error("Invalid run event. Reload the session.");
  }
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) consume(line);
      if (buffer.length > 5_000_000)
        throw new Error("Run response exceeds limit.");
    }
    consume(buffer + decoder.decode());
    if (!completed)
      throw new Error(
        "Connection interrupted before the run was saved. Reload the session before retrying.",
      );
    return completed;
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

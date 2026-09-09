import test from "node:test";
import assert from "node:assert/strict";
import { readRunStream } from "../lib/run-stream";
import { newSession } from "../agents/orchestrator";
const stream = (text: string, size = 7) => {
  const bytes = new TextEncoder().encode(text);
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += size)
        controller.enqueue(bytes.slice(i, i + size));
      controller.close();
    },
  });
};
test("run stream handles fragmented Unicode and final line without newline", async () => {
  const s = newSession();
  s.notice = "家 · Ready";
  const result = await readRunStream(
    stream(JSON.stringify({ type: "done", session: s })),
    () => {},
  );
  assert.deepEqual(result, s);
});
test("truncated, malformed and error streams fail visibly", async () => {
  await assert.rejects(
    readRunStream(stream(""), () => {}),
    /interrupted/,
  );
  await assert.rejects(readRunStream(stream("{bad}\n"), () => {}));
  await assert.rejects(
    readRunStream(
      stream(JSON.stringify({ type: "error", error: "Could not commit" })),
      () => {},
    ),
    /Could not commit/,
  );
});

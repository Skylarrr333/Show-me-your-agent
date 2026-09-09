import { env } from "cloudflare:workers";
import { Session, SessionSchema } from "../schemas";
function db() {
  return (env as unknown as { DB: D1Database }).DB;
}
export async function load(id: string): Promise<Session | null> {
  const row = await db()
    .prepare("SELECT payload FROM sessions WHERE id = ?")
    .bind(id)
    .first<{ payload: string }>();
  return row ? SessionSchema.parse(JSON.parse(row.payload)) : null;
}
export async function save(s: Session, expected: number) {
  const next = SessionSchema.parse({ ...s, version: expected + 1 });
  const result =
    expected === 0
      ? await db()
          .prepare(
            "INSERT OR IGNORE INTO sessions (id, version, payload) VALUES (?, ?, ?)",
          )
          .bind(s.id, 1, JSON.stringify(next))
          .run()
      : await db()
          .prepare(
            "UPDATE sessions SET version = ?, payload = ? WHERE id = ? AND version = ?",
          )
          .bind(next.version, JSON.stringify(next), s.id, expected)
          .run();
  if (!result.meta.changes) throw new Error("CONFLICT");
  return next;
}

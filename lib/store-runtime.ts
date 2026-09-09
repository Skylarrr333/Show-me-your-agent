import {
  mkdir,
  readFile,
  writeFile,
  rename,
  open,
  unlink,
} from "node:fs/promises";
import path from "node:path";
import { Session, SessionSchema } from "../schemas";
const root = () =>
  process.env.SESSION_DIR || path.join(process.cwd(), ".propmatch-sessions");
const filename = (id: string) => path.join(root(), `${id}.json`);
export async function load(id: string): Promise<Session | null> {
  try {
    return SessionSchema.parse(
      JSON.parse(await readFile(filename(id), "utf8")),
    );
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
export async function save(s: Session, expected: number) {
  await mkdir(root(), { recursive: true, mode: 0o700 });
  const lock = filename(s.id) + ".lock";
  let handle;
  try {
    handle = await open(lock, "wx", 0o600);
  } catch {
    throw new Error("CONFLICT");
  }
  try {
    const old = await load(s.id);
    if ((old?.version ?? 0) !== expected) throw new Error("CONFLICT");
    const next = SessionSchema.parse({ ...s, version: expected + 1 });
    const temp = filename(s.id) + `.${crypto.randomUUID()}.tmp`;
    await writeFile(temp, JSON.stringify(next), { mode: 0o600 });
    await rename(temp, filename(s.id));
    return next;
  } finally {
    await handle.close();
    await unlink(lock);
  }
}

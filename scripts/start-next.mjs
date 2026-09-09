import { cp, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const projectRoot = process.cwd();
const standaloneRoot = path.join(projectRoot, ".next", "standalone");

async function requirePath(candidate, buildHint) {
  try {
    await stat(candidate);
  } catch {
    throw new Error(`${buildHint} Run \`npm run build:next\` first.`);
  }
}

await requirePath(
  path.join(standaloneRoot, "server.js"),
  "The Next.js standalone server is missing.",
);
await requirePath(
  path.join(projectRoot, ".next", "static"),
  "The Next.js static assets are missing.",
);

await cp(
  path.join(projectRoot, ".next", "static"),
  path.join(standaloneRoot, ".next", "static"),
  { recursive: true, force: true },
);

try {
  await cp(path.join(projectRoot, "public"), path.join(standaloneRoot, "public"), {
    recursive: true,
    force: true,
  });
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const child = spawn(process.execPath, ["server.js"], {
  cwd: standaloneRoot,
  env: {
    ...process.env,
    HOSTNAME: process.env.HOSTNAME || "0.0.0.0",
    SESSION_DIR:
      process.env.SESSION_DIR || path.join(projectRoot, ".propmatch-sessions"),
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}

child.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exitCode = code ?? 1;
});

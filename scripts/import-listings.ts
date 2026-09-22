import { mkdir, writeFile, rename, chmod } from "node:fs/promises";
import path from "node:path";
import { readEvidenceFile, evidenceAgeValid } from "../providers/evidence";
const [input, flag] = process.argv.slice(2);
if (!input || (flag && flag !== "--validate-only"))
  throw new Error("Usage: npm run data:import -- /absolute/path/evidence.json [--validate-only]");
try {
  const dataset = await readEvidenceFile(path.resolve(input));
  const stale = dataset.properties.filter((p) => !p.checkedAt || !evidenceAgeValid(p.checkedAt, 24)).length;
  if (stale) throw new Error(`${stale} listing(s) need a fresh availability check (within 24 hours). Do not edit timestamps without rechecking sources.`);
  if (flag !== "--validate-only") {
    const target = path.resolve(process.env.LISTING_DATA_FILE || ".propmatch-data/listings.json");
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(dataset, null, 2) + "\n", { mode: 0o600 });
    await rename(temporary, target);
    await chmod(target, 0o600);
    console.log(`Imported ${dataset.properties.length} listings and ${dataset.routes.length} route snapshots into ${target}`);
  } else console.log(`Valid: ${dataset.properties.length} sourced listings; ${dataset.routes.length} route snapshots.`);
  console.log("Source links and permission are supplied by the importer; the app does not independently authenticate their truth.");
} catch (error) {
  // Schema errors may contain source values; print field paths/messages, never file contents.
  if (error && typeof error === "object" && "issues" in error)
    console.error("Invalid evidence fields:", (error as { issues: { path: unknown[]; message: string }[] }).issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("\n"));
  else console.error(error instanceof Error ? error.message : "Import failed");
  process.exitCode = 1;
}

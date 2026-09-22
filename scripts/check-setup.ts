import { dataMode, readEvidenceFile } from "../providers/evidence";
import { marketMetadata } from "../tools/market";
import { resolveLLMMode, isLLMConfigured } from "../providers/config";
const mode = resolveLLMMode();
const modelConfigured = isLLMConfigured(mode);
let dataReady = true;
let importedCount: number | null = null;
try { if (dataMode() === "file") importedCount = (await readEvidenceFile(process.env.LISTING_DATA_FILE || "")).properties.length; }
catch { dataReady = false; }
console.log(JSON.stringify({ modelMode: mode, modelConfigured, dataMode: dataMode(), dataReady, importedCount,
  publicData: marketMetadata, secretValues: "never printed", liveConnection: "not tested by this read-only check" }, null, 2));
if (!modelConfigured || !dataReady) process.exitCode = 1;

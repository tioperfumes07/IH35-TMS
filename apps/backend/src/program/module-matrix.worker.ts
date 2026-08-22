/**
 * PROD-MATRIX-REQUEST-PATH-FREEZE — leaf×column projection MUST NOT run on the HTTP thread.
 * The parent kicks this worker; the request path only serves cache / last-good / required-seed.
 */
import { parentPort } from "node:worker_threads";
import { computeSystemModuleMatrix } from "./module-matrix.service.js";

try {
  const payload = await computeSystemModuleMatrix();
  parentPort?.postMessage({ ok: true, generatedAt: payload.generatedAt, tipSha: payload.meta?.tipSha });
} catch (err) {
  parentPort?.postMessage({
    ok: false,
    error: err instanceof Error ? err.message : String(err),
  });
  process.exitCode = 1;
}

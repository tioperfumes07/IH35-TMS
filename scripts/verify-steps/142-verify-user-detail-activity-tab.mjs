// Wired via verify:pre-commit (thrash-safe; package.json optional).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mod = await import(pathToFileURL(path.join(ROOT, "scripts", "verify-user-detail-activity-tab.mjs")).href);
if (typeof mod.main === "function") await mod.main();
else if (typeof mod.assertGuard === "function") {
  const errs = [];
  await mod.assertGuard({ root: ROOT, errors: errs });
  if (errs.length) {
    console.error(`verify-user-detail-activity-tab FAIL:\n` + errs.map((e) => `  ✗ ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`verify-user-detail-activity-tab OK`);
} else {
  // fall back: spawn by re-exec pattern — import side effects may run main
  console.log(`verify-user-detail-activity-tab step loaded`);
}

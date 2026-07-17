// Wired via verify:pre-commit (thrash-safe; package.json optional).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mod = await import(pathToFileURL(path.join(ROOT, "scripts", "verify-driver-border-credentials-edit.mjs")).href);
if (typeof mod.main === "function") await mod.main();
else if (typeof mod.assertGuard === "function") {
  const errs = [];
  await mod.assertGuard({ root: ROOT, errors: errs });
  if (errs.length) {
    console.error(`verify-driver-border-credentials-edit FAIL:\n` + errs.map((e) => `  ✗ ${e}`).join("\n"));
    process.exit(1);
  }
  console.log(`verify-driver-border-credentials-edit OK`);
} else {
  // fall back: spawn by re-exec pattern — import side effects may run main
  console.log(`verify-driver-border-credentials-edit step loaded`);
}

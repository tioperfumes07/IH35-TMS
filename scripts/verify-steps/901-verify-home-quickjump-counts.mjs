// Wired via verify:pre-commit (thrash-safe; package.json optional).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "verify-home-quickjump-counts.mjs")], {
  cwd: ROOT,
  stdio: "inherit",
});
process.exit(r.status ?? 1);

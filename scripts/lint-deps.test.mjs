import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runLintDeps } from "./lint-deps.mjs";

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lint-deps-test-"));

writeJson(path.join(tmp, "package.json"), {
  name: "fixture-root",
  private: true,
  dependencies: { luxon: "^3.5.0" },
  devDependencies: {},
});

writeJson(path.join(tmp, "apps/backend/package.json"), {
  dependencies: { luxon: "^3.5.0" },
  devDependencies: {},
});

writeJson(path.join(tmp, "apps/frontend/package.json"), { dependencies: {}, devDependencies: {} });
writeJson(path.join(tmp, "apps/driver-pwa/package.json"), { dependencies: {}, devDependencies: {} });

fs.mkdirSync(path.join(tmp, "apps/backend/src"), { recursive: true });
fs.writeFileSync(path.join(tmp, "apps/backend/src/use-luxon.ts"), `import { DateTime } from "luxon";\nexport const x = DateTime.now();\n`);

fs.mkdirSync(path.join(tmp, "apps/frontend/src"), { recursive: true });
fs.mkdirSync(path.join(tmp, "apps/driver-pwa/src"), { recursive: true });
fs.mkdirSync(path.join(tmp, "scripts"), { recursive: true });

assert.equal(
  await runLintDeps(tmp),
  false,
  "expected failure when @types/luxon is missing from apps/backend/package.json"
);

writeJson(path.join(tmp, "apps/backend/package.json"), {
  dependencies: { luxon: "^3.5.0" },
  devDependencies: { "@types/luxon": "^3.7.1" },
});

console.log("[lint-deps.test] OK");

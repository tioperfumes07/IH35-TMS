import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = new URL("../", import.meta.url).pathname;

function read(rel) {
  return readFileSync(resolve(ROOT, rel), "utf8");
}

const backend = read("apps/backend/src/docs/files.routes.ts");
const frontendPage = read("apps/frontend/src/pages/docs/DocsHomePage.tsx");
const frontendApi = read("apps/frontend/src/api/docs.ts");

let fail = false;

if (!backend.includes("async function hydrateEntityLabels")) {
  console.error("FAIL: backend files.routes.ts does not define hydrateEntityLabels");
  fail = true;
}
if (!backend.includes("await hydrateEntityLabels(client, res.rows)")) {
  console.error("FAIL: backend list endpoint does not call hydrateEntityLabels");
  fail = true;
}
if (!frontendApi.includes("entity_label")) {
  console.error("FAIL: frontend api/docs.ts type does not expose entity_label");
  fail = true;
}
if (!(frontendPage.includes("link.entity_label") && frontendPage.includes("label={label}"))) {
  console.error("FAIL: DocsHomePage does not pass entity_label to EntityLink");
  fail = true;
}

if (fail) process.exit(1);
console.log("PASS: docs entity label wiring present");

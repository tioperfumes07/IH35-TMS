#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  backend: "apps/backend/src/safety/driver-qualification.routes.ts",
  api: "apps/frontend/src/api/safety.ts",
  panel: "apps/frontend/src/pages/drivers/components/DriverDqfPanel.tsx",
};

const REQUIRED = {
  backend: [
    "required_document_type_id: z.string().uuid()",
    "AND entity_kind = 'driver'",
    "AND is_active = true",
    "f.required_document_type_id",
    "rdt.authority AS required_document_type_authority",
    "f.executed_at",
    "f.removable_after",
    "f.retain_until",
    "Object.hasOwn(body.data, \"executed_at\")",
    "Object.hasOwn(body.data, \"removable_after\")",
    "Object.hasOwn(body.data, \"retain_until\")",
  ],
  api: ["required_document_type_id", "required_document_type_authority", "executed_at", "removable_after", "retain_until"],
  panel: [
    "listRequiredDocumentTypes(companyId, \"driver\")",
    "clearCommittedOnEdit",
    "required_document_type_id: input.documentTypeId",
    "executed_at: input.executedAt",
    "removable_after: input.removableAfter",
    "retain_until: input.retainUntil",
    "key: \"required_document_type_authority\"",
    "key: \"executed_at\"",
    "key: \"removable_after\"",
    "key: \"retain_until\"",
  ],
};

function verify(sources) {
  const missing = [];
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) if (!sources[name].includes(token)) missing.push(`${name}: ${token}`);
  }
  return missing;
}

const sources = Object.fromEntries(Object.entries(FILES).map(([name, rel]) => [name, readFileSync(join(ROOT, rel), "utf8")]));

if (process.argv.includes("--selftest")) {
  let mutations = 0;
  for (const [name, tokens] of Object.entries(REQUIRED)) {
    for (const token of tokens) {
      const mutant = { ...sources, [name]: sources[name].replaceAll(token, "__PLANTED_REMOVED__") };
      if (verify(mutant).length === 0) throw new Error(`planted removal survived: ${name}: ${token}`);
      mutations += 1;
    }
  }
  console.log(`verify-dqf-catalog-retention-wiring --selftest PASS ${mutations}/${mutations}`);
  process.exit(0);
}

const missing = verify(sources);
if (missing.length) {
  console.error(`verify-dqf-catalog-retention-wiring FAIL\n${missing.map((item) => `  - ${item}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-dqf-catalog-retention-wiring PASS — catalog FK + retention lifecycle wired BE/API/UI");

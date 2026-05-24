import { pathToFileURL } from "node:url";
import { KNOWN_PROD_TABLE_GRANTS } from "../lib/known-prod-grants/index.mjs";

export default {
  script: "scripts/verify-guards/verify-grants-shape.mjs",
  label: "verify-grants-shape",
};

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function verifyGrantShape() {
  for (const [index, entry] of KNOWN_PROD_TABLE_GRANTS.entries()) {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      fail(`verify-grants-shape: entry[${index}] must be an object.`);
    }

    for (const key of ["schema", "table", "grants", "roles", "source_migration"]) {
      if (!(key in entry)) {
        fail(`verify-grants-shape: entry[${index}] missing required key '${key}'.`);
      }
    }

    if (!isNonEmptyString(entry.schema) || !isNonEmptyString(entry.table) || !isNonEmptyString(entry.source_migration)) {
      fail(`verify-grants-shape: entry[${index}] has invalid schema/table/source_migration.`);
    }

    if (!Array.isArray(entry.grants) || entry.grants.length === 0 || !entry.grants.every(isNonEmptyString)) {
      fail(`verify-grants-shape: entry[${index}] has invalid grants array.`);
    }

    if (!Array.isArray(entry.roles) || entry.roles.length === 0 || !entry.roles.every(isNonEmptyString)) {
      fail(`verify-grants-shape: entry[${index}] has invalid roles array.`);
    }
  }

  console.log(`verify-grants-shape: ok (${KNOWN_PROD_TABLE_GRANTS.length} entries)`);
}

const isDirectExecution = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectExecution) {
  verifyGrantShape();
}

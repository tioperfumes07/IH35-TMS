#!/usr/bin/env node
/**
 * LV-FILE-LINK-ENTITY-TYPE-3WAY-MISMATCH
 *
 * The frontend FileEntityType union, the backend Zod enum, and the runtime
 * SUPPORTED_LINK_ENTITY_TYPES list must advertise exactly the same set of
 * attachable entity types. Prevents contract drift where TS/Zod claim support
 * but the upload handler rejects it and rolls back the file row.
 *
 * Run: node scripts/verify-docs-file-link-entity-contract.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-docs-file-link-entity-contract";

const FRONTEND = "apps/frontend/src/api/docs.ts";
const BACKEND = "apps/backend/src/docs/files.routes.ts";

function extractUnionStrings(ts, typeName) {
  const re = new RegExp(`export\\s+type\\s+${typeName}\\s*=\\s*([\\s\\S]*?);`, "m");
  const m = ts.match(re);
  if (!m) return null;
  const body = m[1];
  const strings = [...body.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return strings;
}

function extractEnumOrArray(ts, marker) {
  // Matches either z.enum([...]) or const X = ["a", "b"] as const;
  const re = new RegExp(`${marker}\\s*=\\s*(?:z\\.enum\\s*\\(([\\s\\S]*?)\\)|\\[([\\s\\S]*?)\\])`, "m");
  const m = ts.match(re);
  if (!m) return null;
  const body = m[1] ?? m[2];
  const strings = [...body.matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  return strings;
}

function setDiff(a, b) {
  const A = new Set(a);
  const B = new Set(b);
  return {
    onlyInA: [...A].filter((x) => !B.has(x)),
    onlyInB: [...B].filter((x) => !A.has(x)),
  };
}

export function assertContract({ frontend, backend }) {
  const errors = [];
  const feTypes = extractUnionStrings(frontend, "FileEntityType");
  const zodTypes = extractEnumOrArray(backend, "entityTypeSchema");
  const supportedTypes = extractEnumOrArray(backend, "SUPPORTED_LINK_ENTITY_TYPES");

  if (!feTypes) errors.push(`${FRONTEND}: could not parse FileEntityType union`);
  if (!zodTypes) errors.push(`${BACKEND}: could not parse entityTypeSchema enum`);
  if (!supportedTypes) errors.push(`${BACKEND}: could not parse SUPPORTED_LINK_ENTITY_TYPES array`);

  if (errors.length) return errors;

  const feSet = new Set(feTypes);
  const zodSet = new Set(zodTypes);
  const supSet = new Set(supportedTypes);

  if (feSet.size !== feTypes.length) errors.push(`${FRONTEND}: FileEntityType contains duplicates`);
  if (zodSet.size !== zodTypes.length) errors.push(`${BACKEND}: entityTypeSchema contains duplicates`);
  if (supSet.size !== supportedTypes.length) errors.push(`${BACKEND}: SUPPORTED_LINK_ENTITY_TYPES contains duplicates`);

  const feVsZod = setDiff(feTypes, zodTypes);
  if (feVsZod.onlyInA.length || feVsZod.onlyInB.length) {
    errors.push(
      `${FRONTEND} <-> ${BACKEND} entityTypeSchema mismatch: only-in-FE=${feVsZod.onlyInA.join(",")}, only-in-Zod=${feVsZod.onlyInB.join(",")}`
    );
  }
  const feVsSup = setDiff(feTypes, supportedTypes);
  if (feVsSup.onlyInA.length || feVsSup.onlyInB.length) {
    errors.push(
      `${FRONTEND} <-> ${BACKEND} SUPPORTED_LINK_ENTITY_TYPES mismatch: only-in-FE=${feVsSup.onlyInA.join(",")}, only-in-supported=${feVsSup.onlyInB.join(",")}`
    );
  }

  // ensureLinkEntityExists must have a branch for every supported runtime type
  const ensureFn = /async function ensureLinkEntityExists\([\s\S]*?\n\}/.exec(backend);
  if (!ensureFn) {
    errors.push(`${BACKEND}: ensureLinkEntityExists function not found`);
  } else {
    for (const t of supportedTypes) {
      if (!new RegExp(`if\\s*\\(entityType\\s*===\\s*"${t}"`).test(ensureFn[0])) {
        errors.push(`${BACKEND}: ensureLinkEntityExists missing handler for "${t}"`);
      }
    }
  }

  // The upload transaction must validate links BEFORE the file INSERT.
  const uploadRoute = 'app.post("/api/v1/docs/files/upload-url"';
  if (!backend.includes(uploadRoute)) {
    errors.push(`${BACKEND}: upload-url route not found`);
  } else {
    const createFileBody = backend.slice(backend.indexOf(uploadRoute));
    if (!/INSERT INTO docs\.files/.test(createFileBody)) {
      errors.push(`${BACKEND}: create-file INSERT not found`);
    } else {
      const insertIdx = createFileBody.indexOf("INSERT INTO docs.files");
      const beforeInsert = createFileBody.slice(0, insertIdx);
      if (!/ensureLinkEntityExists/.test(beforeInsert)) {
        errors.push(`${BACKEND}: entity link existence is not validated before the file row INSERT`);
      }
    }
  }

  return errors;
}

function selftest() {
  const goodFrontend = 'export type FileEntityType = "driver" | "load" | "invoice" | "settlement";\n';
  const goodBackend = `
const entityTypeSchema = z.enum(["driver", "load", "invoice", "settlement"]);
const SUPPORTED_LINK_ENTITY_TYPES = ["driver", "load", "invoice", "settlement"] as const;
async function ensureLinkEntityExists(client, entityType, entityId) {
  if (entityType === "driver") return true;
  if (entityType === "load") return true;
  if (entityType === "invoice") return true;
  if (entityType === "settlement") return true;
  return false;
}
app.post("/api/v1/docs/files/upload-url", async (req, reply) => {
  await ensureLinkEntityExists(client, "x", "y");
  await client.query("INSERT INTO docs.files ...");
});
`;
  const badFrontend = 'export type FileEntityType = "driver" | "load";\n';
  const badBackendNoInvoice = `
const entityTypeSchema = z.enum(["driver", "load", "invoice", "settlement"]);
const SUPPORTED_LINK_ENTITY_TYPES = ["driver", "load", "invoice", "settlement"] as const;
async function ensureLinkEntityExists(client, entityType, entityId) {
  if (entityType === "driver") return true;
  if (entityType === "load") return true;
  if (entityType === "invoice") return true;
  if (entityType === "settlement") return true;
  return false;
}
app.post("/api/v1/docs/files/upload-url", async (req, reply) => {
  await ensureLinkEntityExists(client, "x", "y");
  await client.query("INSERT INTO docs.files ...");
});
`;
  const badBackendLate = `
const entityTypeSchema = z.enum(["driver", "load", "invoice", "settlement"]);
const SUPPORTED_LINK_ENTITY_TYPES = ["driver", "load", "invoice", "settlement"] as const;
async function ensureLinkEntityExists(client, entityType, entityId) {
  if (entityType === "driver") return true;
  if (entityType === "load") return true;
  if (entityType === "invoice") return true;
  if (entityType === "settlement") return true;
  return false;
}
app.post("/api/v1/docs/files/upload-url", async (req, reply) => {
  await client.query("INSERT INTO docs.files ...");
  await ensureLinkEntityExists(client, "x", "y");
});
`;

  const cases = [
    { n: "aligned → 0", frontend: goodFrontend, backend: goodBackend, want: 0 },
    { n: "FE missing types → 1", frontend: badFrontend, backend: goodBackend, min: 1 },
    { n: "missing invoice handler → 1", frontend: goodFrontend, backend: badBackendNoInvoice.replace("invoice", "xinvoice"), min: 1 },
    { n: "late validation → 1", frontend: goodFrontend, backend: badBackendLate, min: 1 },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertContract({ frontend: c.frontend, backend: c.backend }).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) {
    console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`);
    process.exit(1);
  }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

for (const f of [FRONTEND, BACKEND]) {
  if (!fs.existsSync(path.join(ROOT, f))) {
    console.error(`[${LABEL}] FAILED — missing ${f}`);
    process.exit(1);
  }
}

const errors = assertContract({
  frontend: fs.readFileSync(path.join(ROOT, FRONTEND), "utf8"),
  backend: fs.readFileSync(path.join(ROOT, BACKEND), "utf8"),
});

if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — FileEntityType, entityTypeSchema, and SUPPORTED_LINK_ENTITY_TYPES are aligned; link validation runs before file INSERT.`);

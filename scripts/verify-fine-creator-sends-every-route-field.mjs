#!/usr/bin/env node
/**
 * SAF-B18 — every field the civil-fine create route accepts must actually be sent by the creator.
 *
 * This locks a defect CLASS, not a single field. Three separate findings on this one form were all
 * the same bug wearing different clothes:
 *
 *   · SAF-F19 — related_load_id / related_unit_id accepted by the route, collected by nothing.
 *   · SAF-B14 — violation_code accepted by the route since it was written, NULL on every fine.
 *   · SAF-B18 — source_doc_id accepted by the route, collected by nothing, so every fine was filed
 *               with no citation image. That column is carried onto the LIABILITY the fine spawns
 *               (fines.routes.ts:391), so the payable an auditor, insurer or attorney reads had no
 *               supporting document behind it.
 *
 * Each was found by hand, months apart, after the data was already wrong. A zod schema that accepts
 * a field is a PROMISE the product collects it; a creator that quietly omits it breaks that promise
 * with no error, no warning and no failing test — the column just stays null forever.
 *
 * Denominator rule: the field set is parsed from the route's own schema, never hardcoded. Add a
 * field to the route tomorrow and it is in scope the moment it lands, which is the only way this
 * stops recurring.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const ROUTES = join(ROOT, "apps/backend/src/safety/fines.routes.ts");
const CREATOR = join(ROOT, "apps/frontend/src/pages/safety/components/FineCreateModal.tsx");

function routeFields(src) {
  const schema = /const createFineBody = z\.object\(\{([\s\S]*?)\n\}\);/.exec(src);
  if (!schema) return null;
  return [...schema[1].matchAll(/^ {2}(\w+):/gm)].map((m) => m[1]);
}

/**
 * Extract the payload object by BALANCING BRACES, not by matching a closing token. The creator has
 * legitimately been written both as `createSafetyFine(id, {...})` inside an arrow (closing `}),`)
 * and as an awaited call in a block (closing `});`). A regex pinned to one of those shapes silently
 * stops finding the payload when the other is used — and this guard's whole job is noticing a field
 * that is missing, so a parser that can fail to read the payload at all is the one failure mode it
 * cannot have. Only top-level keys count: a nested object's keys are not payload fields.
 */
function creatorPayloadKeys(src) {
  const start = src.indexOf("createSafetyFine(input.companyId, {");
  if (start === -1) return null;
  const open = src.indexOf("{", start);
  let depth = 0;
  let end = -1;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return null;

  const body = src.slice(open + 1, end);
  const keys = new Set();
  let nest = 0;
  for (const line of body.split("\n")) {
    const key = /^\s*(\w+):/.exec(line);
    if (key && nest === 0) keys.add(key[1]);
    nest += (line.match(/[{[(]/g) ?? []).length - (line.match(/[}\])]/g) ?? []).length;
    if (nest < 0) nest = 0;
  }
  return keys;
}

export function run() {
  const routesSrc = readFileSync(ROUTES, "utf8");
  const creatorSrc = readFileSync(CREATOR, "utf8");

  const fields = routeFields(routesSrc);
  if (!fields || fields.length === 0) {
    return {
      ok: false,
      fields: [],
      missing: [],
      message:
        "FAIL: could not parse createFineBody from fines.routes.ts — the guard lost its subject and " +
        "would pass vacuously. Fix the parser rather than ignoring this.",
    };
  }

  const sent = creatorPayloadKeys(creatorSrc);
  if (!sent) {
    return {
      ok: false,
      fields,
      missing: [],
      message:
        "FAIL: could not parse the createSafetyFine payload from FineCreateModal.tsx — the guard " +
        "lost its subject. Fix the parser rather than ignoring this.",
    };
  }

  const missing = fields.filter((f) => !sent.has(f));
  const ok = missing.length === 0;
  return {
    ok,
    fields,
    missing,
    message: ok
      ? `PASS: the fine creator sends all ${fields.length} of ${fields.length} fields the create route accepts.`
      : `FAIL: the create route accepts ${fields.length} fields and the creator sends ${fields.length - missing.length}. ` +
        `NEVER COLLECTED: ${missing.join(", ")}. A field the route accepts and no UI collects stays null on every ` +
        `row forever — collect it, or remove it from the route so the schema stops promising it.`,
  };
}

/**
 * Plants the real defect back into the real creator — dropping each accepted field from the payload
 * one at a time — and requires every one to be caught. Includes source_doc_id explicitly, which is
 * the field this block restored.
 */
function selftest() {
  const original = readFileSync(CREATOR, "utf8");
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository already red before any mutation.\n${baseline.message}`);
    process.exit(1);
  }

  const targets = ["source_doc_id", "violation_code", "related_load_id"];
  for (const field of targets) {
    const re = new RegExp(`^\\s+${field}: .*$\\n`, "m");
    if (!re.test(original)) {
      console.error(`SELFTEST FAIL: could not find "${field}" in the creator payload — mutation would be a no-op.`);
      process.exit(1);
    }
    let caught;
    try {
      writeFileSync(CREATOR, original.replace(re, ""), "utf8");
      caught = run();
    } finally {
      writeFileSync(CREATOR, original, "utf8");
    }
    if (caught.ok || !caught.missing.includes(field)) {
      console.error(`SELFTEST FAIL: dropping "${field}" was NOT caught.\nGuard said: ${caught.message}`);
      process.exit(1);
    }
    console.log(`  caught: creator stops sending ${field}`);
  }

  const after = run();
  if (!after.ok) {
    console.error(`SELFTEST FAIL: restore did not return the repository to green.\n${after.message}`);
    process.exit(1);
  }
  console.log(`SELFTEST PASS: all ${targets.length} planted omissions were caught and the repository restored green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (result.fields?.length) console.log(`  route fields: ${result.fields.join(", ")}`);
  if (!result.ok) process.exit(1);
}

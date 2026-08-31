#!/usr/bin/env node
/**
 * INSURANCE REQUEST FEATURE (owner-authorized 2026-08-31) — static-shape guard.
 *
 * One pipeline, two request types today (customer COI + driver-add to the insurer), built to
 * extend to a third (unit-add) with zero further schema change. Extends the EXISTING
 * insurance.coi_request table additively -- no second table, no second email sender. This guard
 * asserts the structural invariants the owner named explicitly:
 *   1. The migration widens coi_request additively (customer_id nullable, request_type/driver_id/
 *      unit_id added, status CHECK extended) and widens docs.file_links.entity_type for
 *      'insurance_request' hub-linking (Rule 14) -- never a second table.
 *   2. "NOTHING SENDS AUTOMATICALLY. A human presses send." -- the send service is called from
 *      exactly one route (a POST), never from a cron/background job, and enqueues through the
 *      EXISTING enqueueEmail() pipeline (no raw INSERT INTO email.email_queue, no new sender).
 *   3. LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: a resend past a terminal status
 *      (sent/acknowledged/issued/declined) is blocked for most roles, but Owner/Accountant have an
 *      authorized override, and it is logged -- never a hard, unfixable wall.
 *   4. The 2 new email templates are registered in the allow-list (an unregistered template throws
 *      at send time -- this already happened once for scheduled-report-file).
 */
import { readFileSync, existsSync } from "node:fs";

const MIGRATION = "db/migrations/202613310200_insurance_coi_request_multi_type_extend.sql";
const SHARED = "apps/backend/src/insurance/coi.shared.ts";
const SEND_SERVICE = "apps/backend/src/insurance/coi-send.service.ts";
const ROUTES = "apps/backend/src/insurance/coi-request.routes.ts";
const RENDER = "apps/backend/src/email/render.ts";
const FILES_ROUTES = "apps/backend/src/docs/files.routes.ts";

function read(path) {
  return readFileSync(path, "utf8");
}

function analyze({ migration, shared, sendService, routes, render, filesRoutes }) {
  const failures = [];

  // (1) Additive migration shape -- no second table.
  if (!/ALTER TABLE insurance\.coi_request ALTER COLUMN customer_id DROP NOT NULL/.test(migration)) {
    failures.push(`${MIGRATION}: customer_id must be widened to nullable (driver_add/unit_add have no customer)`);
  }
  if (!/ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'customer_coi'/.test(migration)) {
    failures.push(`${MIGRATION}: request_type column (defaulting existing rows to customer_coi) missing`);
  }
  if (!/ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES mdata\.drivers\(id\)/.test(migration)) {
    failures.push(`${MIGRATION}: driver_id FK column missing`);
  }
  if (!/ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata\.units\(id\)/.test(migration)) {
    failures.push(`${MIGRATION}: unit_id FK column missing (unit-add must extend the same shape)`);
  }
  if (!/'requested', 'acknowledged', 'issued', 'declined'/.test(migration)) {
    failures.push(`${MIGRATION}: owner lifecycle vocabulary (requested/acknowledged/issued/declined) not added to the status CHECK`);
  }
  if (/CREATE TABLE\s+insurance\./i.test(migration)) {
    failures.push(`${MIGRATION}: creates a new insurance.* table -- owner directive was explicitly "NO second table"`);
  }
  if (!/'bill', 'insurance_request'/.test(migration)) {
    failures.push(`${MIGRATION}: docs.file_links.entity_type CHECK must widen to include 'insurance_request' for hub-linking`);
  }

  // (2) "A human presses send" -- sendCoiRequest must be called from a route (POST), never wired
  //     into any cron/scheduled job file.
  if (!/export async function sendCoiRequest/.test(sendService)) {
    failures.push(`${SEND_SERVICE}: sendCoiRequest export missing`);
  }
  if (!/app\.post\(\s*\n?\s*"\/api\/v1\/insurance\/coi-requests\/:id\/send"/.test(routes)) {
    failures.push(`${ROUTES}: POST .../coi-requests/:id/send route missing -- send must be an explicit human action, not automatic`);
  }
  if (!/import\s*{\s*enqueueEmail\s*}\s*from\s*"\.\.\/email\/queue\.service\.js"/.test(sendService)) {
    failures.push(`${SEND_SERVICE}: must call the EXISTING enqueueEmail() pipeline, not a raw INSERT INTO email.email_queue / a new sender`);
  }
  if (/INSERT INTO email\.email_queue/.test(sendService)) {
    failures.push(`${SEND_SERVICE}: raw INSERT INTO email.email_queue found -- must go through enqueueEmail(), the one canonical enqueue path`);
  }

  // (3) LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01: authorized override, not a hard wall.
  if (!/canForceOverride/.test(routes) || !/\["Owner", "Accountant"\]/.test(routes)) {
    failures.push(`${ROUTES}: force-resend override must be gated to Owner/Accountant only (canForceOverride)`);
  }
  if (!/force_resend_reason/.test(sendService)) {
    failures.push(`${SEND_SERVICE}: a forced resend must carry a reason through to the audit trail`);
  }
  if (!/status IN \('acknowledged', 'issued', 'declined'\) THEN status ELSE 'sent'/.test(sendService)) {
    failures.push(`${SEND_SERVICE}: a resend must never regress status back to 'sent' once acknowledged/issued/declined (reverse, never delete/overwrite history)`);
  }

  // (4) Templates registered (an unregistered key throws at actual send time).
  if (!/"insurance-coi-request"/.test(render) || !/"insurance-driver-add-request"/.test(render)) {
    failures.push(`${RENDER}: both new templates must be in the allow-list, or sendCoiRequest throws unsupported_email_template at send time`);
  }

  // (5) docs/file_links: the new entity type must have a real existence-check branch, not just be
  //     declared in the enum (DOC-F10063 lesson: a type with no reachable branch silently 404s).
  if (!/entityType === "insurance_request"/.test(filesRoutes)) {
    failures.push(`${FILES_ROUTES}: ensureLinkEntityExists() has no branch for "insurance_request" -- every link attempt would silently fail`);
  }

  return failures;
}

function readAll() {
  return {
    migration: read(MIGRATION),
    shared: read(SHARED),
    sendService: read(SEND_SERVICE),
    routes: read(ROUTES),
    render: read(RENDER),
    filesRoutes: read(FILES_ROUTES),
  };
}

function selftest() {
  if (!existsSync(MIGRATION)) {
    console.error(`verify-insurance-request-pipeline-shape --selftest: FAIL -- ${MIGRATION} does not exist`);
    process.exit(1);
  }
  const real = readAll();
  const good = analyze(real);
  if (good.length > 0) {
    console.error("verify-insurance-request-pipeline-shape --selftest: FAIL on the real (good) files");
    for (const f of good) console.error(`  - ${f}`);
    process.exit(1);
  }

  // Every mutation below is applied to an IN-MEMORY STRING ONLY, never written to disk — a
  // selftest must never mutate tracked source (GUARD-SELFTEST-MUTATES-SOURCE-2026-08-31.md).
  const cases = [
    {
      name: "drop customer_id DROP NOT NULL",
      mutate: (f) => ({ ...f, migration: f.migration.replace("ALTER TABLE insurance.coi_request ALTER COLUMN customer_id DROP NOT NULL;", "") }),
    },
    {
      name: "drop request_type column",
      mutate: (f) => ({ ...f, migration: f.migration.replace("ADD COLUMN IF NOT EXISTS request_type text NOT NULL DEFAULT 'customer_coi';", "") }),
    },
    {
      name: "drop driver_id column",
      mutate: (f) => ({ ...f, migration: f.migration.replace(/ADD COLUMN IF NOT EXISTS driver_id uuid REFERENCES mdata\.drivers\(id\),\n/, "") }),
    },
    {
      name: "drop unit_id column",
      mutate: (f) => ({ ...f, migration: f.migration.replace(/ADD COLUMN IF NOT EXISTS unit_id uuid REFERENCES mdata\.units\(id\);/, ";") }),
    },
    {
      name: "drop owner lifecycle statuses",
      mutate: (f) => ({ ...f, migration: f.migration.replace("'requested', 'acknowledged', 'issued', 'declined'", "'requested'") }),
    },
    {
      name: "drop insurance_request from file_links widen",
      mutate: (f) => ({ ...f, migration: f.migration.replace(/'bill', 'insurance_request'/, "'bill'") }),
    },
    {
      name: "remove the send route",
      mutate: (f) => ({ ...f, routes: f.routes.replace('"/api/v1/insurance/coi-requests/:id/send"', '"/api/v1/insurance/coi-requests/:id/nope"') }),
    },
    {
      name: "route to a raw email_queue insert instead of enqueueEmail",
      mutate: (f) => ({
        ...f,
        sendService: f.sendService.replace('import { enqueueEmail } from "../email/queue.service.js";', "").replace(
          "const { queueId } = await enqueueEmail({",
          'await client.query("INSERT INTO email.email_queue (x) VALUES ($1)", []); const queueId = "x"; const _skip = ({'
        ),
      }),
    },
    {
      name: "widen force-override beyond Owner/Accountant",
      mutate: (f) => ({ ...f, routes: f.routes.replace('["Owner", "Accountant"]', '["Owner", "Accountant", "Dispatcher"]') }),
    },
    {
      name: "drop the force_resend_reason plumbing",
      mutate: (f) => ({
        ...f,
        sendService: f.sendService
          .replace(/force_resend_reason\??:\s*string \| null;?\n/, "")
          .replace("if (alreadyTerminal && !input.force_resend_reason) {", "if (alreadyTerminal) {"),
      }),
    },
    {
      name: "let a resend regress status back to sent",
      mutate: (f) => ({
        ...f,
        sendService: f.sendService.replace(
          "SET status = CASE WHEN status IN ('acknowledged', 'issued', 'declined') THEN status ELSE 'sent' END,",
          "SET status = 'sent',"
        ),
      }),
    },
    {
      name: "un-register insurance-coi-request template",
      mutate: (f) => ({ ...f, render: f.render.replace('"insurance-coi-request",\n', "") }),
    },
    {
      name: "drop the insurance_request branch in ensureLinkEntityExists",
      mutate: (f) => ({
        ...f,
        filesRoutes: f.filesRoutes.replace(
          /if \(entityType === "insurance_request"\) \{[\s\S]*?\n  \}\n  return false;/,
          "return false;"
        ),
      }),
    },
  ];

  for (const { name, mutate } of cases) {
    const mutated = mutate(real);
    const changed = Object.keys(mutated).some((k) => mutated[k] !== real[k]);
    if (!changed) {
      console.error(`verify-insurance-request-pipeline-shape --selftest: mutation "${name}" did not change anything -- pattern out of sync`);
      process.exit(1);
    }
    const failures = analyze(mutated);
    if (failures.length === 0) {
      console.error(`verify-insurance-request-pipeline-shape --selftest: NOT CAUGHT -- ${name}`);
      process.exit(1);
    }
    console.log(`  caught: ${name}`);
  }
  console.log(`SELFTEST PASS: ${cases.length}/${cases.length} planted regressions caught (in-memory only, no disk mutation).`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  if (!existsSync(MIGRATION)) {
    console.error(`[verify-insurance-request-pipeline-shape] FAILED: ${MIGRATION} does not exist`);
    process.exit(1);
  }
  const failures = analyze(readAll());
  if (failures.length > 0) {
    console.error("\n[verify-insurance-request-pipeline-shape] FAILED:\n");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log("[verify-insurance-request-pipeline-shape] All checks passed ✓");
  process.exit(0);
}

main();

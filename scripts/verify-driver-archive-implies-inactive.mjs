#!/usr/bin/env node
/**
 * LV-DRIVER-ARCHIVED-NOT-DEACTIVATED — archive must deactivate; alert/message readers
 * must not treat archived drivers as live via deactivated_at-only filters.
 *
 * Prod proved 4 TEST-DRIVER seed rows archived while status='Active' and deactivated_at NULL,
 * so document alerts / messages that filter only deactivated_at still targeted them.
 */
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { maskComments } from "./lib/mask-comments.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const LABEL = "verify-driver-archive-implies-inactive";

const BULK = "apps/backend/src/drivers/drivers-bulk.routes.ts";
const ALERTS = "apps/backend/src/drivers/document-alerts.service.ts";
const MESSAGES = "apps/backend/src/drivers/messages.service.ts";

function readMasked(rel) {
  return maskComments(readFileSync(join(ROOT, rel), "utf8"));
}

export function auditSources(sources) {
  const problems = [];
  const bulk = sources.bulk ?? "";
  // Archive UPDATE must stamp deactivated_at (and not leave Active-only archive).
  if (!/archived_at\s*=\s*COALESCE\(archived_at,\s*now\(\)\)/.test(bulk)) {
    problems.push(`${BULK}: missing archived_at stamp on bulk archive UPDATE`);
  }
  if (!/deactivated_at\s*=\s*COALESCE\(deactivated_at,\s*now\(\)\)/.test(bulk)) {
    problems.push(`${BULK}: archive UPDATE must also stamp deactivated_at (archive implies inactive)`);
  }
  if (!/status\s*=\s*CASE[\s\S]*?Inactive'::mdata\.driver_status/.test(bulk)) {
    problems.push(`${BULK}: archive UPDATE must force non-terminal status to Inactive`);
  }
  const archiveStart = bulk.indexOf("async function handleArchive");
  const archiveEnd = bulk.indexOf("async function handleAssignTruck", archiveStart);
  const archive = archiveStart >= 0 && archiveEnd > archiveStart ? bulk.slice(archiveStart, archiveEnd) : "";
  if (!/driver-default:\$\{ctx\.operatingCompanyId\}:\$\{ctx\.id\}/.test(archive)) {
    problems.push(`${BULK}: archive must acquire the canonical driver lifecycle lock`);
  }
  if (!/pg_advisory_xact_lock\(hashtextextended\(\$1::text, 0\)\)/.test(archive)) {
    problems.push(`${BULK}: archive driver lifecycle lock must be transaction-scoped`);
  }
  if (!/UPDATE telematics\.vehicle_driver_assignments[\s\S]*driver_id = \$1::uuid[\s\S]*operating_company_id = \$2::uuid[\s\S]*is_default = true[\s\S]*ended_at IS NULL[\s\S]*RETURNING id::text, unit_id::text/.test(archive)) {
    problems.push(`${BULK}: archive must close company-scoped open default assignments with identity evidence`);
  }
  if (!/UPDATE mdata\.units[\s\S]*SET assigned_driver_id = NULL[\s\S]*assigned_driver_id = \$1::uuid[\s\S]*owner_company_id = \$2::uuid OR currently_leased_to_company_id = \$2::uuid[\s\S]*RETURNING id::text/.test(archive)) {
    problems.push(`${BULK}: archive must clear company-owned unit mirrors with identity evidence`);
  }
  if (!/ended_assignment_ids:[\s\S]*ended_assignment_unit_ids:[\s\S]*cleared_unit_ids:/.test(archive)) {
    problems.push(`${BULK}: archive audit must retain assignment and cleared-unit identities`);
  }

  for (const [rel, key] of [
    [ALERTS, "alerts"],
    [MESSAGES, "messages"],
  ]) {
    const text = sources[key] ?? "";
    // Every driver deactivated_at filter in these files must be paired with archived_at.
    const re = /AND\s+d\.deactivated_at\s+IS\s+NULL/g;
    let m;
    while ((m = re.exec(text))) {
      const window = text.slice(m.index, m.index + 120);
      if (!/archived_at\s+IS\s+NULL/.test(window)) {
        problems.push(
          `${rel}: deactivated_at-only live filter near offset ${m.index} — archived drivers still look live`
        );
      }
    }
  }
  return problems;
}

function auditTree() {
  return auditSources({
    bulk: readMasked(BULK),
    alerts: readMasked(ALERTS),
    messages: readMasked(MESSAGES),
  });
}

function selftest() {
  const good = {
    bulk: `async function handleArchive(ctx) {
      await ctx.client.query(\`SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))\`, [
        \`driver-default:${"${ctx.operatingCompanyId}"}:${"${ctx.id}"}\`,
      ]);
      UPDATE mdata.drivers
      SET
        archived_at = COALESCE(archived_at, now()),
        deactivated_at = COALESCE(deactivated_at, now()),
        status = CASE
          WHEN status::text IN ('Inactive', 'Terminated') THEN status
          ELSE 'Inactive'::mdata.driver_status
        END
      UPDATE telematics.vehicle_driver_assignments SET ended_at = now()
      WHERE driver_id = $1::uuid AND operating_company_id = $2::uuid
        AND is_default = true AND ended_at IS NULL
      RETURNING id::text, unit_id::text
      UPDATE mdata.units SET assigned_driver_id = NULL
      WHERE assigned_driver_id = $1::uuid
        AND (owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid)
      RETURNING id::text
      audit({ ended_assignment_ids: [], ended_assignment_unit_ids: [], cleared_unit_ids: [] });
    }
    async function handleAssignTruck() {}
    `,
    alerts: `AND d.deactivated_at IS NULL\n          AND d.archived_at IS NULL`,
    messages: `AND d.deactivated_at IS NULL\n        AND d.archived_at IS NULL`,
  };
  if (auditSources(good).length !== 0) throw new Error("selftest good failed");

  const badArchive = {
    ...good,
    bulk: `SET archived_at = COALESCE(archived_at, now()), updated_at = now()`,
  };
  if (auditSources(badArchive).length < 1) throw new Error("selftest bad archive failed");

  const badReader = {
    ...good,
    alerts: `AND d.deactivated_at IS NULL\n          AND d.cdl_expires_at IS NOT NULL`,
  };
  if (auditSources(badReader).length < 1) throw new Error("selftest bad reader failed");

  const archiveMutations = [
    good.bulk.replace("pg_advisory_xact_lock", "pg_advisory_lock"),
    good.bulk.replace("driver-default:${ctx.operatingCompanyId}:${ctx.id}", "driver-default:${ctx.id}"),
    good.bulk.replace("AND is_default = true", "AND is_default = false"),
    good.bulk.replace("RETURNING id::text, unit_id::text", "RETURNING driver_id::text"),
    good.bulk.replace("SET assigned_driver_id = NULL", "SET updated_at = now()"),
    good.bulk.replace("owner_company_id = $2::uuid OR currently_leased_to_company_id = $2::uuid", "owner_company_id IS NOT NULL"),
    good.bulk.replace("ended_assignment_ids: [], ended_assignment_unit_ids: [], cleared_unit_ids: []", "cleared_unit_ids: []"),
  ];
  archiveMutations.forEach((mutation, index) => {
    if (mutation === good.bulk || auditSources({ ...good, bulk: mutation }).length < 1) {
      throw new Error(`selftest archive mutation escaped: ${index + 1}`);
    }
  });

  console.log(`${LABEL}: selftest PASS (10/10)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const problems = auditTree();
  if (problems.length) {
    console.error(`${LABEL}: FAIL (${problems.length})`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK`);
}

main();

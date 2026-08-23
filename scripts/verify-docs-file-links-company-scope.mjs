#!/usr/bin/env node
/**
 * verify-docs-file-links-company-scope.mjs  (DOCS-F6072)
 *
 * Root cause: apps/backend/src/docs/files.routes.ts's ensureLinkEntityExists() looked up the
 * link target (driver/customer/vendor/unit/equipment/load/invoice/settlement) by bare id with NO
 * operating_company_id predicate at all, even though every one of those tables is company-scoped
 * (operating_company_id NOT NULL). Any accessible-company user who knew a UUID from a DIFFERENT
 * company could link a file to it. The same class of gap existed on several sibling docs.files
 * mutation routes (PATCH metadata, POST links, DELETE link, DELETE file, POST restore, POST
 * versions), which read/wrote a file by bare id with no `operating_company_id IN (SELECT
 * org.user_accessible_company_ids())` predicate, letting a user with access to ANY company act on
 * a file that belongs to a company they don't have access to.
 *
 * This guard makes the regression impossible to re-ship across every one of those call sites.
 *
 * Usage:
 *   node scripts/verify-docs-file-links-company-scope.mjs            # scan
 *   node scripts/verify-docs-file-links-company-scope.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ROUTES_FILE = "apps/backend/src/docs/files.routes.ts";

const ENTITY_TABLES = [
  "mdata.drivers",
  "mdata.customers",
  "mdata.vendors",
  "mdata.units",
  "mdata.equipment",
  "mdata.loads",
  "accounting.invoices",
  "driver_finance.driver_settlements",
];

const ACCESSIBLE_COMPANIES = "operating_company_id IN (SELECT org.user_accessible_company_ids())";

const ROUTE_CHECKS = [
  {
    name: "ensureLinkEntityExists — every entity table",
    marker: "async function ensureLinkEntityExists(",
    check(slice, offenders) {
      if (!/operatingCompanyId: string\s*\)/.test(slice)) {
        offenders.push(`${ROUTES_FILE}: ensureLinkEntityExists() no longer takes an operatingCompanyId parameter`);
        return;
      }
      for (const table of ENTITY_TABLES) {
        const re = new RegExp(`FROM ${table.replace(".", "\\.")}[^\`"]*\\bid = \\$1\\b[^\`"]*\\boperating_company_id = \\$2\\b`);
        if (!re.test(slice)) {
          offenders.push(`${ROUTES_FILE}: ensureLinkEntityExists() lookup against ${table} has no operating_company_id = $2 predicate`);
        }
      }
    },
  },
  {
    name: "POST /upload-url — entity_links validation passes operatingCompanyId",
    marker: 'app.post("/api/v1/docs/files/upload-url",',
    check(slice, offenders) {
      if (!/ensureLinkEntityExists\(client, link\.entity_type, link\.entity_id, operatingCompanyId\)/.test(slice)) {
        offenders.push(`${ROUTES_FILE}: POST /upload-url entity_links validation no longer passes operatingCompanyId to ensureLinkEntityExists`);
      }
    },
  },
  {
    name: "PATCH /:file_id — existing-file lookup company-scoped",
    marker: 'app.patch("/api/v1/docs/files/:file_id",',
    check(slice, offenders) {
      if (!slice.includes(ACCESSIBLE_COMPANIES)) {
        offenders.push(`${ROUTES_FILE}: PATCH /:file_id existing-file lookup has no accessible-company predicate — can read/patch another company's file`);
      }
    },
  },
  {
    name: "POST /:file_id/links — file lookup + entity check both company-scoped",
    marker: 'app.post("/api/v1/docs/files/:file_id/links",',
    check(slice, offenders) {
      if (!slice.includes(ACCESSIBLE_COMPANIES)) {
        offenders.push(`${ROUTES_FILE}: POST /:file_id/links file lookup has no accessible-company predicate`);
      }
      if (!/ensureLinkEntityExists\(client, body\.entity_type, body\.entity_id, String\(fileRes\.rows\[0\]\.operating_company_id\)\)/.test(slice)) {
        offenders.push(`${ROUTES_FILE}: POST /:file_id/links no longer scopes the link-target check to the file's own operating_company_id`);
      }
    },
  },
  {
    name: "DELETE /:file_id/links/:link_id — unlink company-scoped via parent file",
    marker: 'app.delete("/api/v1/docs/files/:file_id/links/:link_id",',
    check(slice, offenders) {
      if (!/file_id IN \(SELECT id FROM docs\.files WHERE operating_company_id IN \(SELECT org\.user_accessible_company_ids\(\)\)\)/.test(slice)) {
        offenders.push(`${ROUTES_FILE}: DELETE /:file_id/links/:link_id has no accessible-company predicate on the parent file`);
      }
    },
  },
  {
    name: "DELETE /:file_id — soft-delete company-scoped",
    marker: 'app.delete("/api/v1/docs/files/:file_id",',
    check(slice, offenders) {
      if (!slice.includes(ACCESSIBLE_COMPANIES)) {
        offenders.push(`${ROUTES_FILE}: DELETE /:file_id (soft delete) has no accessible-company predicate — can delete another company's file`);
      }
    },
  },
  {
    name: "POST /:file_id/restore — restore company-scoped",
    marker: 'app.post("/api/v1/docs/files/:file_id/restore",',
    check(slice, offenders) {
      if (!slice.includes(ACCESSIBLE_COMPANIES)) {
        offenders.push(`${ROUTES_FILE}: POST /:file_id/restore has no accessible-company predicate — can restore another company's file`);
      }
    },
  },
  {
    name: "POST /:file_id/versions — parent-file lookup company-scoped",
    marker: 'app.post("/api/v1/docs/files/:file_id/versions",',
    check(slice, offenders) {
      if (!slice.includes(ACCESSIBLE_COMPANIES)) {
        offenders.push(`${ROUTES_FILE}: POST /:file_id/versions parent-file lookup has no accessible-company predicate`);
      }
    },
  },
];

export function checkDocsFileCompanyScope(src) {
  const offenders = [];
  const markerIndexes = ROUTE_CHECKS.map((r) => ({ ...r, idx: src.indexOf(r.marker) }));
  for (const entry of markerIndexes) {
    const { name, marker, idx } = entry;
    if (idx === -1) {
      offenders.push(`${ROUTES_FILE}: route/function marker not found — ${name} (${marker}) — has this moved or been renamed?`);
      continue;
    }
    const laterIdxs = markerIndexes.filter((m) => m.idx > idx).map((m) => m.idx);
    const nextIdx = laterIdxs.length > 0 ? Math.min(...laterIdxs) : src.length;
    const slice = src.slice(idx, nextIdx);
    entry.check(slice, offenders);
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, ROUTES_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkDocsFileCompanyScope(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    async function ensureLinkEntityExists(client, entityType, entityId) {
      if (entityType === "driver") {
        const res = await client.query("SELECT id FROM mdata.drivers WHERE id = $1 LIMIT 1", [entityId]);
        return res.rows.length > 0;
      }
    }

    app.post("/api/v1/docs/files/upload-url", async (req, reply) => {
      const exists = await ensureLinkEntityExists(client, link.entity_type, link.entity_id);
    });

    app.patch("/api/v1/docs/files/:file_id", async (req, reply) => {
      const existingRes = await client.query(\`SELECT id FROM docs.files WHERE id = $1 LIMIT 1\`, [id]);
    });

    app.post("/api/v1/docs/files/:file_id/links", async (req, reply) => {
      const fileRes = await client.query(\`SELECT id FROM docs.files WHERE id = $1 LIMIT 1\`, [id]);
      const entityExists = await ensureLinkEntityExists(client, body.entity_type, body.entity_id);
    });

    app.delete("/api/v1/docs/files/:file_id/links/:link_id", async (req, reply) => {
      const res = await client.query(\`UPDATE docs.file_links SET deleted_at = now() WHERE id = $1 AND file_id = $2\`, [id, fileId]);
    });

    app.delete("/api/v1/docs/files/:file_id", async (req, reply) => {
      const res = await client.query(\`UPDATE docs.files SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL\`, [id]);
    });

    app.post("/api/v1/docs/files/:file_id/restore", async (req, reply) => {
      const res = await client.query(\`UPDATE docs.files SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL\`, [id]);
    });

    app.post("/api/v1/docs/files/:file_id/versions", async (req, reply) => {
      const parentRes = await client.query(\`SELECT id, operating_company_id FROM docs.files WHERE id = $1 LIMIT 1\`, [id]);
    });
  `;

  const abs = path.join(repoRoot, ROUTES_FILE);
  const fixed = fs.readFileSync(abs, "utf8");

  const buggyFails = checkDocsFileCompanyScope(buggy).length > 0;
  const fixedPasses = checkDocsFileCompanyScope(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:docs-file-links-company-scope selftest OK");
    process.exit(0);
  }
  console.error("verify:docs-file-links-company-scope selftest FAILED", {
    buggyFails,
    fixedPasses,
    fixedOffenders: checkDocsFileCompanyScope(fixed),
  });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:docs-file-links-company-scope FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:docs-file-links-company-scope OK — every docs.files mutation/lookup route company-scopes by the resolved operating company");
}

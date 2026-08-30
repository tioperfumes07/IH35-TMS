#!/usr/bin/env node
/**
 * @matrix-built [{"module":"program","leaf":"nav.scenario","cols":["connectivity"]}]
 * CLS-ORPHAN-SURFACE — POD/BOL evidence must be REACHABLE from its load, and the scenario probe must
 * measure the table the product actually writes.
 *
 * Measured on the Neon prod branch br-fancy-credit-akjnd07a on 2026-08-07: `docs.files` held 30 rows
 * while `docs.file_links` held ZERO — every uploaded document was an orphan. Two independent causes,
 * and this guard pins both because either one alone re-breaks the chain:
 *
 *  (A) `apps/driver-pwa/src/lib/upload-sync.ts` grouped `load_stop` with `standalone` and returned no
 *      entity link. `load_stop` is what StopAction → UploadDocumentModal sends, i.e. the ONE surface a
 *      driver uses to submit proof of delivery. `docs.file_links.entity_type` has no `load_stop`
 *      member (prod CHECK chk_file_links_entity_type_widened_taxdoc), and the resolution taken at the
 *      time was to drop the link rather than to link the PARENT LOAD — so the POD was unreachable from
 *      the load, the customer, the invoice and the factoring submission.
 *
 *  (B) the `hop.pod_bol` probe in `apps/backend/src/home/scenario-registry.ts` counted ONLY
 *      `docs.file_links`. A captured POD lands in `dispatch.pod_documents` (POST
 *      /api/v1/driver/loads/:loadId/stops/:stopId/pod) and a generated BOL in `dispatch.bol_documents`
 *      — and those two are exactly what the office reads back at GET
 *      /api/v1/dispatch/loads/:loadId/pod-bol. The dot measured a different table from the one the
 *      product writes and reads, so it could not have gone green from a real capture.
 *
 * Usage: node scripts/verify-pod-bol-evidence-linkage.mjs [--selftest]
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-pod-bol-evidence-linkage";

const SYNC_PATH = "apps/driver-pwa/src/lib/upload-sync.ts";
const REGISTRY_PATH = "apps/backend/src/home/scenario-registry.ts";
const MODAL_CALLERS_GLOB = [
  "apps/driver-pwa/src/pages/StopAction.tsx",
];

/**
 * Every `<UploadDocumentModal …>` element in a source file, as raw text.
 *
 * Matched by scanning to the element's own `/>` or `>`, not by a lazy `[\s\S]*?>`: a prop value can
 * contain a `>` inside a JSX expression (`onClick={() => …}`), and a lazy match ends at the first one,
 * which would silently truncate the element and hide the very prop being asserted.
 */
export function extractUploadModalElements(src) {
  const out = [];
  const re = /<UploadDocumentModal\b/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let braces = 0;
    let quote = null;
    while (i < src.length) {
      const ch = src[i];
      if (quote) {
        if (ch === quote) quote = null;
      } else if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
      } else if (ch === "{") braces++;
      else if (ch === "}") braces--;
      else if (ch === ">" && braces === 0) break;
      i++;
    }
    out.push(src.slice(m.index, i + 1));
  }
  return out;
}

/** A stop-scoped capture must carry the load it belongs to, or its link has nowhere to go. */
export function findStopCapturesMissingParentLoad(src, label) {
  const bad = [];
  for (const el of extractUploadModalElements(src)) {
    if (!/defaultEntityType\s*=\s*(?:"load_stop"|\{\s*["'`]load_stop["'`]\s*\})/.test(el)) continue;
    if (/\bparentLoadId\s*=/.test(el)) continue;
    bad.push(label);
  }
  return bad;
}

/**
 * `standalone` is the ONLY entity type allowed to produce no link — that is what the word means.
 * Any other type appearing in the early `return undefined` is the exact regression (A).
 */
export function findExtraUnlinkedEntityTypes(src) {
  const fn = /export function resolveEntityLinks\b[\s\S]*?\n}/.exec(src);
  if (!fn) return ["resolveEntityLinks is not exported from upload-sync.ts"];
  const early = /if\s*\(([^)]*)\)\s*return undefined;/.exec(fn[0]);
  if (!early) return ["resolveEntityLinks has no early no-link branch to check"];
  const types = [...early[1].matchAll(/["'`]([a-z_]+)["'`]/g)].map((m) => m[1]);
  return types.filter((t) => t !== "standalone").map((t) => `entity_type "${t}" produces NO link`);
}

/**
 * The probe must COUNT the canonical stores the office reads, not only the document library.
 *
 * Checked against the probe's SQL alone, never the whole registry entry. The entry also carries a
 * `sources: [...]` array naming the same tables, and an earlier draft of this guard matched anywhere
 * in the entry — so rewriting the SQL to read a different table while leaving `sources` untouched
 * passed at exit 0. That is the "paste the word into a comment" failure mode a guard is supposed to
 * prevent, not exhibit; caught by mutating the real registry, which is why the SQL is isolated here
 * and why the selftest asserts the sources-array-only shape FAILS.
 */
export function findMissingProbeSources(src) {
  const entry = /key:\s*["'`]hop\.pod_bol["'`][\s\S]*?\n  },/.exec(src);
  if (!entry) return ["hop.pod_bol is not present in scenario-registry.ts"];
  const sql = /sql:\s*`([\s\S]*?)`/.exec(entry[0]);
  if (!sql) return ["hop.pod_bol has no probe.sql to check"];
  const missing = [];
  for (const table of ["dispatch.pod_documents", "dispatch.bol_documents"]) {
    if (!sql[1].includes(table)) missing.push(`hop.pod_bol probe SQL never reads ${table}`);
  }
  if (/FROM\s+docs\.file_links\b/i.test(sql[1])) {
    const genericCategoryJoin = /JOIN\s+catalogs\.file_categories\s+fc\s+ON\s+fc\.id\s*=\s*f\.category_id/i.test(sql[1]);
    const splitCategoryJoins =
      /JOIN\s+catalogs\.file_categories\s+pod_fc\s+ON\s+pod_fc\.id\s*=\s*pod_f\.category_id/i.test(sql[1]) &&
      /JOIN\s+catalogs\.file_categories\s+bol_fc\s+ON\s+bol_fc\.id\s*=\s*bol_f\.category_id/i.test(sql[1]);
    if (!genericCategoryJoin && !splitCategoryJoins) {
      missing.push("docs-library evidence does not resolve the canonical file category");
    }
    const genericCategoryFilter = /\bfc\.code\s+IN\s*\(\s*['\"]pod['\"]\s*,\s*['\"]bol['\"]\s*\)/i.test(sql[1]);
    const splitCategoryFilters =
      /\bpod_fc\.code\s*=\s*['\"]pod['\"]/i.test(sql[1]) && /\bbol_fc\.code\s*=\s*['\"]bol['\"]/i.test(sql[1]);
    if (!genericCategoryFilter && !splitCategoryFilters) {
      missing.push("docs-library evidence counts non-POD/BOL categories");
    }
    const genericDeletedFilter = /\bf\.deleted_at\s+IS\s+NULL/i.test(sql[1]);
    const splitDeletedFilters =
      /\bpod_f\.deleted_at\s+IS\s+NULL/i.test(sql[1]) && /\bbol_f\.deleted_at\s+IS\s+NULL/i.test(sql[1]);
    if (!genericDeletedFilter && !splitDeletedFilters) {
      missing.push("docs-library evidence counts deleted files");
    }
  }
  return missing;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    [
      "stop capture WITHOUT parentLoadId is flagged",
      () => findStopCapturesMissingParentLoad(`<UploadDocumentModal defaultEntityType="load_stop" defaultEntityId={s.id} onClose={() => close()} />`, "t"),
      1,
    ],
    [
      "stop capture WITH parentLoadId is clean",
      () => findStopCapturesMissingParentLoad(`<UploadDocumentModal defaultEntityType="load_stop" defaultEntityId={s.id} parentLoadId={l.id} onClose={() => close()} />`, "t"),
      0,
    ],
    [
      "a `>` inside an arrow-function prop does not truncate the element",
      // Without brace-aware scanning the element ends at the `>` of `=>` and parentLoadId is unseen,
      // so this reads as a violation. That false failure is the trap this case pins.
      () => findStopCapturesMissingParentLoad(`<UploadDocumentModal onClose={() => close()} defaultEntityType="load_stop" parentLoadId={l.id} />`, "t"),
      0,
    ],
    ["a non-stop capture is out of scope", () => findStopCapturesMissingParentLoad(`<UploadDocumentModal defaultEntityType="driver" />`, "t"), 0],
    [
      "load_stop grouped back into the no-link branch is flagged",
      () => findExtraUnlinkedEntityTypes(`export function resolveEntityLinks(item) {\n  if (item.entity_type === "standalone" || item.entity_type === "load_stop") return undefined;\n  return [];\n}`),
      1,
    ],
    [
      "standalone alone is clean",
      () => findExtraUnlinkedEntityTypes(`export function resolveEntityLinks(item) {\n  if (item.entity_type === "standalone") return undefined;\n  return [];\n}`),
      0,
    ],
    [
      "a resolver that stops being exported is flagged",
      () => findExtraUnlinkedEntityTypes(`function resolveEntityLinks(item) {\n  if (item.entity_type === "standalone") return undefined;\n}`),
      1,
    ],
    [
      "probe reading only docs.file_links is flagged twice",
      () => findMissingProbeSources("  {\n    key: \"hop.pod_bol\",\n    probe: { sql: `SELECT count(*) FROM docs.file_links` },\n  },"),
      5,
    ],
    [
      "probe reading both canonical stores is clean",
      () => findMissingProbeSources("  {\n    key: \"hop.pod_bol\",\n    probe: { sql: `FROM dispatch.pod_documents UNION ALL FROM dispatch.bol_documents` },\n  },"),
      0,
    ],
    [
      "generic load documents cannot masquerade as POD/BOL evidence",
      () =>
        findMissingProbeSources(
          "  {\n    key: \"hop.pod_bol\",\n    probe: { sql: `FROM dispatch.pod_documents UNION ALL FROM dispatch.bol_documents UNION ALL SELECT fl.id FROM docs.file_links fl JOIN docs.files f ON f.id=fl.file_id JOIN mdata.loads l ON l.id=fl.entity_id WHERE f.deleted_at IS NULL` },\n  },"
        ),
      2,
    ],
    [
      "canonical POD/BOL file categories are accepted",
      () =>
        findMissingProbeSources(
          "  {\n    key: \"hop.pod_bol\",\n    probe: { sql: `FROM dispatch.pod_documents UNION ALL FROM dispatch.bol_documents UNION ALL SELECT fl.id FROM docs.file_links fl JOIN docs.files f ON f.id=fl.file_id JOIN catalogs.file_categories fc ON fc.id = f.category_id JOIN mdata.loads l ON l.id=fl.entity_id WHERE f.deleted_at IS NULL AND fc.code IN ('pod', 'bol')` },\n  },"
        ),
      0,
    ],
    [
      "separate canonical POD and BOL document arms are accepted",
      () =>
        findMissingProbeSources(
          "  {\n    key: \"hop.pod_bol\",\n    probe: { sql: `FROM dispatch.pod_documents UNION ALL FROM dispatch.bol_documents UNION ALL SELECT pod_fl.id FROM docs.file_links pod_fl JOIN docs.files pod_f ON pod_f.id=pod_fl.file_id AND pod_f.deleted_at IS NULL JOIN catalogs.file_categories pod_fc ON pod_fc.id = pod_f.category_id AND pod_fc.code = 'pod' UNION ALL SELECT bol_fl.id FROM docs.file_links bol_fl JOIN docs.files bol_f ON bol_f.id=bol_fl.file_id AND bol_f.deleted_at IS NULL JOIN catalogs.file_categories bol_fc ON bol_fc.id = bol_f.category_id AND bol_fc.code = 'bol'` },\n  },"
        ),
      0,
    ],
    [
      "separate arms missing BOL category resolution are rejected",
      () =>
        findMissingProbeSources(
          "  {\n    key: \"hop.pod_bol\",\n    probe: { sql: `FROM dispatch.pod_documents UNION ALL FROM dispatch.bol_documents UNION ALL SELECT pod_fl.id FROM docs.file_links pod_fl JOIN docs.files pod_f ON pod_f.id=pod_fl.file_id AND pod_f.deleted_at IS NULL JOIN catalogs.file_categories pod_fc ON pod_fc.id = pod_f.category_id AND pod_fc.code = 'pod' UNION ALL SELECT bol_fl.id FROM docs.file_links bol_fl JOIN docs.files bol_f ON bol_f.id=bol_fl.file_id AND bol_f.deleted_at IS NULL` },\n  },"
        ),
      2,
    ],
    [
      // The regression this guard shipped with and had to be mutated out of: naming the tables in
      // `sources` while the SQL reads something else must still FAIL.
      "sources array naming the tables does NOT satisfy the SQL requirement",
      () =>
        findMissingProbeSources(
          "  {\n    key: \"hop.pod_bol\",\n    sources: [\"dispatch.pod_documents\", \"dispatch.bol_documents\"],\n    probe: { sql: `SELECT count(*) FROM docs.file_links` },\n  },"
        ),
      5,
    ],
  ];
  let bad = 0;
  for (const [name, run, expect] of cases) {
    const got = run().length;
    if (got !== expect) {
      bad++;
      console.error(`  selftest FAIL: ${name} — expected ${expect}, got ${got}`);
    }
  }
  if (bad) {
    console.error(`${LABEL} --selftest: ${bad} case(s) failed`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

const failures = [];
for (const p of MODAL_CALLERS_GLOB) {
  failures.push(...findStopCapturesMissingParentLoad(readFileSync(p, "utf8"), `${p}: <UploadDocumentModal defaultEntityType="load_stop"> without parentLoadId`));
}
failures.push(...findExtraUnlinkedEntityTypes(readFileSync(SYNC_PATH, "utf8")).map((m) => `${SYNC_PATH}: ${m}`));
failures.push(...findMissingProbeSources(readFileSync(REGISTRY_PATH, "utf8")).map((m) => `${REGISTRY_PATH}: ${m}`));

if (failures.length) {
  console.error(`FAIL ${LABEL} — POD/BOL evidence would be orphaned or unmeasurable:`);
  for (const f of failures) console.error(`  · ${f}`);
  console.error(`\n  A document with no docs.file_links row is unreachable from the load, the customer,`);
  console.error(`  the invoice and the factoring submission. Link a stop capture through its PARENT LOAD`);
  console.error(`  (docs.file_links has no load_stop entity type), and keep the hop.pod_bol probe reading`);
  console.error(`  dispatch.pod_documents + dispatch.bol_documents — the stores GET /api/v1/dispatch/`);
  console.error(`  loads/:loadId/pod-bol reads back.`);
  process.exit(1);
}

console.log(`${LABEL} OK — stop captures carry their parent load, standalone is the only unlinked type, and hop.pod_bol reads the canonical POD/BOL stores.`);

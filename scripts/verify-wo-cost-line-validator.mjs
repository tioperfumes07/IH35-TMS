#!/usr/bin/env node
/**
 * GUARD — C1: the Work Order pre-save cost-line rule must count the lines that are SUBMITTED.
 *
 * THE DEFECT (live, USMCA 2026-08-02): a $1.00 Section-A category line produced Subtotal A $1.00 and a
 * correct WO Total of $1.08, yet the pre-save check "At least one cost line item" stayed RED and the
 * POST never fired — so the Repair WO could not be created even after the vendor fix (#4048).
 *
 * CAUSE: the rule watched the form field `line_items`, which is initialised to [] and populated ONLY
 * in EDIT mode. The Section A/B editor writes to a SEPARATE `lines` state
 * (<TwoSectionLineEditor onChange={setLines} />). In CREATE mode line_items is therefore always empty
 * and the rule is always red, no matter what the operator enters.
 *
 * This is the same class as ACCT-F93, where the vendor-bill validator tested `account_id` — a field
 * the payload builder never assigned. A validator that reads different state than the submit path is
 * not a validator; it is a coin flip that happens to always land the same way.
 *
 * WHAT IT ENFORCES: the cost-line rule references the derived submit arrays (sectionALines /
 * sectionBLines) and does NOT watch `line_items`.
 *
 * DETAIL RATCHET (2026-08-16): WorkOrderDetailPage must not normalize optional service_item_uuid to "".
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:wo-cost-line-validator";
const MODAL = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";
const DETAIL = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const SERVICE = "apps/backend/src/maintenance/two-section-service.ts";
const RULE = "At least one cost line item";
const EMPTY_OPTIONAL_SERVICE_ITEM =
  /service_item_uuid:\s*(?:String\(\s*)?line\.service_item_uuid[\s\S]{0,80}(?:\|\||\?\?)\s*["']{2}/;

function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function analyse(files) {
  const problems = [];
  const raw = files[MODAL];
  if (raw == null) return [`${MODAL} is missing — cannot verify the cost-line rule.`];
  const src = stripComments(raw);

  const idx = src.indexOf(RULE);
  if (idx === -1) {
    problems.push(
      `${MODAL}: the "${RULE}" rule is gone. It is the gate that stops an empty work order from being ` +
        `submitted — removing it is not a fix for it being wrong.`
    );
    return problems;
  }
  // The rule object: from the label to the end of its `ok:` expression.
  const window = src.slice(idx, idx + 400);

  if (/line_items/.test(window)) {
    problems.push(
      `${MODAL}: the "${RULE}" rule still reads \`line_items\`. That form field is populated only in ` +
        `EDIT mode; the Section A/B editor writes to the separate \`lines\` state, so in CREATE mode ` +
        `the rule is permanently red and the POST can never fire.`
    );
  }
  if (!/sectionALines/.test(window) || !/sectionBLines/.test(window)) {
    problems.push(
      `${MODAL}: the "${RULE}" rule does not count sectionALines + sectionBLines — the exact arrays ` +
        `sent in the create payload. The validator and the request must agree on what a cost line is.`
    );
  }
  if (EMPTY_OPTIONAL_SERVICE_ITEM.test(src)) {
    problems.push(
      `${MODAL}: an unselected optional service-item FK is serialized as an empty string. The backend ` +
        `accepts UUID, null, or omission; omit the field so an honestly described catalog-free Section-B line can save.`
    );
  }
  const detailRaw = files[DETAIL];
  if (detailRaw == null) {
    problems.push(`${DETAIL} is missing — cannot verify detail-line optional service-item FK serialization.`);
  } else if (EMPTY_OPTIONAL_SERVICE_ITEM.test(stripComments(detailRaw))) {
    problems.push(
      `${DETAIL}: optional service_item_uuid must not be normalized to "". Omit the field when blank ` +
        `(same Invalid-UUID class as CreateWorkOrderModal).`,
    );
  }
  const serviceRaw = files[SERVICE];
  if (serviceRaw == null) {
    problems.push(`${SERVICE} is missing — cannot verify Section-B primary-key returns.`);
  } else {
    const service = stripComments(serviceRaw);
    const canonicalReturns = service.match(/RETURNING\s+uuid\s+AS\s+id/gi)?.length ?? 0;
    if (canonicalReturns < 2) {
      problems.push(`${SERVICE}: parent and sub-row inserts must return the real work_order_lines.uuid primary key as id.`);
    }
    if (/INSERT INTO maintenance\.work_order_lines[\s\S]{0,500}RETURNING\s+id\b/i.test(service)) {
      problems.push(`${SERVICE}: maintenance.work_order_lines has uuid, not a phantom id column.`);
    }
  }
  return problems;
}

function readAll() {
  return {
    [MODAL]: existsSync(MODAL) ? readFileSync(MODAL, "utf8") : null,
    [DETAIL]: existsSync(DETAIL) ? readFileSync(DETAIL, "utf8") : null,
    [SERVICE]: existsSync(SERVICE) ? readFileSync(SERVICE, "utf8") : null,
  };
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const goodDetail = `...(serviceItemUuid ? { service_item_uuid: serviceItemUuid } : {}),`;
  const good = `...(line.service_item_uuid ? { service_item_uuid: line.service_item_uuid } : {}),\n{ label: "${RULE}", ok: sectionALines.length + sectionBLines.length > 0 },`;
  const bug = `{ label: "${RULE}", ok: (form.watch("line_items") ?? []).length > 0 },`;
  const emptyUuidBug = `service_item_uuid: line.service_item_uuid || "",\n${good}`;
  const emptyDetailBug = `service_item_uuid: String(line.service_item_uuid ?? line.ps_item_id ?? ""),`;
  const serviceGood = `INSERT INTO maintenance.work_order_lines (work_order_uuid) VALUES ($1) RETURNING uuid AS id;\nINSERT INTO maintenance.work_order_lines (work_order_uuid) VALUES ($1) RETURNING uuid AS id;`;
  const filesGood = { [MODAL]: good, [DETAIL]: goodDetail, [SERVICE]: serviceGood };

  t("counting the submitted arrays passes", analyse(filesGood).length === 0);
  t("the REAL pre-fix line_items rule FAILS", analyse({ ...filesGood, [MODAL]: bug }).length === 2);
  t("deleting the rule entirely FAILS", analyse({ ...filesGood, [MODAL]: "no such rule here" }).length === 1);
  t("a comment mentioning line_items does not trip it",
    analyse({ ...filesGood, [MODAL]: `// used to watch line_items\n${good}` }).length === 0);
  t("an empty optional service-item UUID FAILS", analyse({ ...filesGood, [MODAL]: emptyUuidBug }).length === 1);
  t("detail page empty optional service-item UUID FAILS", analyse({ ...filesGood, [DETAIL]: emptyDetailBug }).length === 1);
  t("phantom work-order-line id FAILS", analyse({ ...filesGood, [SERVICE]: serviceGood.replace("RETURNING uuid AS id", "RETURNING id") }).length === 2);
  t("missing modal FAILS", analyse({ ...filesGood, [MODAL]: null }).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 8 cases (detail empty-uuid ratchet included)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — the cost-line rule counts the lines actually submitted`);

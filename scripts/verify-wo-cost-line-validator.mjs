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
 *
 * ITEM RATCHET (ACCT-F4431382, 2026-10-12): the WO -> A/P bill copy posts every bill line to its work-order line's
 * ITEM account and refuses a line with no item (wo_line_item_required, #26704). Every live WO line writer must
 * therefore send the item:
 *   I1 create payload: Section A lines carry item_id (the category line's item)
 *   I2 create payload: Section B lines carry item_id = their service item (part / labor rows inherit it)
 *   I3 a named pre-save check refuses a cost line with no item
 *   I4 edit mode: every line POSTed to /line-items carries item_id
 *   I5 the /line-items route accepts item_id, writes it, and refuses an itemless line by name
 *   I6 the edit target keys persisted lines on work_order_lines.uuid (raw.id made every line "new" -> duplicates)
 *   I7 the Section A item picker offers only the items that post to the category's account (DEGH-03) and picks the
 *      single one — never a guess from the description
 */
import { readFileSync, existsSync } from "node:fs";

const LABEL = "verify:wo-cost-line-validator";
const MODAL = "apps/frontend/src/pages/maintenance/components/CreateWorkOrderModal.tsx";
const DETAIL = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const SERVICE = "apps/backend/src/maintenance/two-section-service.ts";
const ROUTES = "apps/backend/src/maintenance/work-orders.routes.ts";
const BOX = "apps/frontend/src/components/forms/shared/CostBreakdownBox.tsx";
const PICKER = "apps/frontend/src/components/forms/shared/WoLineItemSelect.tsx";
const ITEM_RULE = "Item required on every cost line";
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
  problems.push(...analyseItems(files, src));
  return problems;
}

/** ACCT-F4431382 — every live WO line writer sends the line's item (I1..I7 above). */
function analyseItems(files, modalSrc) {
  const problems = [];
  const aBuilder = modalSrc.slice(modalSrc.indexOf("const sectionALines"), modalSrc.indexOf("const sectionBLines"));
  if (!/item_id:\s*line\.item_id/.test(aBuilder)) {
    problems.push(`${MODAL}: I1 the Section A create payload does not carry item_id — the bill copy refuses an itemless line (wo_line_item_required).`);
  }
  const bStart = modalSrc.indexOf("const sectionBLines");
  const bBuilder = bStart === -1 ? "" : modalSrc.slice(bStart, bStart + 1600);
  if (!/item_id:\s*line\.service_item_uuid/.test(bBuilder)) {
    problems.push(`${MODAL}: I2 the Section B create payload does not carry item_id = the line's service item.`);
  }
  const ruleAt = modalSrc.indexOf(ITEM_RULE);
  if (ruleAt === -1 || !/ok:\s*sectionAItemsOk\s*&&\s*sectionBItemsOk/.test(modalSrc.slice(ruleAt, ruleAt + 300))) {
    problems.push(`${MODAL}: I3 no "${ITEM_RULE}" pre-save check gating BOTH sections — an itemless WO line would save and never bill.`);
  }
  const addAt = modalSrc.indexOf("await addWorkOrderLineItem(");
  if (addAt === -1 || !/item_id:/.test(modalSrc.slice(addAt, addAt + 500))) {
    problems.push(`${MODAL}: I4 the edit-mode line POST (addWorkOrderLineItem) does not send item_id.`);
  }
  const routesRaw = files[ROUTES];
  if (routesRaw == null) {
    problems.push(`${ROUTES} is missing — cannot verify the line-items route writes the item.`);
  } else {
    const routes = stripComments(routesRaw);
    const schemaAt = routes.indexOf("const lineItemCreateSchema");
    const routeAt = routes.indexOf('"/api/v1/maintenance/work-orders/:id/line-items"');
    const routeBody = routeAt === -1 ? "" : routes.slice(routeAt, routeAt + 4000);
    if (schemaAt === -1 || !/item_id:/.test(routes.slice(schemaAt, schemaAt + 400))) {
      problems.push(`${ROUTES}: I5 lineItemCreateSchema does not accept item_id.`);
    }
    if (!/INSERT INTO maintenance\.work_order_lines \([^)]*\bitem_id\b/.test(routeBody) || !/wo_line_item_required/.test(routeBody)) {
      problems.push(`${ROUTES}: I5 the /line-items route must write item_id and refuse an itemless line by name (wo_line_item_required).`);
    }
  }
  const detailRaw = files[DETAIL];
  if (detailRaw != null && /id:\s*raw\.id\s*!=\s*null\s*\?\s*String\(raw\.id\)/.test(stripComments(detailRaw))) {
    problems.push(`${DETAIL}: I6 the edit target keys lines on raw.id — work_order_lines has no id column (uuid), so every persisted line looks new and is re-posted.`);
  }
  const boxRaw = files[BOX];
  const pickerRaw = files[PICKER];
  if (boxRaw == null || !/<WoCategoryLineItemSelect\b/.test(stripComments(boxRaw))) {
    problems.push(`${BOX}: I7 the WO Section A row has no item picker (WoCategoryLineItemSelect).`);
  }
  if (pickerRaw == null) {
    problems.push(`${PICKER} is missing — I7 cannot verify the category-line item mapping.`);
  } else {
    const picker = stripComments(pickerRaw);
    if (!/expenseAccountId:\s*accountId/.test(picker) || !/options\.length\s*===\s*1/.test(picker)) {
      problems.push(`${PICKER}: I7 the category-line item must come from the items that post to the category's account, the single one picked (DEGH-03).`);
    }
    if (/\.description\b/.test(picker)) {
      problems.push(`${PICKER}: I7 the item picker reads a line description — the item is never guessed from description keywords.`);
    }
  }
  return problems;
}

function readAll() {
  return {
    [MODAL]: existsSync(MODAL) ? readFileSync(MODAL, "utf8") : null,
    [DETAIL]: existsSync(DETAIL) ? readFileSync(DETAIL, "utf8") : null,
    [SERVICE]: existsSync(SERVICE) ? readFileSync(SERVICE, "utf8") : null,
    [ROUTES]: existsSync(ROUTES) ? readFileSync(ROUTES, "utf8") : null,
    [BOX]: existsSync(BOX) ? readFileSync(BOX, "utf8") : null,
    [PICKER]: existsSync(PICKER) ? readFileSync(PICKER, "utf8") : null,
  };
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const goodDetail = `...(serviceItemUuid ? { service_item_uuid: serviceItemUuid } : {}),`;
  const itemGood =
    `const sectionALines = lines.map((line) => ({ ...(line.item_id ? { item_id: line.item_id } : {}) }));\n` +
    `const sectionBLines = lines.map((line) => ({ ...(line.service_item_uuid ? { service_item_uuid: line.service_item_uuid, item_id: line.service_item_uuid } : {}) }));\n` +
    `{ label: "${ITEM_RULE} (the bill posts to the item's account)", ok: sectionAItemsOk && sectionBItemsOk },\n` +
    `await addWorkOrderLineItem(woId, operatingCompanyId, { amount: 1, item_id: String(line.item_id) });\n`;
  const good = `...(line.service_item_uuid ? { service_item_uuid: line.service_item_uuid } : {}),\n{ label: "${RULE}", ok: sectionALines.length + sectionBLines.length > 0 },\n${itemGood}`;
  const routesGood =
    `const lineItemCreateSchema = z.object({ amount: z.number(), item_id: z.string().uuid().optional().nullable() });\n` +
    `app.post("/api/v1/maintenance/work-orders/:id/line-items", async () => { if (!item) throw new WorkOrderLineItemError("wo_line_item_required", "x");\n` +
    "INSERT INTO maintenance.work_order_lines (work_order_uuid, line_type, description, quantity, unit_cost, total_cost, item_id) VALUES ($1) });";
  const boxGood = `<WoCategoryLineItemSelect lineId={line.id} />`;
  const pickerGood = `const q = useAccountingItemsQuery({ kind: "all", expenseAccountId: accountId });\nconst sole = options.length === 1 ? options[0].value : null;`;
  const bug = `{ label: "${RULE}", ok: (form.watch("line_items") ?? []).length > 0 },`;
  const emptyUuidBug = `service_item_uuid: line.service_item_uuid || "",\n${good}`;
  const emptyDetailBug = `service_item_uuid: String(line.service_item_uuid ?? line.ps_item_id ?? ""),`;
  const serviceGood = `INSERT INTO maintenance.work_order_lines (work_order_uuid) VALUES ($1) RETURNING uuid AS id;\nINSERT INTO maintenance.work_order_lines (work_order_uuid) VALUES ($1) RETURNING uuid AS id;`;
  const filesGood = { [MODAL]: good, [DETAIL]: goodDetail, [SERVICE]: serviceGood, [ROUTES]: routesGood, [BOX]: boxGood, [PICKER]: pickerGood };

  t("counting the submitted arrays passes", analyse(filesGood).length === 0);
  // the pre-fix rule plants carry no item payload either -> + I1..I4 (4)
  t("the REAL pre-fix line_items rule FAILS", analyse({ ...filesGood, [MODAL]: bug }).length === 6);
  t("deleting the rule entirely FAILS", analyse({ ...filesGood, [MODAL]: "no such rule here" }).length === 1);
  // ACCT-F4431382 item ratchet — each plant is the REAL origin/main shape.
  t("I1 Section A payload without item_id FAILS",
    analyse({ ...filesGood, [MODAL]: good.replace("...(line.item_id ? { item_id: line.item_id } : {})", "") }).length === 1);
  t("I2 Section B payload without item_id FAILS",
    analyse({ ...filesGood, [MODAL]: good.replace(", item_id: line.service_item_uuid }", " }") }).length === 1);
  t("I3 no item pre-save check FAILS", analyse({ ...filesGood, [MODAL]: good.replace(ITEM_RULE, "Something else") }).length === 1);
  t("I3 a check that gates only Section A FAILS",
    analyse({ ...filesGood, [MODAL]: good.replace("ok: sectionAItemsOk && sectionBItemsOk", "ok: sectionAItemsOk") }).length === 1);
  t("I4 edit-mode line POST without item_id FAILS",
    analyse({ ...filesGood, [MODAL]: good.replace(", item_id: String(line.item_id)", "") }).length === 1);
  t("I5 the old line-items route (no item_id anywhere) FAILS",
    analyse({ ...filesGood, [ROUTES]: routesGood.replace(/, item_id[^,)]*(?=\))/g, "").replace(", item_id: z.string().uuid().optional().nullable()", "").replace('if (!item) throw new WorkOrderLineItemError("wo_line_item_required", "x");', "") }).length === 2);
  t("I5 a route that writes the item but never refuses an itemless line FAILS",
    analyse({ ...filesGood, [ROUTES]: routesGood.replace("wo_line_item_required", "other") }).length === 1);
  t("I6 the old edit target keyed on raw.id FAILS",
    analyse({ ...filesGood, [DETAIL]: `${goodDetail}\nid: raw.id != null ? String(raw.id) : undefined,` }).length === 1);
  t("I7 no Section A item picker FAILS", analyse({ ...filesGood, [BOX]: "<ReferenceSelect />" }).length === 1);
  t("I7 a picker that guesses from the description FAILS",
    analyse({ ...filesGood, [PICKER]: `${pickerGood}\nconst guess = line.description.includes("tire");` }).length === 1);
  t("I7 a picker not filtered by the category account FAILS",
    analyse({ ...filesGood, [PICKER]: pickerGood.replace("expenseAccountId: accountId", "search") }).length === 1);
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
  console.log(`${LABEL} selftest OK — 19 cases (detail empty-uuid ratchet + ACCT-F4431382 item ratchet I1..I7 included)`);
  process.exit(0);
}
const problems = analyse(readAll());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — the cost-line rule counts the lines actually submitted; every WO line writer sends its item (I1..I7)`);

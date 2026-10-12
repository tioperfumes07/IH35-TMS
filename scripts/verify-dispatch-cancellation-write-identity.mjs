#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";

const servicePath = "apps/backend/src/dispatch/cancellation.service.ts";
const routesPath = "apps/backend/src/dispatch/cancellation.routes.ts";
const loadsPath = "apps/backend/src/mdata/loads.routes.ts";
const migrationsDir = "db/migrations";

function verify(sources) {
  const failures = [];
  const service = sources.service;
  const routes = sources.routes;
  const loads = sources.loads;
  const cancelStart = service.indexOf("export async function cancelLoad(");
  const cancelEnd = service.indexOf("export async function listCancellationReasons(", cancelStart);
  // 443.113 AJK-10: the Owner's approval is approveCancellationInClientTx (client-accepting core) wrapped by
  // approveCancellation (scoped transaction); the cancel FINALIZATION (load status + revrec + document cascade + TONU)
  // is ONE function, finalizeLoadCancellationInClientTx, called by both the immediate cancel and the approval.
  const coreStart = service.indexOf("export async function approveCancellationInClientTx(");
  const approveStart = service.indexOf("export async function approveCancellation(");
  const approveEnd = service.indexOf("export async function getCancellationPreview(", approveStart);
  const finalizeStart = service.indexOf("export async function finalizeLoadCancellationInClientTx(");
  const finalizeEnd = service.indexOf("/** Client-accepting cancel", finalizeStart);
  const inClientStart = service.indexOf("export async function cancelLoadInClientTx(");
  const inClientEnd = service.indexOf("export async function cancelLoad(", inClientStart);
  const cancelBlock = cancelStart >= 0 && cancelEnd > cancelStart ? service.slice(cancelStart, cancelEnd) : "";
  const coreBlock = coreStart >= 0 && approveStart > coreStart ? service.slice(coreStart, approveStart) : "";
  const approveBlock = approveStart >= 0 && approveEnd > approveStart ? service.slice(approveStart, approveEnd) : "";
  const finalizeBlock = finalizeStart >= 0 && finalizeEnd > finalizeStart ? service.slice(finalizeStart, finalizeEnd) : "";
  const inClientBlock = inClientStart >= 0 && inClientEnd > inClientStart ? service.slice(inClientStart, inClientEnd) : "";

  if (!/const cancellation = result\.rows\[0\];\s*if \(!cancellation\?\.id\) throw new Error\("E_CANCELLATION_RECORD_WRITE_FAILED"\);\s*return cancellation;/.test(service)) {
    failures.push("canonical cancellation writer must require and return its persisted identity");
  }
  if (/row\.rows\[0\]\?\.id/.test(service)) {
    failures.push("cancelLoad must not consume an unchecked QueryResult identity");
  }
  if (!/UPDATE mdata\.loads[\s\S]{0,300}?operating_company_id = \$2::uuid[\s\S]{0,100}?RETURNING id/.test(service)) {
    failures.push("approved cancellation load transition must be company-scoped and return identity");
  }
  // RE-PIN 2026-09-06: cancelLoad delegates to cancelLoadInClientTx — the write-identity check
  // lives in the helper, not in the cancelLoad block itself. Check the full service source.
  if (!/if \(!cancelledLoad\.rows\[0\]\?\.id\) throw new Error\("E_CANCELLATION_LOAD_WRITE_FAILED"\);/.test(service)) {
    failures.push("cancelLoad must reject a lost load transition");
  }
  if (!/UPDATE dispatch\.load_cancellations[\s\S]{0,260}?operating_company_id = \$3::uuid[\s\S]{0,100}?status = 'requested'[\s\S]{0,100}?RETURNING id, load_id, status/.test(coreBlock)) {
    failures.push("approveCancellation must CAS the exact requested company cancellation");
  }
  // The approval locks the ACTIVE load (company-scoped, not soft-deleted) and refuses an already-cancelled one before
  // finalizing; the finalization's load write is company-scoped and compare-and-set on that locked status.
  if (!/SELECT status::text FROM mdata\.loads[\s\S]{0,160}?operating_company_id = \$2::uuid AND soft_deleted_at IS NULL[\s\S]{0,40}?FOR UPDATE/.test(coreBlock) ||
      !/status === "cancelled"\) throw new Error\("E_CANCELLATION_LOAD_WRITE_FAILED"\)/.test(coreBlock)) {
    failures.push("approveCancellation must company-scope and CAS the active canonical load transition");
  }
  if (!/const cancelledLoad = await client\.query<\{ id: string \}>\([\s\S]{0,350}?UPDATE mdata\.loads[\s\S]{0,260}?operating_company_id = \$2::uuid[\s\S]{0,60}?status::text = \$3[\s\S]{0,100}?RETURNING id/.test(finalizeBlock) ||
      !/if \(!cancelledLoad\.rows\[0\]\?\.id\) throw new Error\("E_CANCELLATION_LOAD_WRITE_FAILED"\);/.test(finalizeBlock)) {
    failures.push("approveCancellation must reject a lost canonical load transition");
  }
  // 443.113 AJK-10 — ONE finalization, no second copy.
  if (!/await finalizeLoadCancellationInClientTx\(client, userId, \{/.test(inClientBlock)) {
    failures.push("AJK-10: the immediate cancel must finalize through finalizeLoadCancellationInClientTx");
  }
  if (!/await finalizeLoadCancellationInClientTx\(client, userId, \{/.test(coreBlock)) {
    failures.push("AJK-10: the Owner's approval must finalize through finalizeLoadCancellationInClientTx (the same cascade)");
  }
  if (/UPDATE mdata\.loads|settleRevrecOnCancel\(/.test(coreBlock)) {
    failures.push("AJK-10: the approval must not carry its own load/revrec write (a second, partial cancellation path)");
  }
  // 443.113 AJK-11 — the earned charge survives: excluded from the void set by its canonical backlink, raised after it.
  if (!/WHERE source_load_id = \$1::uuid AND operating_company_id = \$2::uuid AND status <> 'void'[\s\S]{0,400}?NOT EXISTS \([\s\S]{0,120}?dispatch\.load_cancellations lc[\s\S]{0,80}?lc\.charge_invoice_id = accounting\.invoices\.id/.test(finalizeBlock)) {
    failures.push("AJK-11: the load-invoice void set must exclude the cancellation's own charge invoice (charge_invoice_id)");
  }
  const voidLoopAt = finalizeBlock.indexOf("for (const inv of liveInvoicesForGate.rows)");
  const tonuAt = finalizeBlock.indexOf("createTonuInvoiceForCancellation(client");
  if (voidLoopAt < 0 || tonuAt < 0 || tonuAt < voidLoopAt) {
    failures.push("AJK-11: the TONU charge must be raised AFTER the load's original invoices are voided (one live invoice per load)");
  }
  const tonuTypeOk = (sources.invoiceTypeChecks ?? []).at(-1);
  if (!tonuTypeOk || !/'cancellation_tonu'/.test(tonuTypeOk)) {
    failures.push("AJK-10/11: the latest invoices_invoice_type_check migration must accept 'cancellation_tonu' (the TONU writer's own type)");
  }
  if (!/cancellation_id: cancellation\.id/.test(service)) {
    failures.push("cancel response must use the checked canonical cancellation identity");
  }
  if (!/E_CANCELLATION_RECORD_WRITE_FAILED[\s\S]{0,120}?E_CANCELLATION_LOAD_WRITE_FAILED[\s\S]{0,160}?status: 409/.test(routes)) {
    failures.push("mounted cancellation route must expose both lost-write conflicts as HTTP 409");
  }
  if (!/const cancellationRecord = await writeLoadCancellationRecord[\s\S]{0,1000}?cancellationRecordId = cancellationRecord\.id;/.test(loads)) {
    failures.push("Kanban cancellation must consume the checked canonical writer identity");
  }
  for (const [name, block] of [["cancelLoad", cancelBlock], ["approveCancellation", approveBlock]]) {
    if (!block) failures.push(`${name} block is missing`);
    if (!/withCurrentUser\(userId, async \(client\) =>/.test(block)) failures.push(`${name} must use the scoped transaction wrapper`);
  }
  for (const [name, block] of [["cancelLoad", cancelBlock], ["approveCancellation", approveBlock], ["approveCancellationInClientTx", coreBlock], ["finalizeLoadCancellationInClientTx", finalizeBlock]]) {
    if (!block) failures.push(`${name} block is missing`);
    if (/client\.query\(["'`](?:BEGIN|COMMIT|ROLLBACK)["'`]\)/.test(block)) failures.push(`${name} must not own nested transaction control`);
  }
  return failures;
}

const fixed = {
  service: readFileSync(servicePath, "utf8"),
  routes: readFileSync(routesPath, "utf8"),
  loads: readFileSync(loadsPath, "utf8"),
  // every migration statement that (re)defines invoices_invoice_type_check, in apply order — the last one wins
  invoiceTypeChecks: readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .flatMap((f) => {
      const sql = readFileSync(`${migrationsDir}/${f}`, "utf8");
      return /ADD CONSTRAINT invoices_invoice_type_check/.test(sql) ? [sql] : [];
    }),
};

if (process.argv.includes("--selftest")) {
  const mutations = [
    { key: "record", source: "service", from: 'if (!cancellation?.id) throw new Error("E_CANCELLATION_RECORD_WRITE_FAILED");', to: "if (false) throw new Error();" },
    {
      key: "scope",
      source: "service",
      from: "WHERE id = $1\n          AND operating_company_id = $2::uuid\n          AND status::text = $3",
      to: "WHERE id = $1\n          AND true\n          AND status::text = $3",
    },
    { key: "load", source: "service", from: 'if (!cancelledLoad.rows[0]?.id) throw new Error("E_CANCELLATION_LOAD_WRITE_FAILED");', to: "if (false) throw new Error();", replaceAll: true },
    { key: "route", source: "routes", from: "return { status: 409, payload: errorPayload(code) };", to: "return { status: 500, payload: errorPayload(code) };" },
    { key: "kanban", source: "loads", from: "cancellationRecordId = cancellationRecord.id;", to: "cancellationRecordId = null;" },
    { key: "cancel-nested-begin", source: "service", from: "await setScopedCompanyContext(client, userId, input.operating_company_id);", to: 'await setScopedCompanyContext(client, userId, input.operating_company_id);\n    await client.query("BEGIN");' },
    { key: "approve-nested-commit", source: "service", from: "export async function approveCancellationInClientTx(\n  client: CancelLoadClient,\n  userId: string,\n  role: string,\n  input: { operating_company_id: string; cancellation_id: string }\n) {\n", to: "export async function approveCancellationInClientTx(\n  client: CancelLoadClient,\n  userId: string,\n  role: string,\n  input: { operating_company_id: string; cancellation_id: string }\n) {\n  await client.query(\"COMMIT\");\n" },
    { key: "approve-requested-cas", source: "service", from: "    AND status = 'requested'\n      RETURNING id, load_id, status", to: "      RETURNING id, load_id, status" },
    { key: "approve-load-check", source: "service", from: 'if (!loadRow.rows[0] || loadRow.rows[0].status === "cancelled") throw new Error("E_CANCELLATION_LOAD_WRITE_FAILED");', to: "if (false) throw new Error();" },
    { key: "ajk10-approval-skips-finalize", source: "service", from: "  await finalizeLoadCancellationInClientTx(client, userId, {\n    operating_company_id: input.operating_company_id,\n    load_id: String(cancellation.load_id),", to: "  await noFinalize(client, userId, {\n    operating_company_id: input.operating_company_id,\n    load_id: String(cancellation.load_id)," },
    { key: "ajk10-approval-own-revrec", source: "service", from: 'revrec_memo: "Load cancellation approved",\n  });', to: 'revrec_memo: "Load cancellation approved",\n  });\n  await settleRevrecOnCancel(client as never, input.operating_company_id, String(cancellation.load_id), userId, "x");' },
    { key: "ajk11-void-set-includes-tonu", source: "service", from: "lc.charge_invoice_id = accounting.invoices.id", to: "lc.charge_invoice_id = NULL" },
    { key: "ajk11-tonu-before-void", source: "service", from: "for (const inv of liveInvoicesForGate.rows)", to: "/* moved */ for (const inv of [] as never[])" },
    { key: "ajk11-check-lacks-tonu", source: "invoiceTypeChecks", replaceWith: (arr) => [...arr, "ALTER TABLE accounting.invoices ADD CONSTRAINT invoices_invoice_type_check CHECK (invoice_type = ANY (ARRAY['from_load'::text]));"] },
  ];
  for (const mutation of mutations) {
    const changed = {
      ...fixed,
      [mutation.source]: mutation.replaceWith
        ? mutation.replaceWith(fixed[mutation.source])
        : mutation.replaceAll
          ? fixed[mutation.source].replaceAll(mutation.from, mutation.to)
          : fixed[mutation.source].replace(mutation.from, mutation.to),
    };
    if (changed[mutation.source] === fixed[mutation.source]) throw new Error(`selftest mutation did not apply: ${mutation.key}`);
    if (verify(changed).length === 0) throw new Error(`selftest mutation escaped: ${mutation.key}`);
  }
  console.log(`[verify-dispatch-cancellation-write-identity] SELFTEST PASS (${mutations.length}/${mutations.length})`);
}

const failures = verify(fixed);
if (failures.length) {
  console.error("[verify-dispatch-cancellation-write-identity] FAIL");
  failures.forEach((failure) => console.error(`  - ${failure}`));
  process.exit(1);
}
console.log("[verify-dispatch-cancellation-write-identity] PASS");

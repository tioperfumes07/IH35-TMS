#!/usr/bin/env node
/**
 * verify-driver-bill-linked-to-settlement-at-creation.mjs
 *
 * SET-02 (owner ruling 2026-09-03/09-04): "driver bill at load creation, priced off miles,
 * carrying load_number, linked to the settlement." The bill was already minted at booking
 * (createDriverBillArtifacts, save_mode='book_dispatch') and already priced off miles and carries
 * load_number -- but it was never LINKED to the settlement at creation: appendSettlementLineFromDriverBillIfMissing
 * was only ever called lazily, later, from the pre-settlement view route, the bookended-settlement
 * service, or payrun close. A bill could exist for a real payable and never show on the
 * pre-settlement screen until one of those three surfaces happened to be hit.
 */
import { readFileSync } from "node:fs";

const BOOK_LOAD_PATH = "apps/backend/src/dispatch/book-load.service.ts";

function loadSource() {
  return readFileSync(BOOK_LOAD_PATH, "utf8");
}

export function collectFailures(src = loadSource()) {
  const failures = [];

  if (!/import\s*\{\s*\n\s*appendSettlementLineFromDriverBillIfMissing,/.test(src)) {
    failures.push("book-load.service.ts does not import appendSettlementLineFromDriverBillIfMissing");
  }
  if (!/let settlementIdForBillLink: string \| null = null;/.test(src)) {
    failures.push("settlementIdForBillLink is not declared -- the SET-01 settlement_id cannot reach the bill-link call site");
  }
  if (!/settlementIdForBillLink = presettlementLink\.settlement_id;/.test(src)) {
    failures.push("linkLoadToPresettlementAtBookingInClientTx's settlement_id is not captured into settlementIdForBillLink");
  }
  const mintIdx = src.indexOf("driverBillMint = await createDriverBillArtifacts(client, input, load, loadNumber, input.stops);");
  const linkIdx = src.indexOf("await appendSettlementLineFromDriverBillIfMissing(client, {");
  if (mintIdx === -1) failures.push("createDriverBillArtifacts call site not found in the expected shape");
  if (linkIdx === -1) failures.push("appendSettlementLineFromDriverBillIfMissing is never called from book-load.service.ts");
  if (mintIdx !== -1 && linkIdx !== -1 && linkIdx < mintIdx) {
    failures.push("appendSettlementLineFromDriverBillIfMissing is called before the bill is minted");
  }
  if (!/if \(driverBillMint\.outcome === "minted" && settlementIdForBillLink && input\.assigned_primary_driver_id\) \{/.test(src)) {
    failures.push("the settlement-line append is not gated on a real minted bill + a resolved settlement_id");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectFailures();
  if (baseline.length) {
    console.error(`verify-driver-bill-linked-to-settlement-at-creation SELFTEST FAIL — good sources rejected: ${baseline.join(" | ")}`);
    process.exit(1);
  }
  const src = loadSource();

  // Proven failing on the ACTUAL pre-fix shape: the bill minted, but nothing ever called
  // appendSettlementLineFromDriverBillIfMissing from inside bookLoad() at all.
  const preFixBlock = [
    "      if (driverBillMint.outcome === \"minted\" && settlementIdForBillLink && input.assigned_primary_driver_id) {",
    "        await appendSettlementLineFromDriverBillIfMissing(client, {",
    "          settlementId: settlementIdForBillLink,",
    "          operatingCompanyId: input.operating_company_id,",
    "          driverId: input.assigned_primary_driver_id,",
    "          loadId: String(load.id),",
    "          actorUserId: input.requestingUserUuid,",
    "        });",
    "      }",
    "",
  ].join("\n");
  if (!src.includes(preFixBlock)) {
    console.error("verify-driver-bill-linked-to-settlement-at-creation SELFTEST FAIL — pre-fix plant target not found (source drifted)");
    process.exit(1);
  }
  const preFixSrc = src.replace(preFixBlock, "");
  if (collectFailures(preFixSrc).length === 0) {
    console.error("verify-driver-bill-linked-to-settlement-at-creation SELFTEST FAIL — pre-fix unlinked-bill shape was NOT caught");
    process.exit(1);
  }

  const mutations = [
    ["import removed", "import {\n  appendSettlementLineFromDriverBillIfMissing,\n  effectiveTeamPercentsFromRow,", "import {\n  effectiveTeamPercentsFromRow,"],
    [
      "settlement_id capture removed",
      "settlementIdForBillLink = presettlementLink.settlement_id;",
      "// capture removed",
    ],
    [
      "gate weakened to always run",
      'if (driverBillMint.outcome === "minted" && settlementIdForBillLink && input.assigned_primary_driver_id) {',
      "if (true) {",
    ],
  ];
  const escaped = [];
  for (const [name, from, to] of mutations) {
    if (!src.includes(from)) {
      escaped.push(`${name} (plant target not found -- source drifted)`);
      continue;
    }
    const planted = src.replace(from, to);
    if (planted === src || collectFailures(planted).length === 0) escaped.push(name);
  }
  if (escaped.length) {
    console.error(`verify-driver-bill-linked-to-settlement-at-creation SELFTEST FAIL — escaped: ${escaped.join(", ")}`);
    process.exit(1);
  }
  console.log(`verify-driver-bill-linked-to-settlement-at-creation SELFTEST PASS — pre-fix shape caught + ${mutations.length}/${mutations.length} plants rejected`);
}

const failures = collectFailures();
if (failures.length > 0) {
  console.error("verify-driver-bill-linked-to-settlement-at-creation: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-driver-bill-linked-to-settlement-at-creation: OK — a driver bill minted at booking is linked into its settlement's settlement_lines in the SAME transaction, not lazily later");

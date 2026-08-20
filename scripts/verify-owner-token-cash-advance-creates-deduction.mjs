#!/usr/bin/env node
/**
 * ACCT-F5632 — ownerTokenApproveCashAdvanceRequest (cash-advance-owner-approval.service.ts) is the
 * ONLY approval path for an above-policy cash advance request (the normal in-app checker path,
 * approveCashAdvanceRequest, explicitly refuses these: "above_policy_requires_owner"). It structurally
 * mirrors its sibling approveCashAdvanceRequest in every other respect — same core disbursement call,
 * same load_id forwarding, same request-status update, same audit/outbox/PWA-notify calls — but
 * previously dropped one step: it never called createSettlementDeduction, so the request most likely
 * to need automatic recovery (large enough to require Owner sign-off) got none. Cash was disbursed and
 * a receivable booked, but nothing ever created the driver_settlement_deductions row the settlement
 * engine reads to withhold it from the driver's next settlement.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts`, "utf8");

  if (!src.includes('import { createSettlementDeduction, type Queryable as DeductionsQueryable } from "./deductions.service.js"')) {
    failures.push("cash-advance-owner-approval.service.ts must import createSettlementDeduction from ./deductions.service.js");
  }

  const fnMatch = src.match(/export async function ownerTokenApproveCashAdvanceRequest\s*\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("ownerTokenApproveCashAdvanceRequest function not found");
    return failures;
  }
  const fnBody = fnMatch[0];

  if (!/createSettlementDeduction\(/.test(fnBody)) {
    failures.push("ownerTokenApproveCashAdvanceRequest must call createSettlementDeduction — the above-policy approval path must recover the advance the same way the normal approval path does");
  }
  if (!/sourceType:\s*"cash_advance_repayment"/.test(fnBody)) {
    failures.push('createSettlementDeduction call must use sourceType: "cash_advance_repayment", matching the sibling approveCashAdvanceRequest exactly');
  }

  // The deduction call must run BEFORE the COMMIT, or the disbursement could commit without its
  // recovery row ever being created (partial-write risk).
  const createIdx = fnBody.search(/createSettlementDeduction\(/);
  const commitIdx = fnBody.search(/await client\.query\("COMMIT"\)/);
  if (createIdx === -1 || commitIdx === -1 || createIdx > commitIdx) {
    failures.push("createSettlementDeduction must run before the transaction COMMIT, in the same atomic unit as the disbursement");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-owner-token-cash-advance-deduction-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
import { createSettlementDeduction, type Queryable as DeductionsQueryable } from "./deductions.service.js";

export async function ownerTokenApproveCashAdvanceRequest(rawToken, body, audit) {
  const client = await luciaPool.connect();
  try {
    await client.query("BEGIN");
    const core = await createDriverCashAdvanceCore(client, ownerUuid, operatingCompanyId, {});
    await createSettlementDeduction(client, {
      operatingCompanyId,
      driverId,
      amountCents: Number(row.requested_amount_cents),
      sourceType: "cash_advance_repayment",
      reason: "x",
      loadId: null,
      createdByUserId: ownerUuid,
    });
    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    throw e;
  }
}
`;
  mk("apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the call removed entirely (the original bug).
  mk(
    "apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts",
    good.replace(/await createSettlementDeduction\([\s\S]*?\}\);\n/, "")
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: missing createSettlementDeduction call should be caught");
  mk("apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts", good); // restore

  // Regression 2: the call exists but runs AFTER the COMMIT (partial-write risk).
  mk(
    "apps/backend/src/driver-finance/cash-advance-owner-approval.service.ts",
    good
      .replace(/await createSettlementDeduction\([\s\S]*?\}\);\n    /, "")
      .replace(
        'await client.query("COMMIT");',
        `await client.query("COMMIT");\n    await createSettlementDeduction(client, { sourceType: "cash_advance_repayment" });`
      )
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: createSettlementDeduction placed after COMMIT should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-owner-token-cash-advance-creates-deduction --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-owner-token-cash-advance-creates-deduction — OK");
}

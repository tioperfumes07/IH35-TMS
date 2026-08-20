#!/usr/bin/env node
/**
 * ACCT-F5634 — accounting.bills has three independent void writers: voidBillInClientTx
 * (bills.service.ts) and governance/void-cancel-executors.ts's executeBill both reverse the posted
 * GL entry before flipping status; bills-bulk.routes.ts's set_status(voided) action was a bare
 * status-flip UPDATE with no GL reversal at all — the third writer never got the fix its two siblings
 * already have. A bill voided through the bulk endpoint left its posted DR-expense/CR-AP journal
 * entry standing forever with no reversing entry and no later repair path. Confirmed live on prod: 18
 * status='void', paid_cents=0 bills join to posted, unreversed journal_entry_postings rows.
 *
 * This guard proves the bulk void branch calls the existing voidBillInClientTx (reuse, not new GL
 * math) rather than a bare UPDATE, while non-void status transitions remain untouched.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/accounting/bills-bulk.routes.ts`, "utf8");

  if (!src.includes("voidBillInClientTx")) {
    failures.push("bills-bulk.routes.ts must import and call voidBillInClientTx for the set_status(voided) branch");
    return failures;
  }

  const voidBranchMatch = src.match(/if \(statusPayload\.status === "voided"\) \{[\s\S]*?\n    \} else \{[\s\S]*?\n    \}/);
  if (!voidBranchMatch) {
    failures.push('could not locate the gated "if (statusPayload.status === \\"voided\\")" void branch to check');
    return failures;
  }
  const voidBranch = voidBranchMatch[0];

  if (!/await\s+voidBillInClientTx\(/.test(voidBranch)) {
    failures.push("the voided branch must call voidBillInClientTx — a bare UPDATE with no GL reversal is the exact bug this guard exists to catch");
  }
  if (!/currentBusinessDate:/.test(voidBranch)) {
    failures.push("voidBillInClientTx must be called with currentBusinessDate, matching its required signature");
  }

  // The else-branch (non-void transitions: open/paid/partial) must NOT be routed through
  // voidBillInClientTx — only the voided branch should reverse GL.
  const elseBranchMatch = src.match(/\} else \{\s*const storageStatus[\s\S]*?\n    \}\n  \} else if \(action === "mark_scheduled"\)/);
  if (elseBranchMatch && /voidBillInClientTx/.test(elseBranchMatch[0])) {
    failures.push("non-void set_status transitions must not call voidBillInClientTx");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-bills-bulk-void-gl-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
    if (statusPayload.status === "voided") {
      try {
        const voided = await voidBillInClientTx(client, {
          operatingCompanyId,
          billId: id,
          reason: reason ?? "Bulk void",
          userId: actorUserId,
          currentBusinessDate: companyBusinessDate(),
        });
      } catch (err) {
        throw err;
      }
    } else {
      const storageStatus = statusPayload.status === "open" ? "open" : statusPayload.status;
      const updateRes = await client.query(\`UPDATE accounting.bills SET status = $3 WHERE id = $1\`, []);
    }
  } else if (action === "mark_scheduled")
`;
  mk("apps/backend/src/accounting/bills-bulk.routes.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression: back to the original bug — a bare UPDATE, no voidBillInClientTx call.
  mk(
    "apps/backend/src/accounting/bills-bulk.routes.ts",
    good.replace(
      /if \(statusPayload\.status === "voided"\) \{[\s\S]*?\n    \} else \{/,
      `if (statusPayload.status === "voided") {
      const updateRes = await client.query(\`UPDATE accounting.bills SET status = 'void' WHERE id = $1\`, []);
    } else {`
    )
  );
  const f = run(tmp);
  if (!f.length) throw new Error("FAIL fail: bare status-flip UPDATE (no voidBillInClientTx) should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bills-bulk-void-reverses-gl --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-bills-bulk-void-reverses-gl — OK");
}

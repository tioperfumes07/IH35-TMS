#!/usr/bin/env node
/** Banking Full Audit FAIL 24 — Match candidates must EntityLink payment/bill_payment/transfer/bill/je/expense. */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const view = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx`,
    "utf8"
  );
  const drawer = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/MatchDrawer.tsx`,
    "utf8"
  );
  const entity = fs.readFileSync(`${root}/apps/frontend/src/components/shared/EntityLink.tsx`, "utf8");
  const transfers = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/TransfersListPage.tsx`,
    "utf8"
  );

  // LEAD 443.163 (register M3): match candidates live on the ONE matcher (MatchDrawer, embedded in Categorize / Match); the
  // view's inline candidate table and its MATCH_CANDIDATE_ENTITY_KIND map are gone. Same requirement, on the one matcher:
  // its KIND_ENTITY map links payment / bill_payment / transfer candidates to their EntityKind.
  const kindMap = (drawer.match(/const KIND_ENTITY: Record<BankMatchCandidateKind, EntityKind> = \{[\s\S]*?\n\};/) ?? [""])[0];
  for (const kind of ["payment", "bill_payment", "transfer"]) {
    if (!new RegExp(`\\b${kind}: "`).test(kindMap)) failures.push(`MatchDrawer KIND_ENTITY missing ${kind}`);
  }
  if (!kindMap.includes('transfer: "transfer"')) failures.push("MatchDrawer must map transfer → EntityKind transfer");
  if (/getMatchCandidates\(/.test(view)) failures.push("BankingTransactionsDesignView queries match candidates itself — a second matcher (register M3)");
  if (!drawer.includes("KIND_ENTITY") || !drawer.includes("EntityLink")) {
    failures.push("MatchDrawer must EntityLink candidate kinds");
  }
  if (!entity.includes('| "transfer"') && !entity.includes('"transfer"')) {
    failures.push("EntityKind must include transfer");
  }
  if (!entity.includes("/banking/transfers?transfer_id=")) {
    failures.push("resolveEntityRoute(transfer) must use /banking/transfers?transfer_id=");
  }
  if (!transfers.includes('get("transfer_id")') && !transfers.includes("transfer_id")) {
    failures.push("TransfersListPage must honor transfer_id deep link");
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-match-el-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", `<MatchDrawer embedded />\n`);
  const goodDrawer = `const KIND_ENTITY: Record<BankMatchCandidateKind, EntityKind> = {\n  payment: "payment",\n  bill_payment: "bill_payment",\n  transfer: "transfer",\n};\nEntityLink\n`;
  mk("apps/frontend/src/pages/banking/components/MatchDrawer.tsx", goodDrawer);
  mk(
    "apps/frontend/src/components/shared/EntityLink.tsx",
    `| "transfer"\n/banking/transfers?transfer_id=\n`
  );
  mk("apps/frontend/src/pages/banking/TransfersListPage.tsx", `transfer_id\n`);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/banking/components/MatchDrawer.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
  mk("apps/frontend/src/pages/banking/components/MatchDrawer.tsx", goodDrawer.replace('  transfer: "transfer",\n', ""));
  if (!run(tmp).length) throw new Error("transfer unmapped not caught");
  mk("apps/frontend/src/pages/banking/components/MatchDrawer.tsx", goodDrawer);
  mk("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", "getMatchCandidates(a, b)\n");
  if (!run(tmp).length) throw new Error("second matcher not caught");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-match-entitylink-kinds --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-match-entitylink-kinds — OK");
}

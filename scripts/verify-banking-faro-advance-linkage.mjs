#!/usr/bin/env node
/**
 * Banking Full Audit FAIL 32, NARROWED 2026-09-13 (ROUND-20.8 B3) — the Banking-side "Factoring
 * tab EntityLink -> accounting.factoring_advances" forward half is GONE: B3 deleted Banking's own
 * Faro-advances-timeline panel along with the whole duplicate tab (Factoring's own module already
 * shows every advance in full detail; Banking's copy was a second, thinner view of the same list).
 * The backend timeline endpoint and the EntityLink resolution rule are untouched and still real —
 * this guard now only asserts THOSE stay wired for whatever else reads them, plus that
 * FactoringDetailPage's reverse link still resolves to a live Banking route (now a redirect into
 * Accounts, where the read-only Factoring summary card lives, rather than a detailed advances list).
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const routes = fs.readFileSync(`${root}/apps/backend/src/banking/factoring-virtual.routes.ts`, "utf8");
  const api = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const manifest = fs.readFileSync(`${root}/apps/frontend/src/routes/manifest.tsx`, "utf8");
  const detail = fs.readFileSync(
    `${root}/apps/frontend/src/pages/accounting/FactoringDetailPage.tsx`,
    "utf8"
  );
  const entityLink = fs.readFileSync(`${root}/apps/frontend/src/components/shared/EntityLink.tsx`, "utf8");

  if (!routes.includes("/api/v1/banking/factoring-virtual/timeline")) {
    failures.push("factoring-virtual routes must expose /timeline");
  }
  if (!routes.includes("FROM accounting.factoring_advances") || !routes.includes("display_id")) {
    failures.push("timeline must SELECT canonical accounting.factoring_advances (incl. display_id)");
  }
  if (/factoring-virtual\/timeline[\s\S]{0,1200}SELECT \*/.test(routes)) {
    failures.push("timeline must not SELECT * (explicit columns only)");
  }
  if (!api.includes("getFactoringVirtualTimeline")) {
    failures.push("api client missing getFactoringVirtualTimeline");
  }
  if (!detail.includes('data-testid="factoring-advance-banking-reverse-link"')) {
    failures.push("FactoringDetailPage must link back to Banking Factoring entry");
  }
  if (!detail.includes("/banking/factoring")) {
    failures.push("FactoringDetailPage reverse must target /banking/factoring");
  }
  // B3 — the reverse link's target must still resolve to something real (a redirect), never a 404.
  if (!manifest.includes('path="/banking/factoring"')) {
    failures.push("routes/manifest.tsx must keep a /banking/factoring route (redirect) for the reverse link to land on");
  }
  if (!entityLink.includes('case "factoring_advance"') || !entityLink.includes("/accounting/factoring/")) {
    failures.push('EntityLink factoring_advance must resolve to /accounting/factoring/:id');
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-faro-advance-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/backend/src/banking/factoring-virtual.routes.ts",
    `/api/v1/banking/factoring-virtual/timeline\nFROM accounting.factoring_advances\ndisplay_id\n`
  );
  mk("apps/frontend/src/api/banking.ts", "export function getFactoringVirtualTimeline() {}\n");
  mk("apps/frontend/src/routes/manifest.tsx", `path="/banking/factoring"\n`);
  mk(
    "apps/frontend/src/pages/accounting/FactoringDetailPage.tsx",
    `data-testid="factoring-advance-banking-reverse-link"\n/banking/factoring\n`
  );
  mk(
    "apps/frontend/src/components/shared/EntityLink.tsx",
    `case "factoring_advance":\n      return \`/accounting/factoring/\${id}\`;\n`
  );
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/routes/manifest.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail (missing redirect route not caught)");
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-faro-advance-linkage --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-faro-advance-linkage — OK");
}

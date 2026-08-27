import fs from "node:fs";

const backend = fs.readFileSync("apps/backend/src/insurance/claim.routes.ts", "utf8");
const page = fs.readFileSync("apps/frontend/src/pages/insurance/ClaimsTab.tsx", "utf8");

function graphSlice(source) {
  const start = source.indexOf('"/api/v1/insurance/claims/:id/graph"');
  const end = source.indexOf("app.", start + 50);
  return source.slice(start, end > start ? end : source.length);
}

function problems(b = backend, p = page) {
  const graph = graphSlice(b);
  const checks = [
    [graph.length > 0, "mounted claim graph"],
    [!graph.match(/LIMIT\s+50\b/), "all eight silent caps removed"],
    [["accidents", "lawsuits", "matters", "incidents", "damage_continuity_chains", "expenses", "bills", "work_orders"].every((key) => graph.includes(key)), "all eight reverse families"],
    [graph.includes("accident_at DESC NULLS LAST, id ASC") && graph.includes("filed_date DESC NULLS LAST, id ASC"), "accident/lawsuit stable order"],
    [graph.includes("matter_number ASC, id ASC") && graph.includes("incident_at DESC NULLS LAST, id ASC"), "matter/incident stable order"],
    [graph.includes("ORDER BY uuid ASC"), "continuity stable order"],
    [graph.includes("transaction_date DESC NULLS LAST, id ASC") && graph.includes("bill_date DESC NULLS LAST, id ASC") && graph.includes("created_at DESC NULLS LAST, id ASC"), "financial/WO stable order"],
    [(graph.match(/operating_company_id = \$1::uuid/g) ?? []).length >= 7 && (graph.match(/tenant_id = \$1::uuid/g) ?? []).length >= 2, "company scope across all schemas"],
    [p.includes('data-testid="insurance-claim-expenses-reverse"') && p.includes('data-testid="insurance-claim-bills-reverse"'), "mounted claim reverse UI"],
  ];
  return checks.filter(([ok]) => !ok).map(([, label]) => label);
}

if (process.argv.includes("--selftest")) {
  const mutations = [
    [backend.replace("accident_at DESC NULLS LAST, id ASC", "accident_at DESC LIMIT 50"), page],
    [backend.replace("filed_date DESC NULLS LAST, id ASC", "filed_date DESC LIMIT 50"), page],
    [backend.replace("matter_number ASC, id ASC", "matter_number ASC LIMIT 50"), page],
    [backend.replace("incident_at DESC NULLS LAST, id ASC", "incident_at DESC LIMIT 50"), page],
    [backend.replace("ORDER BY uuid ASC", "LIMIT 50"), page],
    [backend.replace("transaction_date DESC NULLS LAST, id ASC", "transaction_date DESC LIMIT 50"), page],
    [backend.replace("bill_date DESC NULLS LAST, id ASC", "bill_date DESC LIMIT 50"), page],
    [backend.replace("created_at DESC NULLS LAST, id ASC", "created_at DESC LIMIT 50"), page],
    [backend.replace("operating_company_id = $1::uuid AND insurance_claim_id", "insurance_claim_id"), page],
  ];
  const escaped = mutations.map((mutation, index) => problems(...mutation).length === 0 ? index + 1 : null).filter(Boolean);
  if (escaped.length) throw new Error(`${escaped.length} planted defect(s) escaped: ${escaped.join(",")}`);
  console.log(`verify-insurance-claim-graph-complete-reverse selftest PASS — ${mutations.length}/${mutations.length} planted defects red`);
  process.exit(0);
}

const missing = problems();
if (missing.length) {
  console.error(`verify-insurance-claim-graph-complete-reverse FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-insurance-claim-graph-complete-reverse PASS — claim detail returns complete scoped F+R graph across eight canonical families");

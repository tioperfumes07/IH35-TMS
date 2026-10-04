// Guard (DISP-PROFIT): the LoadDetailDrawer Settlement tab must render the REAL per-load
// profitability card (tabs/SettlementProfitabilityCard — fetches getLoadProfitability + full
// cost breakdown), NOT the orphaned drawer-tabs/ stub ("content ships in Block 9"). This was a
// merged-not-live miss: the real card was built but the drawer kept importing the stub.
import { readFileSync } from "node:fs";

const LABEL = "verify-load-profitability-card-wired";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const CARD = "apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx";
const KANBAN = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";

export function audit(drawer, card, kanban) {
  const failures = [];
  if (!/import \{ SettlementProfitabilityCard \} from "\.\/tabs\/SettlementProfitabilityCard"/.test(drawer)) {
    failures.push("LoadDetailDrawer must import SettlementProfitabilityCard from ./tabs/ (the real card), not the stub");
  }
  if (/from "\.\/drawer-tabs\/SettlementProfitabilityCard"/.test(drawer)) {
    failures.push("LoadDetailDrawer must NOT import the drawer-tabs/ SettlementProfitabilityCard stub");
  }
  if (!/<SettlementProfitabilityCard[^>]*currencyCode=\{load\.currency_code\}/.test(drawer)) {
    failures.push("SettlementProfitabilityCard must receive currencyCode={load.currency_code}");
  }
  if (!/getLoadProfitability/.test(card)) failures.push("real profitability card must call getLoadProfitability");
  if (!/net_profit_cents/.test(card) || !/revenue_cents/.test(card)) {
    failures.push("real profitability card must render the revenue/net breakdown");
  }
  if (!/function DeliveredProfitBadge/.test(kanban)) failures.push("DispatchKanban must keep DeliveredProfitBadge");
  if (!/profitabilityQuery\.isError/.test(kanban)) {
    failures.push("DeliveredProfitBadge must branch on profitabilityQuery.isError (rejected fetch must not look like missing profit)");
  }
  if (!/Profit retry/.test(kanban) || !/profitabilityQuery\.refetch/.test(kanban)) {
    failures.push("DeliveredProfitBadge error branch must offer Profit retry → refetch");
  }
  // BANK-F91410 leftover refuse — SettlementProfitabilityCard page-scoped text token ratchet
  if (card.includes("text-[11px]")) failures.push("SettlementProfitabilityCard leftover text-[11px] — use text-xs");
  if (card.includes("#8A92AB")) failures.push("SettlementProfitabilityCard leftover #8A92AB — use #4B5563");
  return failures;
}

function selftest() {
  const goodDrawer = 'import { SettlementProfitabilityCard } from "./tabs/SettlementProfitabilityCard";\n<SettlementProfitabilityCard currencyCode={load.currency_code} />';
  const goodCard = "getLoadProfitability net_profit_cents revenue_cents";
  const goodKanban = "function DeliveredProfitBadge profitabilityQuery.isError Profit retry profitabilityQuery.refetch";
  const mutations = [
    ["stub import", goodDrawer.replace("./tabs/", "./drawer-tabs/"), goodCard, goodKanban],
    ["missing currency", goodDrawer.replace("currencyCode={load.currency_code}", ""), goodCard, goodKanban],
    ["hollow card", goodDrawer, goodCard.replace("getLoadProfitability", ""), goodKanban],
    ["kanban silent error", goodDrawer, goodCard, goodKanban.replace("profitabilityQuery.isError", "false")],
    // BANK-F91410 leftover plant — SettlementProfitabilityCard page-scoped text token ratchet
    ["leftover text token", goodDrawer, goodCard + '\n<p className="text-[11px] text-[#8A92AB]">plant</p>\n', goodKanban],
  ];
  if (audit(goodDrawer, goodCard, goodKanban).length) {
    console.error(`${LABEL} --selftest FAIL good fixture rejected`);
    process.exit(1);
  }
  for (const [name, d, c, k] of mutations) {
    if (audit(d, c, k).length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name} escaped`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations detected`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = audit(
  readFileSync(DRAWER, "utf8"),
  readFileSync(CARD, "utf8"),
  readFileSync(KANBAN, "utf8"),
);
if (failures.length) {
  console.error(`FAIL ${LABEL}:\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`OK ${LABEL}: drawer card + kanban profit badge fail-loud on query error.`);

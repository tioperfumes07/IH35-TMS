// Guard (DISP-PROFIT): the LoadDetailDrawer Settlement tab must render the REAL per-load
// profitability card (tabs/SettlementProfitabilityCard — fetches getLoadProfitability + full
// cost breakdown), NOT the orphaned drawer-tabs/ stub ("content ships in Block 9"). This was a
// merged-not-live miss: the real card was built but the drawer kept importing the stub.
import { readFileSync } from "node:fs";

const fail = (m) => { console.error(`FAIL verify-load-profitability-card-wired: ${m}`); process.exit(1); };
const drawer = readFileSync("apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", "utf8");

if (!/import \{ SettlementProfitabilityCard \} from "\.\/tabs\/SettlementProfitabilityCard"/.test(drawer))
  fail("LoadDetailDrawer must import SettlementProfitabilityCard from ./tabs/ (the real card), not the stub");
if (/from "\.\/drawer-tabs\/SettlementProfitabilityCard"/.test(drawer))
  fail("LoadDetailDrawer must NOT import the drawer-tabs/ SettlementProfitabilityCard stub");
if (!/<SettlementProfitabilityCard[^>]*currencyCode=\{load\.currency_code\}/.test(drawer))
  fail("SettlementProfitabilityCard must receive currencyCode={load.currency_code}");

// The real card must actually fetch + render the breakdown (so the guard fails if it's hollowed out).
const card = readFileSync("apps/frontend/src/components/dispatch/tabs/SettlementProfitabilityCard.tsx", "utf8");
if (!/getLoadProfitability/.test(card)) fail("real profitability card must call getLoadProfitability");
if (!/net_profit_cents/.test(card) || !/revenue_cents/.test(card)) fail("real profitability card must render the revenue/net breakdown");

console.log("OK verify-load-profitability-card-wired: drawer renders the real per-load profitability card.");

/**
 * PERFUME-DESK — TIO Perfumes price desk. Owner-only, hidden (no menu entry; reached from the company
 * selector's "Other businesses → TIO Perfumes" or /perfume). Isolated: reads/writes perfume.* only.
 */
import { useEffect, useMemo, useState } from "react";
import { ConfirmPricesButton } from "./PerfumeConfirmPrices";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { Button } from "../../components/Button";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { Combobox, SelectCombobox } from "../../components/Combobox";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import {
  downloadPerfumeExcel, getPerfumeAccess, getPerfumeGrid, getPerfumeReview, getPerfumeRules, listPerfumeLists, listPerfumeVendors, putPerfumeRules,
  type PerfumeFacetKey, type PerfumeGridRow, type PerfumeGridView, type PerfumeRules,
  canonicalizePerfumeBrands, rematchPerfumeReview, confirmPerfumeRow, searchPerfumeItems, searchPerfumeLines, setPerfumeMyPrice, type PerfumeMyPriceField,
} from "../../api/perfume";
import { myPriceMath } from "./perfumePriceMath";
import logoUrl from "./tio-perfumes-logo.png";
import { PerfumeListsPanel } from "./PerfumeListsPanel";
import { PerfumeMailPanel } from "./PerfumeMailPanel";
import { PerfumeContactsPanel } from "./PerfumeContactsPanel";
import { PerfumeTradeShowsPanel } from "./PerfumeTradeShowsPanel";
import { PerfumeQuotesPanel } from "./PerfumeQuotesPanel";
import { PerfumeOrdersPanel } from "./PerfumeOrdersPanel";
import { PerfumeAccountsPanel, PerfumePriceLevelsPanel } from "./PerfumeAccountsPanel";
import { PerfumePurchasesPanel } from "./PerfumePurchasesPanel";
import { PerfumeItemProfilesPanel, PerfumeSupplierProfilesPanel } from "./PerfumeProfilesPanel";
import { PerfumeItemFilePanel, PerfumeLinkagePanel, PerfumeStockLinkagePanel } from "./PerfumeItemFilePanel";
import { PerfumeSendListPanel } from "./PerfumeSendListPanel";
import { PerfumeCountsPanel, PerfumeMovesPanel, PerfumeSitesPanel, PerfumeStockPanel, PerfumeTransfersPanel, PerfumeValuationPanel, PerfumeWriteoffsPanel } from "./PerfumeInventoryPanel";
import { PerfumeCampaignPanel } from "./PerfumeCampaignPanel";
import { PerfumeTradersPanel } from "./PerfumeTradersPanel";
import { PerfumeLeadsExcelPanel } from "./PerfumeLeadsExcelPanel";
import { PerfumeCatalogsPanel } from "./PerfumeCatalogsPanel";
import { PerfumeSavedListsBar } from "./PerfumeSavedListsBar";
import { MarginGroupsEditor } from "./PerfumeMarginGroups";
import { PerfumeReviewPanel } from "./PerfumeReviewPanel";
import { tr } from "./perfumeI18n";
import { brandShort } from "./perfumeBrandShort";
import { DocLink } from "./perfumeDocParts";
import { PerfumePhoneCards, useIsPhone } from "./PerfumePhoneCards";
import { usePerfumeHeldXls } from "./usePerfumeHeldXls";
import { perfumeModuleOf } from "./perfumeModules";
import { PerfumeStatementsPanel } from "./PerfumeStatementsPanel";
import { PerfumeJournalPanel } from "./PerfumeJournalPanel";
import { PerfumeAssetsPanel } from "./PerfumeAssetsPanel";
import { PerfumeExpensesPanel } from "./PerfumeExpensesPanel";
import { PerfumeSalesTaxPanel } from "./PerfumeSalesTaxPanel";
import { PerfumeSalespeoplePanel } from "./PerfumeSalespeoplePanel";
import { PerfumeBankingPanel } from "./PerfumeBankingPanel";
import { PerfumeVendorRankingPanel } from "./PerfumeVendorRankingPanel";
import { PerfumePeriodsPanel } from "./PerfumePeriodsPanel";
import { PerfumeLoansPanel } from "./PerfumeLoansPanel";
import { PerfumeBooksPanel } from "./PerfumeBooksPanel";
import { PerfumeFamiliesPanel, PerfumeReorderPanel } from "./PerfumeFamiliesPanel";
import { PerfumeReceivablesPanel } from "./PerfumeReceivablesPanel";
import { PerfumeRankingPanel } from "./PerfumeRankingPanel";
import { PerfumePayablesPanel } from "./PerfumePayablesPanel";
import { PerfumeWholesalePanel } from "./PerfumeWholesalePanel";
import { PerfumeFamilyReportPanel, PerfumeInventoryStatusPanel, PerfumeItemInquiryPanel, PerfumePriceBookPanel, PerfumeSalesInquiryPanel, PerfumeVendorTiersPanel } from "./PerfumeReportsPanel";

type Tab = PerfumeGridView | "lists" | "mail" | "contacts" | "vendors" | "customers" | "excel" | "catalogs" | "campaign" | "sendlist" | "traders" | "shows" | "quotes" | "orders" | "purchases" | "suppliers" | "payables" | "itemfile" | "stocklink" | "linkage" | "items" | "families" | "reorder" | "pricelists" | "receivables" | "ranking" | "accounts" | "levels" | "stock" | "moves" | "transfers" | "counts" | "writeoffs" | "valuation" | "sites" | "iteminquiry" | "salesinquiry" | "pricebook" | "invstatus" | "famreport" | "vendortiers" | "review" | "rules" | "books" | "statements" | "journal" | "assets" | "loans" | "periods" | "vendorranking" | "banking" | "expenses" | "salestax" | "salespeople";
const TABS: Array<[Tab, string]> = [
  ["buy", "Purchase · compare vendors"], ["trade", "Trading · sell to my vendors"], ["wholesale", "Wholesale · vs competition"], ["comp", "Competition · their margin"], ["analysis", "List analysis"], ["all", "All items"],
  ["lists", "Price lists & import"], ["mail", "Mail price lists"], ["contacts", "Leads"], ["vendors", "Vendors"], ["customers", "Customers"], ["excel", "Excel update"], ["catalogs", "Catalogs"], ["campaign", "Campaigns"], ["sendlist", "Send list"], ["traders", "Traders"], ["shows", "Trade shows"], ["quotes", "Quotes"], ["orders", "Sales orders"], ["accounts", "Customer accounts"], ["levels", "Price levels"], ["pricelists", "Wholesale lists"], ["receivables", "Receivables"], ["ranking", "Customer ranking"], ["salespeople", "Salespeople"], ["purchases", "Purchase orders"], ["suppliers", "Vendor price lists"], ["payables", "Payables"], ["vendorranking", "Vendor ranking"], ["itemfile", "Item file"], ["stocklink", "Stock linkage"], ["linkage", "Linkage"], ["items", "Item profiles"], ["families", "Item families"], ["reorder", "Reorder"], ["stock", "Stock on hand"], ["moves", "Stock moves"], ["transfers", "Transfers"], ["counts", "Counts"], ["writeoffs", "Write-offs"], ["valuation", "Valuation"], ["sites", "Sites"], ["iteminquiry", "Items inquiry"], ["salesinquiry", "Sales inquiry"], ["pricebook", "Price book"], ["invstatus", "Inventory status"], ["famreport", "Product families"], ["vendortiers", "Vendor price tiers"], ["review", "Review"], ["rules", "Rules"], ["books", "Books"], ["statements", "Financial statements"], ["journal", "Journal entries"], ["banking", "Banking"], ["expenses", "Expenses & checks"], ["salestax", "Sales tax"], ["assets", "Fixed assets"], ["loans", "Loans & notes"], ["periods", "Periods & closing date"],
];

export const money = (c: unknown) => (c == null || c === "" ? "—" : `${Number(c) < 0 ? "−" : ""}$${(Math.abs(Number(c)) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const pct = (v: unknown) => (v == null || v === "" ? "—" : `${Number(v).toFixed(1)}%`);

function TioLogo() {
  return (
    <span
      role="img"
      aria-label={tr("perfume.desk.1", "TIO Perfumes")}
      className="inline-block h-[44px] w-[67px] shrink-0 text-[#4B5563]"
      style={{ backgroundColor: "currentColor", WebkitMaskImage: `url(${logoUrl})`, maskImage: `url(${logoUrl})`, WebkitMaskSize: "contain", maskSize: "contain", WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat" }}
    />
  );
}

export default function PerfumeDeskPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find(([k]) => k === params.get("tab"))?.[0] ?? "buy") as Tab;
  // The module this tab belongs to (left menu); only its own tabs show in the row below the title.
  const mod = perfumeModuleOf(tab);
  const modTabs = TABS.filter(([k]) => mod.tabs.includes(k));
  const priceTab = mod.id === "desk" && tab !== "rules" && tab !== "lists";
  // Owner 2026-11-13: "each tab must have a button or selector so i can have it show only those items in my list and
  // all competitions and all vendors prices on only my items". One selector for the whole desk, in the URL, kept on
  // every tab switch.
  const mine = MINE_OPTIONS.find(([k]) => k === params.get("mine"))?.[0] ?? null;
  const go = (next: { tab?: Tab; mine?: MineChoice }) => {
    const t = next.tab ?? tab;
    const m = next.mine === undefined ? mine : next.mine;
    setParams(m ? { tab: t, mine: m } : { tab: t });
  };
  const access = useQuery({ queryKey: ["perfume", "access"], queryFn: getPerfumeAccess, staleTime: 300_000 });
  const allowed = access.data?.allowed === true;
  const review = useQuery({ queryKey: ["perfume", "review-count"], queryFn: () => getPerfumeReview(0, 1), enabled: allowed });
  const phone = useIsPhone();
  // Old .xls lists the mail engine held (PCA, MOD): read here, in the browser, whenever the desk is open.
  const heldXls = usePerfumeHeldXls(allowed);
  if (!allowed) {
    return (
      <div className="p-3" data-testid="perfume-desk-locked">
        <div className="text-xs text-gray-700">
          {access.isLoading ? "Checking access…" : access.isError ? `Could not check access: ${(access.error as Error).message}` : "The TIO Perfumes price desk is not open for this login."}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-3" data-testid="perfume-desk">
      <div className="flex flex-wrap items-center gap-3">
        <TioLogo />
        <div className="min-w-0">
          <h1 className="text-page-title font-semibold text-[#1F2A44]">{`TIO Perfumes · ${tr(`perfume.module.${mod.id}`, mod.label)}`}</h1>
          <div className="text-xs text-gray-500">{tr("perfume.desk.3", "ScentsX LLC dba TIO Perfumes · owner only · separate from every carrier · never posts to accounting")}</div>
        </div>
      </div>
      {heldXls ? (
        <div className="rounded-sm border border-gray-200 bg-white px-2 py-1.5 text-xs text-gray-700" role="status" data-testid="perfume-held-xls">
          {heldXls.running
            ? `${tr("perfume.xls.reading", "Reading old Excel (.xls) price lists from mail")} · ${heldXls.done} ${tr("perfume.desk.10", "of")} ${heldXls.total}`
            : `${tr("perfume.xls.done", "Old Excel (.xls) price lists from mail")}: ${heldXls.imported} ${tr("perfume.xls.imported", "imported")} · ${heldXls.held} ${tr("perfume.xls.held", "held (see Mail tab)")} · ${heldXls.failed} ${tr("perfume.xls.failed", "failed")}`}
        </div>
      ) : null}
      {phone && modTabs.length > 1 ? (
        <SelectCombobox value={tab} onChange={(e) => go({ tab: e.target.value as Tab })} aria-label={tr("perfume.desk.4", "Price desk sections")} data-testid="perfume-phone-tabs"
          className="h-[40px] w-full text-xs font-semibold text-[#1F2A44]">
          {modTabs.map(([k, label]) => (
            <option key={k} value={k}>{label}{k === "review" && review.data?.total ? ` (${review.data.total.toLocaleString()})` : ""}</option>
          ))}
        </SelectCombobox>
      ) : (
      modTabs.length > 1 ? <nav className="flex flex-wrap gap-1" aria-label={tr("perfume.desk.4", "Price desk sections")}>
        {modTabs.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => go({ tab: k })}
            aria-current={tab === k ? "page" : undefined}
            className={`h-[34px] rounded-sm border px-3 text-xs font-semibold ${tab === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]"}`}
          >
            {label}{k === "review" && review.data?.total ? ` (${review.data.total.toLocaleString()})` : ""}
          </button>
        ))}
      </nav> : null
      )}
      {/* Owner 2026-11-12: "each tab should have its header so I can make sure I am in the correct one." */}
      <h2 className="border-b-2 border-[#1F2A44] pb-1 text-section-header font-bold uppercase tracking-wide text-[#4B5563]" data-testid="perfume-tab-header">
        {TABS.find(([k]) => k === tab)?.[1]}
      </h2>
      {mod.id !== "desk" || tab === "rules" ? null : <PerfumeSavedListsBar />}
      {!priceTab || tab === "analysis" ? null : (
        <div className="flex flex-wrap items-center gap-2 rounded-sm border border-gray-200 bg-white px-2 py-1.5" role="group" aria-label={tr("perfume.desk.mine.aria", "Show items")} data-testid="perfume-mine-filter">
          <span className="text-xs font-semibold text-[#1F2A44]">{tr("perfume.desk.mine.label", "Show")}</span>
          {(tab === "review" ? REVIEW_MINE_OPTIONS : MINE_OPTIONS).map(([k, l]) => (
            <button key={String(k)} type="button" aria-pressed={mine === k} data-testid={`perfume-mine-${k ?? "all"}`} onClick={() => go({ mine: k })}
              className={`h-[34px] rounded-sm border px-3 text-xs font-semibold ${mine === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]"}`}>
              {tr(`perfume.desk.mine.${k ?? "all"}`, l)}
            </button>
          ))}
          <span className="text-xs text-gray-600">
            {tab === "review" ? (mine ? tr("perfume.desk.mine.help.review", "Only lines that can be an item on my offer list — confirm each one.") : tr("perfume.desk.mine.help.reviewOff", "Every line waiting for you.")) : mine ? tr("perfume.desk.mine.help.on", "Only items on this list — every supplier's and every competitor's price shown for them, on every tab.") : tr("perfume.desk.mine.help.off", "Every item this tab can price.")}
          </span>
        </div>
      )}
      {tab === "lists" ? <PerfumeListsPanel /> : tab === "mail" ? <PerfumeMailPanel /> : tab === "contacts" ? <PerfumeContactsPanel key="all" /> : tab === "vendors" ? <PerfumeContactsPanel key="vendor" initialRole="vendor" /> : tab === "customers" ? <PerfumeContactsPanel key="customer" initialRole="customer" /> : tab === "excel" ? <PerfumeLeadsExcelPanel /> : tab === "catalogs" ? <PerfumeCatalogsPanel /> : tab === "campaign" ? <PerfumeCampaignPanel /> : tab === "sendlist" ? <PerfumeSendListPanel /> : tab === "traders" ? <PerfumeTradersPanel /> : tab === "shows" ? <PerfumeTradeShowsPanel /> : tab === "quotes" ? <PerfumeQuotesPanel /> : tab === "orders" ? <PerfumeOrdersPanel /> : tab === "accounts" ? <PerfumeAccountsPanel /> : tab === "levels" ? <PerfumePriceLevelsPanel /> : tab === "pricelists" ? <PerfumeWholesalePanel /> : tab === "receivables" ? <PerfumeReceivablesPanel /> : tab === "ranking" ? <PerfumeRankingPanel /> : tab === "salespeople" ? <PerfumeSalespeoplePanel /> : tab === "purchases" ? <PerfumePurchasesPanel /> : tab === "suppliers" ? <PerfumeSupplierProfilesPanel /> : tab === "payables" ? <PerfumePayablesPanel /> : tab === "itemfile" ? <PerfumeItemFilePanel /> : tab === "stocklink" ? <PerfumeStockLinkagePanel /> : tab === "linkage" ? <PerfumeLinkagePanel /> : tab === "items" ? <PerfumeItemProfilesPanel /> : tab === "families" ? <PerfumeFamiliesPanel /> : tab === "reorder" ? <PerfumeReorderPanel /> : tab === "stock" ? <PerfumeStockPanel /> : tab === "moves" ? <PerfumeMovesPanel /> : tab === "transfers" ? <PerfumeTransfersPanel /> : tab === "counts" ? <PerfumeCountsPanel /> : tab === "writeoffs" ? <PerfumeWriteoffsPanel /> : tab === "valuation" ? <PerfumeValuationPanel /> : tab === "sites" ? <PerfumeSitesPanel /> : tab === "iteminquiry" ? <PerfumeItemInquiryPanel /> : tab === "salesinquiry" ? <PerfumeSalesInquiryPanel /> : tab === "pricebook" ? <PerfumePriceBookPanel /> : tab === "invstatus" ? <PerfumeInventoryStatusPanel /> : tab === "famreport" ? <PerfumeFamilyReportPanel /> : tab === "vendortiers" ? <PerfumeVendorTiersPanel /> : tab === "books" ? <PerfumeBooksPanel /> : tab === "statements" ? <PerfumeStatementsPanel /> : tab === "journal" ? <PerfumeJournalPanel /> : tab === "assets" ? <PerfumeAssetsPanel /> : tab === "expenses" ? <PerfumeExpensesPanel /> : tab === "salestax" ? <PerfumeSalesTaxPanel /> : tab === "banking" ? <PerfumeBankingPanel /> : tab === "vendorranking" ? <PerfumeVendorRankingPanel /> : tab === "periods" ? <PerfumePeriodsPanel /> : tab === "loans" ? <PerfumeLoansPanel /> : tab === "review" ? <ReviewDesk mine={mine} /> : tab === "rules" ? <RulesPanel /> : <GridPanel view={tab} mine={mine} />}
    </div>
  );
}

/* ---------------- grid ---------------- */

const VIEW_HELP: Record<PerfumeGridView, string> = {
  buy: "Buying from your suppliers: my last cost, purchase date, qty purchased, inventory and qty sold (from my inventory file — inventory from my list until it is uploaded), who is cheapest (Buy from), then each supplier's list price and its price less the cushion (Cushion).",
  trade: "Selling to your suppliers: your estimated cost (best supplier) and your actual cost (from your inventory file) once, then for each supplier its list price, about what it earns on the item (list price − cushion − what it pays), and about the price you need to sell to it at ((list price − cushion) less Their earn %).",
  wholesale: "My offer price against each competitor's real price: their list price less the cushion ($0.25 at $10 and under, $0.50 over $10, $1.00 over $30). Over/under in $ and %, and the % to reduce my price (or the room to raise). Their description sits next to mine so every match can be checked.",
  comp: "Each competitor's margin if they buy from the cheapest supplier: that supplier's list price less the cushion ($0.25 at $10 and under, $0.50 over $10, $1.00 over $30 — change it in Rules) is their cost; their price less that is what they earn.",
  analysis: "My list analysed in my own format: ITEM · SALES (purchase date, qty, last cost, sold, inventory, margin, markup, offer, Esperanza, lowest sales price) · Purchases (min purchase price to match La Esperanza at Min margin — the My margin % box, 15 when empty — lowest vendor and price) · Analysis (under / over, % to raise or lower, new margin) · COMPETITOR (list price, cushion, sales price). Blank = that figure is not in any upload yet.",
  all: "The whole item database.",
};
type MineChoice = "offer" | "inventory" | "need" | null;
const MINE_OPTIONS: ReadonlyArray<readonly [MineChoice, string]> = [[null, "All items"], ["offer", "My offer list"], ["inventory", "My inventory"], ["need", "Need to buy"]];
const REVIEW_MINE_OPTIONS: ReadonlyArray<readonly [MineChoice, string]> = [[null, "All lines"], ["offer", "My offer list"]];
const PAGE = 200;
const PAGE_SIZES = [50, 100, 200, 300, 500, 1000];

/** Columns a view opens with; every other column is one tick away in the ⚙ gear. */
/** Owner 2026-11-17 14:04 CT, every tab: "i still need to view my list price … my last cost, avg cost … margins, mark up
 *  etc. all the same data so i can make the correct decisions and purchases." Shown by default on every tab but List
 *  analysis (which keeps the owner's own format). Blank cost = "—"; margin / markup read 0 until a cost exists. */
const MY_PRICE_SET = ["my_offer_price", "my_last_cost", "my_avg_cost", "offer_margin_pct", "offer_markup_pct", "offer_margin_avg_pct", "offer_markup_avg_pct"];
const BUY_SET = ["low_buy_price", "buy_margin_pct", "buy_markup_pct"];
function defaultVisible(view: PerfumeGridView, key: string, mine: MineChoice = null): boolean {
  // Owner 2026-11-23 12:32 CT: suppliers (PCA, MTZ …) are for Purchase and Trading — never on Wholesale or List analysis.
  if (view !== "analysis" && (MY_PRICE_SET.includes(key) || ((view === "buy" || view === "all") && BUY_SET.includes(key)))) return true;
  // Owner 2026-11-27 15:40 CT: every tab shows the item's margin group and the % it is priced at; the price at that margin on
  // Purchase, All items and Trading.
  if (view !== "analysis" && (key === "margin_group" || key === "margin_pct")) return true;
  if ((view === "buy" || view === "all" || view === "trade") && key === "target_price_margin") return true;
  const item = ["brand", "name", "size_ml", "conc", "category"].includes(key);
  // Narrowed to my own list: on every tab, my list's figures plus EVERY supplier's list price and EVERY competitor's
  // price for those items (owner 2026-11-13), on top of the tab's own columns.
  // Owner 2026-11-14: no cost I never uploaded and no purchase quantities (no sales / movement data) by default.
  // List analysis: exactly the owner's format (a:* columns), nothing else.
  // Owner 2026-11-15 13:27 CT: the MATCH group is only the competitor's description (brand / competitor / match state
  // live on Review · My list ↔ competitor, where matching is done).
  // Owner 2026-11-23: several wholesalers (Esperanza, Broadway, Omni) — the Competitor column names whose price it is.
  // Owner 2026-11-27 15:40 CT: "by default we do not need their description. just list and real price … same for lsit analysis" —
  // the competitor's description, cushion and name are one tick away in the gear.
  if (view === "analysis") return key.startsWith("a:") && !["a:c_brand", "a:match", "a:c_desc", "a:c_cushion", "a:c_vendor"].includes(key);
  if (mine && view !== "comp" && (/^v:.*:price$/.test(key) || /^s:.*:price$/.test(key)
    || ["my_offer_desc", "my_offer_price", "my_qty", "best_vendor"].includes(key))) return true;
  // Purchase (owner 2026-11-12: "I am in purchase from vendors, I don't have costs, so there should be no costs"):
  // who is cheapest, then each supplier's list price and Cushion (list price less the cushion). No cost / price / profit columns.
  // Owner 2026-11-14: "in purchase compare vendors i need … my last cost, date, quantity purchased, current inventory,
  // qty sold … the last price i purchased is important because prices change weekly."
  // Owner 2026-11-27 15:40 / 15:42 CT: "here i do not need by default inventory per location, i need inventory quantity of laredo
  // warehouse by default" (008) — the other sites and the all-sites total are one tick away in the gear.
  if (view === "buy") return item || /^v:.*:(price|net)$/.test(key) || key === "loc:008" || ["best_vendor", "my_last_cost", "my_avg_cost", "my_purchase_date", "my_qty_purchased", "my_qty_sold"].includes(key);
  // Trading (owner 2026-11-12): my cost ONCE, then per supplier only their list price, what they earn, what I sell to them at.
  if (view === "trade") return item || /^t:.*:(list|earn|cost)$/.test(key) || /^trade_(low|high|profit)/.test(key) || ["landed_likely", "my_last_cost", "my_qty"].includes(key);
  // Owner 2026-11-14: "in competition their margin … the vendors prices should be after all the esperanza data
  // margins etc. i need to see their data next to mine" — mine, then the competitor (their line, list, cushion, sales
  // price, their cost, what they earn, margin), then every supplier's list price.
  // Owner 2026-11-15 13:32 CT: their cost is reverse-engineered from THEIR list (list − cushion = sales; × (1 − my
  // margin estimate) = cost ≈), not from where they buy — so no supplier columns here.
  // Owner 2026-11-27 15:40 CT: "same for competition their margin" — per competitor only the list price and the real (sales) price
  // by default; description, cushion, margin, cost and earn are in the gear.
  if (view === "comp") return item || /^c:.*:(price|sales)$/.test(key)
    || ["my_offer_desc", "my_offer_price", "my_qty"].includes(key);
  // Wholesale (owner 2026-11-14): my description + my offer price, then per competitor their description, list price,
  // cushion, real price, and me vs their real price ($, %, reduce / raise). No cost, margin or need-to-buy columns.
  // Owner 2026-11-27 15:40 CT: "in wholesale competition … by default we do not need their description. just list and real price.
  // by default, if i want more data ill select" — cushion, difference and action are in the gear.
  if (view === "wholesale") return item || /^s:.*:(price|real)$/.test(key) || ["my_offer_desc", "my_offer_price"].includes(key);
  return item || ["upc", "my_qty", "my_last_cost", "my_offer_price", "landed_likely", "best_vendor", "low_sell"].includes(key);
}

/** Owner 2026-11-23 12:32 CT: "in analysis or the wholesale vs competition i need to have wholesalers … not PCA and those,
 *  those are vendors … for trading and for purchasing, so they should not be appearing in wholesale or list analysis."
 *  Every supplier column (each supplier's prices, Trading, cheapest supplier, the cost built from a supplier) is left out
 *  of these tabs entirely — not even in the gear. */
const SUPPLIER_COL = /^(v:|t:|trade_|low_buy_|buy_(margin|markup)_pct$|landed_likely$|best_(vendor|price)$|n_vendors$|target_|cushion$|freight$)/;
function supplierFree(view: PerfumeGridView): boolean {
  return view === "wholesale" || view === "comp" || view === "analysis";
}
/** Wholesaler picker (owner 2026-11-23: "have toggle buttons … I also just need an analysis of Broadway"): the vendors
 *  switched on for Wholesale; none picked = all of them. Kept per tab in this browser. */
function useCompPicks(view: PerfumeGridView) {
  const vendors = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors, enabled: supplierFree(view) });
  const wholesalers = (vendors.data?.vendors ?? []).filter((v) => (v.roles ?? []).includes("wholesale"));
  // List analysis also compares with suppliers (owner 2026-11-27 15:40 CT "select if vendor, or competition").
  const suppliers = view === "analysis" ? (vendors.data?.vendors ?? []).filter((v) => (v.roles ?? []).includes("purchase") && !(v.roles ?? []).includes("wholesale")) : [];
  const storeKey = `perfume-comps-${view}-v1`;
  const read = (): string[] => { try { const v = JSON.parse(window.localStorage.getItem(storeKey) ?? "[]"); return Array.isArray(v) ? v.map(String) : []; } catch { return []; } };
  const [picks, setPicks] = useState<{ key: string; ids: string[] }>(() => ({ key: storeKey, ids: read() }));
  if (picks.key !== storeKey) setPicks({ key: storeKey, ids: read() });
  const valid = picks.ids.filter((id) => wholesalers.some((w) => w.id === id) || suppliers.some((w) => w.id === id));
  const save = (ids: string[]) => { try { window.localStorage.setItem(storeKey, JSON.stringify(ids)); } catch { /* storage blocked: this visit only */ } setPicks({ key: storeKey, ids }); };
  return { wholesalers, suppliers, picked: valid, save };
}

const FACETS: Array<{ key: PerfumeFacetKey; label: string; all: string }> = [
  { key: "category", label: "Type", all: "All types" },
  { key: "gender", label: "Gender", all: "All genders" },
  { key: "brand", label: "Brand", all: "All brands" },
  { key: "size", label: "Size ml", all: "All sizes" },
  { key: "vendor", label: "Vendor", all: "All vendors" },
  // Owner 2026-11-27 15:40 CT: margins by group — the same group filter on every tab.
  { key: "group", label: "Margin group", all: "All groups" },
];
const NO_PICKS: Record<PerfumeFacetKey, string[]> = { category: [], gender: [], brand: [], size: [], vendor: [], group: [] };

/** Grid columns that hold vendor names (one or several). */
const VENDOR_NAME_COLS = new Set(["best_vendor", "low_buy_vendor", "trade_low_vendor", "trade_high_vendor", "low_sell_vendor", "a:c_vendor"]);

/** List analysis columns no upload fills yet (purchase date, qty purchased, last cost, sold, and what needs a cost). */
const ANALYSIS_EMPTY = new Set(["a:purch_date", "a:qty", "a:last_cost", "a:sold"]);

/** Confirm a match right on the analysis row (owner 2026-11-14: "if from my list there are no matches or confirmed or
 *  still waiting for confirmation, then i should be able to confirm here"). Pick one of the proposed lines / items and
 *  Link — the same confirm the Review tab uses; nothing links without this click. */
/** List analysis · the match box (owner 2026-11-14: "in check the match, we are missing the box to search, suggestions
 *  etc, the correct matching engine"). The same engine as Review: the best suggestion is one click, the box starts on
 *  it, can be cleared, and searches any words in any order.
 *   - a line of mine with no item, or a competitor line → link THAT line to one of my items (items search);
 *   - a line of mine that has its item → link a COMPETITOR line to my item (competitor-lines search). */
/** The other side's description, as ONE box (owner 2026-11-14 17:07 CT: "shouldn't that be in the same competitor
 *  description box so it is not redundant"): it shows what the line is linked to now — or, when unlinked, the best
 *  suggestion, pre-selected and marked — and the same box searches and confirms a different one. */
function MatchCell({ row, current }: { row: PerfumeGridRow; current: string | null }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const mode = row.link_mode === "line" ? "line" : "item";
  const linkRow = row.link_row == null ? null : String(row.link_row);
  const linkItem = row.link_item == null ? null : String(row.link_item);
  const cand = (Array.isArray(row.cand) ? row.cand : []) as Array<{ row_id: string; item_id: string; label: string; price_cents: number | null; why: string }>;
  const sugg = cand.map((x) => ({ value: mode === "line" ? x.row_id : x.item_id, label: x.label, sublabel: [x.price_cents != null ? money(x.price_cents) : "", x.why].filter(Boolean).join(" · ") }));
  const CUR = "__current";
  const [pick, setPick] = useState<string | null>(current ? CUR : sugg[0]?.value ?? null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const on = search.trim().length >= 2;
  // This row's gender: the search never offers the other gender (owner 2026-11-14 17:22 — Light Blue Men was linked
  // by accident to Light Blue Women).
  const g = row.gender === "M" || row.gender === "W" ? String(row.gender) : null;
  const items = useQuery({ queryKey: ["perfume", "items", search, g], queryFn: () => searchPerfumeItems(search, g), enabled: on && mode === "item" });
  const lines = useQuery({ queryKey: ["perfume", "lines", search, g], queryFn: () => searchPerfumeLines(search, g), enabled: on && mode === "line" });
  const found = mode === "item"
    ? (items.data?.items ?? []).map((h) => ({ value: h.id, label: h.display_name, sublabel: h.upcs?.join(" ") ?? "" }))
    : (lines.data?.lines ?? []).map((h) => ({ value: h.row_id, label: `${h.description} · ${h.vendor}`, sublabel: [h.price_cents != null ? money(h.price_cents) : "", GENDER_WORD[h.gender ?? "—"] ?? "", h.linked_to ? `now linked to ${h.linked_to}` : "not linked"].filter(Boolean).join(" · ") }));
  const options = [
    ...(current ? [{ value: CUR, label: current, sublabel: tr("perfume.analysis.linkedNow", "linked now") }] : []),
    ...sugg.map((x) => ({ ...x, sublabel: [tr("perfume.analysis.suggested", "suggested"), x.sublabel].filter(Boolean).join(" · ") })),
    ...found.filter((f) => !sugg.some((x) => x.value === f.value)),
  ];
  const go = async (target: string | null, createNew = false) => {
    setBusy(true);
    try {
      if (mode === "line") { if (!target || !linkItem) return; await confirmPerfumeRow(target, { item_id: linkItem }); }
      else { if (!linkRow) return; await confirmPerfumeRow(linkRow, createNew ? { create_new: true } : { item_id: target! }); }
      pushToast(tr("perfume.analysis.linked", "Linked."), "success");
      // Owner 2026-11-16 14:01 CT ("it is taking very long for the confirmations or accepting suggestions"): the link is
      // saved when confirmPerfumeRow answers; the box is free at once and the views reload in the background (the
      // server stays the authority — the reload replaces every number on screen).
      void qc.invalidateQueries({ queryKey: ["perfume"] });
    } catch (e) { pushToast(userFacingApiError(e, tr("perfume.analysis.linkfail", "Could not link")), "error"); }
    finally { setBusy(false); }
  };
  const changed = Boolean(pick) && pick !== CUR;
  return (
    <span className="flex items-center gap-1" data-testid="perfume-analysis-matchbox">
      <span className="w-[320px]">
        <Combobox ariaLabel={mode === "line" ? "Competitor line" : "Item"} size="sm" value={pick} onChange={setPick} onSearch={setSearch} options={options} allowClear clearCommittedOnEdit
          placeholder={mode === "line" ? tr("perfume.analysis.searchLine", "Search their line, UPC or code") : tr("perfume.analysis.searchItem", "Search my item, UPC or code")} />
      </span>
      {changed ? <Button type="button" className="h-[28px] px-2 text-xs" disabled={busy} onClick={() => void go(pick)}>{tr("perfume.analysis.confirm", "Confirm")}</Button> : null}
      {mode === "item" && !current ? (
        <Button type="button" variant="secondary" className="h-[28px] px-2 text-xs" disabled={busy} onClick={() => void go(null, true)}>{tr("perfume.analysis.newItem", "New item")}</Button>
      ) : null}
    </span>
  );
}

const LOW_PAIR = new Set(["a:offer", "a:esp", "a:offer2", "a:esp2"]);

/** The price boxes the owner types in (owner 2026-11-17 14:04 CT: "all price boxes editable in my lists so i can change
 *  price and engine automatically calculates for that item the margin etc. in all tabs"). Column → what it writes. */
const EDIT_FIELD: Record<string, PerfumeMyPriceField> = {
  my_offer_price: "offer", my_last_cost: "last_cost", my_avg_cost: "avg_cost", "a:offer": "offer", "a:offer2": "offer", "a:last_cost": "last_cost", "a:avg_cost": "avg_cost",
};
/** Which row / line a box writes, or null when the box is not mine to type in (an item not on my offer list has no list
 *  price of mine; a competitor line not linked to an item has no cost of mine). */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function editTarget(r: PerfumeGridRow, key: string): { item_id: string | null; line_id: string | null } | null {
  const field = EDIT_FIELD[key];
  if (!field) return null;
  const id = String(r.id);
  const analysis = key.startsWith("a:");
  const itemId = analysis ? (r.item_id == null ? null : String(r.item_id)) : id;
  if (field === "offer") {
    if (analysis && id.startsWith("m:")) return { item_id: null, line_id: String(r.line_id) };
    if (analysis) return itemId && r["a:offer"] != null ? { item_id: itemId, line_id: null } : null;
    return r.in_offer === 1 ? { item_id: itemId, line_id: null } : null;
  }
  return itemId ? { item_id: itemId, line_id: null } : null;
}
/** Dollars typed → cents; "" clears (costs only). */
function parseDollars(t: string): number | null | "bad" {
  const x = t.replace(/[$,\s]/g, "");
  if (x === "") return null;
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? Math.round(n * 100) : "bad";
}

/** One editable price box. Enter or leaving the box saves; Esc puts the number back. The row recomputes on screen at once
 *  (perfumePriceMath, the server's own formulas), then every view reloads from the server. */
function PriceCell({ row, colKey, tone }: { row: PerfumeGridRow; colKey: string; tone: "low" | "neg" | null }) {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const v = row[colKey];
  const shown = v == null || v === "" ? "" : (Number(v) / 100).toFixed(2);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const target = editTarget(row, colKey);
  const field = EDIT_FIELD[colKey]!;
  const save = async () => {
    if (draft == null) return;
    const cents = parseDollars(draft);
    if (cents === "bad") { pushToast(tr("perfume.price.bad", "Type a price in dollars, like 24.50"), "error"); return; }
    if (cents === (v == null || v === "" ? null : Number(v))) { setDraft(null); return; }
    if (field === "offer" && cents == null) { pushToast(tr("perfume.price.need", "My list price can't be blank."), "error"); return; }
    setBusy(true);
    try {
      await setPerfumeMyPrice({ ...target!, field, cents });
      // The item's row recomputes now on every view held in memory; the server's rebuild then replaces it.
      const itemId = target!.item_id;
      qc.setQueriesData<{ rows?: PerfumeGridRow[] } & Record<string, unknown>>({ queryKey: ["perfume", "grid"] }, (old) => {
        if (!old?.rows) return old;
        return { ...old, rows: old.rows.map((r) => (sameTarget(r, target!, itemId) ? recompute(r, field, cents) : r)) };
      });
      setDraft(null);
      pushToast(tr("perfume.price.saved", "Saved — margins recomputed"), "success");
      void qc.invalidateQueries({ queryKey: ["perfume", "grid"] });
    } catch (e) { pushToast(userFacingApiError(e, tr("perfume.price.fail", "Price not saved")), "error"); }
    finally { setBusy(false); }
  };
  if (!target) return <span>{money(v)}</span>;
  const cls = tone === "low" ? "bg-[#DCEFE3] font-semibold text-[#14532D]" : tone === "neg" ? "font-semibold text-red-700" : "bg-white";
  return (
    <input
      type="text" inputMode="decimal" disabled={busy}
      data-testid={`perfume-price-${colKey}`}
      aria-label={`${field === "offer" ? "My list price" : field === "last_cost" ? "My last cost" : "My avg cost"} ${String(row.display_name ?? row.name ?? "")}`}
      value={draft ?? shown} placeholder="—"
      onChange={(e) => setDraft(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void save(); } if (e.key === "Escape") setDraft(null); }}
      onBlur={() => void save()}
      onClick={(e) => e.stopPropagation()}
      className={`h-[26px] w-[84px] rounded-sm border border-gray-300 px-1 text-right text-xs tabular-nums ${cls}`}
    />
  );
}
function sameTarget(r: PerfumeGridRow, t: { item_id: string | null; line_id: string | null }, itemId: string | null): boolean {
  if (t.line_id) return String(r.line_id ?? "") === t.line_id || (itemId != null && String(r.id) === itemId);
  if (!itemId) return false;
  return String(r.id) === itemId || String(r.item_id ?? "") === itemId;
}
function recompute(r: PerfumeGridRow, field: PerfumeMyPriceField, cents: number | null): PerfumeGridRow {
  const n = { ...r } as Record<string, unknown>;
  const num = (k: string) => (n[k] == null || n[k] === "" ? null : Number(n[k]));
  if (field === "offer") { if ("my_offer_price" in n || !String(r.id).includes(":")) n.my_offer_price = cents; if (String(r.id).includes(":")) { n["a:offer"] = cents; n["a:offer2"] = cents; } }
  if (field === "last_cost") { n.my_last_cost = cents; if (String(r.id).includes(":")) n["a:last_cost"] = cents; }
  if (field === "avg_cost") { n.my_avg_cost = cents; if (String(r.id).includes(":")) n["a:avg_cost"] = cents; }
  if (!String(r.id).includes(":")) Object.assign(n, myPriceMath(num("my_offer_price"), num("my_last_cost"), num("my_avg_cost"), num("low_buy_price")));
  else {
    // List analysis — the owner's own Margin / Markup / New margin (0 until a last cost exists).
    const o = num("a:offer"), c = num("a:last_cost"), esp = num("a:esp");
    const p1 = (x: number) => Math.round(x * 1000) / 10;
    n["a:margin"] = o != null && o > 0 ? (c != null ? p1((o - c) / o) : 0) : null;
    n["a:markup"] = o != null ? (c ? p1((o - c) / c) : 0) : null;
    n["a:new_margin"] = esp != null && esp > 0 ? (c != null ? p1((esp - c) / esp) : 0) : null;
    const av = num("a:avg_cost");
    n["a:margin_avg"] = o != null && o > 0 ? (av != null ? p1((o - av) / o) : 0) : null;
    n["a:markup_avg"] = o != null ? (av ? p1((o - av) / av) : 0) : null;
    // Match the competitor (price − the rule's $0.25): the change and my margin / profit there on each cost.
    const mp = num("a:match_price");
    n["a:match_change"] = mp != null && o != null ? mp - o : null;
    n["a:match_margin"] = mp != null && mp > 0 && c != null ? p1((mp - c) / mp) : null;
    n["a:match_profit"] = mp != null && c != null ? mp - c : null;
    n["a:match_margin_avg"] = mp != null && mp > 0 && av != null ? p1((mp - av) / mp) : null;
    n["a:match_profit_avg"] = mp != null && av != null ? mp - av : null;
  }
  return n as PerfumeGridRow;
}
const GENDER_WORD: Record<string, string> = { W: "Women", M: "Men", U: "Unisex", "—": "Not stated" };

/** "Match my list ↔ competitor" (owner 2026-11-14 15:10: "in match my list competitor it is practically the same
 *  thing"): the List-analysis lines in the matching format only — the line, what the engine assigned, the
 *  suggestion in the same format with the confirm / search box, and what it is matched to now. */
const MATCH_DESK = /^a:(upc|sku|brand|name|size|kind|c_desc|c_brand|c_vendor|match|offer|esp)$/;

/** Review · match (owner 2026-11-14 17:22): every linking happens here — competitor lines waiting for me, and my list ↔
 *  competitor (each of my lines with no competitor line, and each competitor line not on my list). */
function ReviewDesk({ mine }: { mine: MineChoice }) {
  const [part, setPart] = useState<"waiting" | "pair">("waiting");
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1" role="group" aria-label={tr("perfume.reviewDesk.aria", "Review part")} data-testid="perfume-review-part">
        {([["waiting", "Lines waiting for me"], ["pair", "My list ↔ competitor"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={part === k} data-testid={`perfume-review-part-${k}`} onClick={() => setPart(k)}
            className={`h-[34px] rounded-sm border px-3 text-xs font-semibold ${part === k ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]"}`}>
            {tr(`perfume.reviewDesk.${k}`, l)}
          </button>
        ))}
      </div>
      {part === "waiting" ? <PerfumeReviewPanel mine={mine ? "offer" : null} /> : <GridPanel view="analysis" mine={null} matchDesk />}
    </div>
  );
}

function GridPanel({ view, mine, matchDesk = false }: { view: PerfumeGridView; mine: MineChoice; matchDesk?: boolean }) {
  const { pushToast } = useToast();
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "brand", dir: "asc" });
  const [q, setQ] = useState("");
  const phone = useIsPhone();
  const [picks, setPicks] = useState<Record<PerfumeFacetKey, string[]>>(NO_PICKS);
  // Owner 2026-11-27 15:47 CT: "like quickbooks … if i click on a vendor in a list, it should give me its profile … if i click on brands
  // … it should take me to those" — every vendor name in the grid opens that supplier's profile; a brand narrows the grid to it.
  const vendorsAll = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors, staleTime: 60_000 });
  const vendorIdByName = useMemo(() => new Map((vendorsAll.data?.vendors ?? []).flatMap((v) => [[v.name, v.id], ...(v.short_name ? [[v.short_name, v.id]] : [])] as Array<[string, string]>)), [vendorsAll.data]);
  const [page, setPage] = useState(1);
  // The desk-wide "Show" selector changed: back to page 1.
  const [mineSeen, setMineSeen] = useState(mine);
  if (mineSeen !== mine) { setMineSeen(mine); setPage(1); }
  const [pageSize, setPageSize] = useState(PAGE);
  // Owner 2026-11-14: "i need filter so i can select only the items from the competitions list" — on by default on
  // Competition (their margin means nothing for items they do not carry); one click on every other tab.
  const [carried, setCarried] = useState(view === "comp");
  // List analysis (owner 2026-11-14): whose list — mine (every line of my list) or theirs (every competitor line) — and
  // a side filter: all, matched (in common), not matched. Plus one button to hide the columns no upload fills yet.
  const [base, setBase] = useState<"mine" | "theirs">("mine");
  const [match, setMatch] = useState<"all" | "matched" | "unmatched">(matchDesk ? "unmatched" : "all");
  const [hideEmpty, setHideEmpty] = useState(false);
  const comp = useCompPicks(view);
  const comps = supplierFree(view) ? comp.picked : [];
  const [viewSeen, setViewSeen] = useState(view);
  if (viewSeen !== view) { setViewSeen(view); setCarried(view === "comp"); setPage(1); }
  // The margin the owner wants to see prices at — typed here, applied on Enter or leaving the box.
  const [target, setTarget] = useState<number | null>(null);
  const [targetDraft, setTargetDraft] = useState("");
  // Trading: the % the owner believes his suppliers earn — their price less this is what he can offer them.
  const [earn, setEarn] = useState<number | null>(null);
  const [earnDraft, setEarnDraft] = useState("");
  // Owner 2026-11-15 13:49 CT: "in all reports in the perfumes i need to have a confirm or save so i can know the
  // changes are taking effect." A typed % no longer applies silently on leaving the box: Apply (or Enter) runs it,
  // the line beside it says "Not applied yet" until then, and "✓ Applied … N recomputed at <time>" once the server has
  // recomputed the grid with it. "Save as default" writes it to Rules so every view and every export keeps it.
  const qc = useQueryClient();
  const parsePct = (d: string): number | null | "bad" => {
    if (d.trim() === "") return null;
    const t = Number(d);
    return Number.isFinite(t) && t >= 0 && t <= 95 ? t : "bad";
  };
  const showEarn = view === "trade" || view === "comp";
  const draftTarget = parsePct(targetDraft), draftEarn = parsePct(earnDraft);
  const pending = (targetDraft.trim() !== "" && draftTarget !== target) || (showEarn && earnDraft.trim() !== "" && draftEarn !== earn);
  const [awaiting, setAwaiting] = useState(false);
  const [confirmed, setConfirmed] = useState<{ at: string; text: string; saved: boolean } | null>(null);
  const [savingDefault, setSavingDefault] = useState(false);
  const applyAll = () => {
    if (draftTarget === "bad") { pushToast(tr("perfume.desk.target.bad", "Margin must be between 0 and 95%."), "error"); return; }
    if (showEarn && draftEarn === "bad") { pushToast(tr("perfume.desk.earn.bad", "Earn % must be between 0 and 95%."), "error"); return; }
    const nt: number | null = targetDraft.trim() === "" ? target : draftTarget;
    const ne: number | null = !showEarn || earnDraft.trim() === "" || draftEarn === "bad" ? earn : draftEarn;
    if (nt === target && ne === earn) return;
    setConfirmed(null);
    setAwaiting(true);
    setTarget(nt); setEarn(ne); setPage(1);
  };
  const saveDefault = async () => {
    const t = targetDraft.trim() === "" ? target : draftTarget;
    const e = !showEarn || earnDraft.trim() === "" ? earn : draftEarn;
    if (t === "bad" || e === "bad") { applyAll(); return; }
    const rules = await getPerfumeRules();
    const patch: Partial<PerfumeRules> = {};
    if (t != null) patch.wholesale_targets_pct = [t, ...(rules.wholesale_targets_pct ?? []).slice(1)];
    if (showEarn && e != null) { if (view === "comp") patch.store_earn_pct = e; else patch.vendor_earn_pct = e; }
    if (!Object.keys(patch).length) return;
    setSavingDefault(true);
    try {
      await putPerfumeRules(patch);
      await qc.invalidateQueries({ queryKey: ["perfume"] });
      const parts = [t != null ? `My margin ${t}%` : null, showEarn && e != null ? `${view === "comp" ? "Their margin" : "Their earn"} ${e}%` : null].filter(Boolean);
      setConfirmed({ at: new Date().toLocaleTimeString(), text: `${parts.join(" · ")} saved as the default for every view and export`, saved: true });
      pushToast(tr("perfume.desk.saved", "Saved as default"), "success");
    } catch (err) { pushToast(userFacingApiError(err, "Not saved"), "error"); } finally { setSavingDefault(false); }
  };
  // Owner 2026-11-15 20:15 CT ("i type in amor … it took about 1 minute. fix the speed"): measured 02:15Z — every
  // keystroke ("a", "am", "amo", "amor") sent its own grid request; four ran at once on a cold grid, 41 s each. The search
  // now asks once the typing pauses (300 ms): one request per word typed, not one per letter.
  const [qAsked, setQAsked] = useState(q);
  useEffect(() => {
    const t = window.setTimeout(() => setQAsked(q), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const query = useQuery({
    queryKey: ["perfume", "grid", view, sort.key, sort.dir, qAsked, picks, target, earn, page, pageSize, mine, carried, base, match, comps.join(",")],
    queryFn: () => getPerfumeGrid({ view, sort: sort.key, dir: sort.dir, q: qAsked, ...picks, target_pct: target, earn_pct: earn, mine, carried, base, match, comps, offset: (page - 1) * pageSize, limit: pageSize }),
    placeholderData: (prev) => prev,
  });
  // Competition: my columns, then the competitor's, then every supplier's list price (owner 2026-11-14: "the vendors
  // prices should be after all the esperanza data margins etc."). Other tabs keep the server's order.
  const cols = useMemo(() => {
    const all0 = query.data?.cols ?? [];
    const all = supplierFree(view) ? all0.filter((c) => !SUPPLIER_COL.test(c.key)) : all0;
    if (view !== "comp") return all;
    const rank = (k: string) => (k.startsWith("v:") ? 2 : k.startsWith("t:") || k.startsWith("a:") ? 3 : 1);
    return all.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.key) - rank(b.c.key) || a.i - b.i).map((x) => x.c);
  }, [query.data?.cols, view]);
  // A wholesaler switched off on the picker: its column group is hidden too (Wholesale, Competition).
  const compOff = (k: string) => { const m = /^[sc]:([^:]+):/.exec(k); return Boolean(m && comps.length && !comps.includes(m[1]!)); };
  // Owner 2026-11-12: "so I don't confuse between vendors have a line noting difference." A heavy left rule on the
  // first shown column of every group (Mine, each supplier, each competitor) — header and every row.
  // Owner 2026-11-16 16:31 CT: "if on any item there is a lowest item should also be colored in and if many have the same
  // price, then those have the same colors." Like with like: every vendor's list price, every competitor's real price …
  const lowFamily = useMemo(() => {
    const fam = new Map<string, string[]>();
    for (const c of cols) {
      const m = /^([vtsc]):[^:]+:([a-z_]+)$/.exec(c.key);
      if (!m || c.kind !== "money" || /diff|earn|cushion|cush|margin/.test(m[2]!)) continue;
      const f = `${m[1]}:${m[2]}`;
      (fam.get(f) ?? fam.set(f, []).get(f)!).push(c.key);
    }
    const byKey = new Map<string, string[]>();
    for (const keys of fam.values()) if (keys.length >= 2) for (const k of keys) byKey.set(k, keys);
    return byKey;
  }, [cols]);
  // Owner 2026-11-16 19:23–19:24 CT: "in the gears I need to have the selection to turn on mine, brand, size, type etc.
  // … should also have my last cost etc. … these should be in all tabs" and "toggle the item section on and off in all
  // so it does not take up so much space". Measured: the table gear listed 707 bare checkboxes in a 192 px box ("List
  // price", "Cushion" … with no vendor name), so Mine / Brand / Size / Type / My last cost could not be found. The desk now
  // owns which columns show: every tab's columns grouped by section (Item, Mine, each vendor, each competitor …), a
  // switch per section and per column, kept per tab in this browser; the tab's own defaults until the owner changes one.
  const visKey = `perfume-cols-${matchDesk ? "match-" : ""}${view}${mine ? "-mine" : ""}-v1`;
  const isItemGroup = (g: string) => g.trim().toUpperCase() === "ITEM";
  const defaultOn = (key: string) => (matchDesk ? MATCH_DESK.test(key) : defaultVisible(view, key, mine) && !(view === "analysis" && hideEmpty && ANALYSIS_EMPTY.has(key)));
  type VisState = { choices: Record<string, boolean>; itemOff: boolean; descOff: boolean };
  const readChoices = (k: string): VisState => {
    try { const v = JSON.parse(window.localStorage.getItem(k) ?? "null"); if (v && typeof v === "object") return { choices: v.choices ?? {}, itemOff: v.itemOff === true, descOff: v.descOff === true }; } catch { /* storage blocked: tab defaults */ }
    return { choices: {}, itemOff: false, descOff: false };
  };
  const [vis, setVis] = useState(() => ({ key: visKey, ...readChoices(visKey) }));
  if (vis.key !== visKey) setVis({ key: visKey, ...readChoices(visKey) });
  const saveVis = (next: VisState) => {
    try { window.localStorage.setItem(visKey, JSON.stringify(next)); } catch { /* storage blocked: kept for this visit */ }
    setVis({ key: visKey, ...next });
  };
  // Owner 2026-11-17 14:04 CT: "i need to be able to toggle on and off as well the competition description" — one switch
  // for every competitor's description column (the match box in Review stays).
  const isDesc = (k: string) => /^s:[^:]+:desc$/.test(k) || (!matchDesk && k === "a:c_desc");
  const isShown = (c: { key: string; group: string }) => (compOff(c.key) ? false : vis.itemOff && isItemGroup(c.group) ? false : vis.descOff && isDesc(c.key) ? false : vis.choices[c.key] ?? defaultOn(c.key));
  const shownCols = cols.filter(isShown);
  const descShown = shownCols.some((c) => isDesc(c.key));
  const shownSig = shownCols.map((c) => c.key).join("|");
  const groupStart = useMemo(() => {
    const seen = new Set<string>();
    const starts = new Set<string>();
    for (const c of shownCols) {
      if (seen.has(c.group)) continue;
      seen.add(c.group);
      if (c.group !== "Item") starts.add(c.key);
    }
    return starts;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shownSig is the shown column list
  }, [shownSig, cols]);
  const columns: Array<ParityColumn<PerfumeGridRow>> = useMemo(
    () => shownCols.map((c) => ({
      key: c.key,
      label: c.label,
      sortable: true,
      alwaysVisible: true,
      kind: c.kind === "money" || c.kind === "pct" || c.kind === "int" ? ("number" as const) : undefined,
      // Owner 2026-11-27 15:42 CT: "the description and name should not be centered … on the left hand side, as in excel" —
      // every text column (brand, name, descriptions, vendor names) reads left; numbers stay right.
      cellClass: [c.kind === "text" ? "text-left" : "text-right tabular-nums", groupStart.has(c.key) ? "border-l-2 border-l-slate-500" : ""].filter(Boolean).join(" ") || undefined,
      className: [c.kind === "text" ? "text-left" : "", groupStart.has(c.key) ? "border-l-2 border-l-slate-500" : ""].filter(Boolean).join(" ") || undefined,
      sortValue: (r: PerfumeGridRow) => r[c.key] ?? null,
      ...(c.key === "a:c_desc" || (view === "analysis" && c.key === "a:name") ? { minWidth: 360 } : {}),
      exportValue: (r: PerfumeGridRow) => (Array.isArray(r[c.key]) ? (r[c.key] as unknown as Array<{ label: string }>).map((x) => x.label).join("; ") : r[c.key] ?? null),
      render: (r: PerfumeGridRow) => {
        const v = r[c.key];
        if (EDIT_FIELD[c.key] && !matchDesk) {
          let tone: "low" | "neg" | null = v != null && v !== "" && Number(v) < 0 ? "neg" : null;
          if (LOW_PAIR.has(c.key) && v != null && r["a:offer"] != null && r["a:esp"] != null && Number(v) === Math.min(Number(r["a:offer"]), Number(r["a:esp"]))) tone = "low";
          if (c.key === "my_offer_price" && v != null && v !== "") {
            let low: number | null = null;
            for (const k of Object.keys(r)) {
              if (!/^(v|s|c):[^:]+:price$/.test(k)) continue;
              const x = r[k];
              if (x != null && x !== "" && Number.isFinite(Number(x)) && (low == null || Number(x) < low)) low = Number(x);
            }
            if (low != null && Number(v) <= low) tone = "low";
          }
          return <span data-testid={tone === "low" ? (c.key === "my_offer_price" ? "perfume-offer-lowest" : "perfume-analysis-lowest") : undefined} className="block"><PriceCell key={`${String(r.id)}:${String(v)}`} row={r} colKey={c.key} tone={tone} /></span>;
        }
        // List analysis (owner 2026-11-14): the lower of my offer and their price gets its own shade, that box only;
        // "more expensive by" is negative and red.
        if (c.kind === "money" && LOW_PAIR.has(c.key) && v != null && r["a:offer"] != null && r["a:esp"] != null && Number(v) === Math.min(Number(r["a:offer"]), Number(r["a:esp"]))) {
          return <span data-testid="perfume-analysis-lowest" className="-mx-1 block rounded-sm bg-[#DCEFE3] px-1 font-semibold text-[#14532D]">{money(v)}</span>;
        }
        const fam = lowFamily.get(c.key);
        if (fam && v != null && v !== "") {
          let min: number | null = null;
          for (const k of fam) { const x = r[k]; if (x != null && x !== "" && Number.isFinite(Number(x)) && (min == null || Number(x) < min)) min = Number(x); }
          if (min != null && Number(v) === min) return <span data-testid="perfume-vendor-lowest" className="-mx-1 block rounded-sm bg-[#DCEFE3] px-1 font-semibold text-[#14532D]">{money(v)}</span>;
        }
        // Owner 2026-11-16 19:24 CT: "if any of my offer prices are the same or lower than anybody else then should be
        // highlighted in green" — my offer at or under every supplier's and every competitor's price for the item.
        if (c.key === "my_offer_price" && v != null && v !== "") {
          let low: number | null = null;
          for (const k of Object.keys(r)) {
            if (!/^(v|s|c):[^:]+:price$/.test(k)) continue;
            const x = r[k];
            if (x != null && x !== "" && Number.isFinite(Number(x)) && (low == null || Number(x) < low)) low = Number(x);
          }
          if (low != null && Number(v) <= low) return <span data-testid="perfume-offer-lowest" className="-mx-1 block rounded-sm bg-[#DCEFE3] px-1 font-semibold text-[#14532D]">{money(v)}</span>;
        }
        if (c.key === "a:over_by" && v != null && Number(v) < 0) return <span className="font-semibold text-red-700">{money(v)}</span>;
        // Owner 2026-11-15 13:32 CT: in every view a negative figure (I'm more expensive / must lower) is red.
        if (c.kind === "money") return v != null && Number(v) < 0 ? <span className="font-semibold text-red-700">{money(v)}</span> : money(v);
        if (c.kind === "pct") return <span className={v == null ? "" : Number(v) < 0 ? "text-red-700" : Number(v) >= 20 ? "text-slate-700 font-semibold" : ""}>{pct(v)}</span>;
        // List analysis is read-only (owner 2026-11-14 17:22: "THE MATCHING SHOULD BE DONE IN THE REVIEW"). In Review ·
        // My list ↔ competitor, the match box sits in the OTHER side's description: my line → theirs; their line → mine.
        if (matchDesk && c.key === "a:c_desc" && String(r.id).startsWith("m:")) return <MatchCell key={String(r.id)} row={r} current={(r["a:c_desc"] as string) ?? null} />;
        if (matchDesk && c.key === "a:name" && String(r.id).startsWith("c:")) return <MatchCell key={String(r.id)} row={r} current={(r["a:name"] as string) ?? null} />;
        // Owner 2026-11-27 06:57 CT: clicking an item opens its profile, where it is edited.
        if ((c.key === "name" || (c.key === "a:name" && !matchDesk)) && v != null && v !== "") {
          const itemId = view === "analysis" ? (r.item_id == null ? "" : String(r.item_id)) : String(r.id);
          if (UUID_RE.test(itemId)) return <DocLink tab="items" id={itemId} testId="perfume-grid-item-link">{String(v)}</DocLink>;
        }
        // Vendor names → the supplier's profile (several names: "PCA | MTZ" or "PCA, MTZ").
        if (VENDOR_NAME_COLS.has(c.key) && v != null && v !== "") {
          const names = String(v).split(/\s*\|\s*|,\s+/).filter(Boolean);
          if (names.some((nm) => vendorIdByName.has(nm))) {
            return (
              <span className={c.key === "best_vendor" && r.tied ? "rounded-sm bg-slate-100 px-1" : undefined}>
                {names.map((nm, i) => {
                  const vid = vendorIdByName.get(nm);
                  return <span key={`${nm}-${i}`}>{i ? ", " : ""}{vid ? <DocLink tab="suppliers" id={vid} testId="perfume-grid-vendor-link">{nm}</DocLink> : nm}</span>;
                })}
              </span>
            );
          }
        }
        // Brand → the grid narrowed to that brand (the Brand filter), one click.
        if ((c.key === "brand" || c.key === "a:brand") && v != null && v !== "" && !matchDesk) {
          const b = String(v);
          return <button type="button" className="font-semibold text-[#14314F] underline" data-testid="perfume-grid-brand-link" title={b}
            onClick={(e) => { e.stopPropagation(); setPicks((p) => ({ ...p, brand: [b] })); setPage(1); }}>{brandShort(b)}</button>;
        }
        if (c.key === "a:match") return <span className={r.matched === 1 ? "text-[#1F8A4C] font-semibold" : "text-[#C76A0A] font-semibold"}>{String(v ?? "—")}</span>;
        if (c.key === "best_vendor" && r.tied) return <span title={tr("perfume.desk.5", "Tied lowest price")} className="rounded-sm bg-slate-100 px-1">{String(v)}</span>;
        if (c.key === "upc" && Number(r.upc_count) > 1) return <span title={String(r.upcs ?? "")}>{String(v)} <span className="text-gray-500">+{Number(r.upc_count) - 1}</span></span>;
        if (typeof v === "string" && /reduce|lower to compete|more expensive/i.test(v)) return <span className="font-semibold text-red-700">{v}</span>;
        return v == null || v === "" ? "—" : String(v);
      },
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shownSig is the shown column list
    [shownSig, cols, view, mine, groupStart, matchDesk, lowFamily, vendorIdByName],
  );
  const columnGroups = useMemo(() => {
    const groups: Array<{ label: string; keys: string[]; sublabel?: string }> = [];
    for (const c of shownCols) {
      const g = groups.find((x) => x.label === c.group);
      if (g) { g.keys.push(c.key); g.sublabel ??= c.sub; } else groups.push({ label: c.group, keys: [c.key], sublabel: c.sub });
    }
    return groups;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shownSig is the shown column list
  }, [shownSig, cols]);
  // Every column of the tab, by section, for the gear.
  const allGroups = useMemo(() => {
    const groups: Array<{ label: string; cols: typeof cols }> = [];
    for (const c of cols) {
      const g = groups.find((x) => x.label === c.group);
      if (g) g.cols.push(c); else groups.push({ label: c.group, cols: [c] });
    }
    return groups;
  }, [cols]);
  const setShown = (keys: string[], on: boolean) => {
    const choices = { ...vis.choices };
    for (const k of keys) choices[k] = on;
    saveVis({ ...vis, choices, descOff: on && keys.some(isDesc) ? false : vis.descOff });
  };
  const columnPanel = (
    <div data-testid="perfume-columns-panel" className="text-xs">
      <div className="mb-1 flex items-center justify-between gap-2">
        <span className="font-semibold uppercase tracking-wide text-gray-500">{tr("perfume.cols.title", "Columns by section")}</span>
        <button type="button" className="rounded-sm px-1.5 py-0.5 font-semibold text-gray-600 hover:bg-gray-100" data-testid="perfume-columns-defaults"
          onClick={() => saveVis({ choices: {}, itemOff: false, descOff: false })}>{tr("perfume.cols.defaults", "Tab defaults")}</button>
      </div>
      <div className="max-h-[60vh] min-w-[300px] overflow-auto pr-1">
        {allGroups.map((g) => {
          const on = g.cols.filter(isShown).length;
          const item = isItemGroup(g.label);
          return (
            <details key={g.label} className="border-b border-gray-100 py-0.5" open={item || g.label === "Mine"}>
              <summary className="flex cursor-pointer items-center gap-2 py-0.5">
                <input type="checkbox" aria-label={`${g.label}: show all columns`} data-testid={`perfume-colgroup-${g.label}`}
                  checked={on === g.cols.length} ref={(el) => { if (el) el.indeterminate = on > 0 && on < g.cols.length; }}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => {
                    if (item && e.target.checked && vis.itemOff) { saveVis({ ...vis, choices: { ...vis.choices, ...Object.fromEntries(g.cols.map((c) => [c.key, true])) }, itemOff: false }); return; }
                    setShown(g.cols.map((c) => c.key), e.target.checked);
                  }} />
                <span className="font-semibold text-[#1F2A44]">{g.label}</span>
                <span className="text-gray-500">{on}/{g.cols.length}</span>
              </summary>
              <div className="ml-5 grid grid-cols-1 gap-x-3">
                {g.cols.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 py-0.5 text-gray-700">
                    <input type="checkbox" data-testid={`perfume-col-${c.key}`} checked={isShown(c)}
                      onChange={(e) => {
                        if (item && vis.itemOff && e.target.checked) { saveVis({ ...vis, choices: { ...vis.choices, [c.key]: true }, itemOff: false }); return; }
                        setShown([c.key], e.target.checked);
                      }} />
                    {c.label}
                  </label>
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
  const hasItem = cols.some((c) => isItemGroup(c.group));
  // The switch shows whenever the tab has competitor descriptions — they are off by default (owner 2026-11-27 15:40 CT).
  const hasDesc = cols.some((c) => isDesc(c.key) && !compOff(c.key));
  const total = query.data?.total ?? 0;
  // Confirm only once the server has recomputed with the applied numbers (the grid's own measured_at, not the click):
  // the new key's own data, never the previous page held as placeholder.
  if (awaiting && !query.isFetching && !query.isPlaceholderData && (query.data || query.isError)) {
    setAwaiting(false);
    if (query.data && !query.isError) {
      const parts = [`My margin ${query.data.target_pct}%`, showEarn ? `${view === "comp" ? "Their margin" : "Their earn"} ${earn ?? query.data.earn_pct}%` : null].filter(Boolean);
      setConfirmed({ at: new Date(query.data.measured_at).toLocaleTimeString(), text: `${parts.join(" · ")} — ${query.data.total.toLocaleString()} ${view === "analysis" ? "lines" : "items"} recomputed`, saved: false });
    }
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <section className="space-y-2" aria-label={`${view} view`}>
      <div className="text-xs text-gray-600">{VIEW_HELP[view]}</div>
      {supplierFree(view) && comp.wholesalers.length ? (
        <div className="flex flex-wrap items-center gap-1 text-xs" role="group" aria-label={tr("perfume.comps.label", "Compare with")} data-testid="perfume-comp-picker">
          <span className="font-semibold text-[#1F2A44]">{tr("perfume.comps.label", "Compare with")}</span>
          <button type="button" aria-pressed={comps.length === 0} data-testid="perfume-comp-all" onClick={() => { comp.save([]); setPage(1); }}
            className={`h-[30px] rounded-sm border px-3 ${comps.length === 0 ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700"}`}>{tr("perfume.comps.all", "All wholesalers")}</button>
          {comp.wholesalers.map((w) => {
            const on = comps.includes(w.id);
            return (
              <button key={w.id} type="button" aria-pressed={on} data-testid={`perfume-comp-${(w.short_name || w.name).replace(/\s+/g, "-").toLowerCase()}`}
                onClick={() => { comp.save(on ? comps.filter((x) => x !== w.id) : [...comps, w.id]); setPage(1); }}
                className={`h-[30px] rounded-sm border px-3 ${on ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700"}`}>{w.name}</button>
            );
          })}
          {comp.suppliers.length ? <span className="ml-2 font-semibold text-[#1F2A44]">{tr("perfume.comps.vendors", "Vendors")}</span> : null}
          {comp.suppliers.map((w) => {
            const on = comps.includes(w.id);
            return (
              <button key={w.id} type="button" aria-pressed={on} data-testid={`perfume-comp-vendor-${(w.short_name || w.name).replace(/\s+/g, "-").toLowerCase()}`}
                onClick={() => { comp.save(on ? comps.filter((x) => x !== w.id) : [...comps, w.id]); setPage(1); }}
                className={`h-[30px] rounded-sm border px-3 ${on ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)] text-gray-700"}`}>{w.name}</button>
            );
          })}
        </div>
      ) : null}
      {/* TABLE_DATE_OMIT: price-grid rows are SKU×vendor cells; list date lives on the Lists tab, not the comparison grid. */}
      {/* The table mounts only once the server has sent this view's columns: ParityTable reads the default
          hidden set at mount, so mounting with no columns showed EVERY column (owner 2026-11-12: Trading still
          showed every supplier's purchase columns). Keyed by view so each tab starts from its own defaults. */}
      <div className={view === "analysis" ? (phone ? "space-y-2" : "grid grid-cols-[150px_minmax(0,1fr)] items-start gap-2") : ""}>
      {view === "analysis" ? (
        <aside className="space-y-3 rounded-sm border border-gray-200 bg-white p-2 text-xs" aria-label={tr("perfume.analysis.side", "Analysis filters")} data-testid="perfume-analysis-side">
          <fieldset className="space-y-1">
            <legend className="font-semibold text-[#1F2A44]">{tr("perfume.analysis.base", "Show list")}</legend>
            {([["mine", "My list"], ["theirs", "Their list"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1"><input type="radio" name="perfume-analysis-base" checked={base === k} onChange={() => { setBase(k); setPage(1); }} data-testid={`perfume-analysis-base-${k}`} />{tr(`perfume.analysis.base.${k}`, l)}</label>
            ))}
          </fieldset>
          <fieldset className="space-y-1">
            <legend className="font-semibold text-[#1F2A44]">{tr("perfume.analysis.match", "Rows")}</legend>
            {([["all", "All"], ["matched", "Matched (in common)"], ["unmatched", "Not matched"]] as const).map(([k, l]) => (
              <label key={k} className="flex items-center gap-1"><input type="radio" name="perfume-analysis-match" checked={match === k} onChange={() => { setMatch(k); setPage(1); }} data-testid={`perfume-analysis-match-${k}`} />{tr(`perfume.analysis.match.${k}`, l)}</label>
            ))}
          </fieldset>
          <button type="button" onClick={() => setHideEmpty(!hideEmpty)} aria-pressed={!hideEmpty} data-testid="perfume-analysis-empty-toggle"
            className="h-[30px] w-full rounded-sm border border-gray-300 bg-[var(--surface-unselected)] px-2 text-left font-semibold text-gray-700 hover:bg-[var(--surface-hover)]">
            {hideEmpty ? tr("perfume.analysis.showEmpty", "Show purchase / cost columns") : tr("perfume.analysis.hideEmpty", "Hide purchase / cost columns")}
          </button>
        </aside>
      ) : null}
      <div className="min-w-0">
      {cols.length === 0 ? (
        <div className="text-xs text-gray-500" data-testid="perfume-grid-loading">{query.isError ? "Couldn't load the grid" : "Loading…"}</div>
      ) : phone ? (
        <div className="space-y-2" data-testid="perfume-phone-grid">
          <input
            type="search"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
            placeholder={tr("perfume.desk.6", "Search code, UPC, SKU, brand, name")}
            aria-label={tr("perfume.desk.7", "Search items")}
            data-testid="perfume-phone-search"
            className="h-[40px] w-full rounded-sm border border-gray-300 px-2 text-xs"
          />
          <PerfumePhoneCards
            rows={query.data?.rows ?? []}
            cols={query.data?.cols ?? []}
            loading={query.isLoading || query.isFetching}
            emptyText={q || Object.values(picks).some((p) => p.length > 0) ? "No items match the search and filters." : "No items yet — import a price list."}
          />
        </div>
      ) : (
      <ParityTable<PerfumeGridRow> selectable
        key={`${matchDesk ? "match-" : ""}${view}-${mine ?? "all"}-${view === "analysis" ? (hideEmpty ? "h" : "a") : ""}`}
        columns={columns}
        rows={query.data?.rows ?? []}
        rowKey={(r) => String(r.id)}
        batchActions={(sel) => <ConfirmPricesButton itemIds={sel.map((r) => String(r.id))} targetPct={target ?? null} earnPct={earn ?? null} />}
        loading={query.isLoading}
        wrapHeaders
        storageKey={`perfume-desk-${matchDesk ? "match-" : ""}${view}${mine ? "-mine" : ""}${view === "analysis" ? (hideEmpty ? "-h" : "-a") : ""}-v8`}
        columnGroups={columnGroups}
        sortKey={sort.key}
        sortDirection={sort.dir}
        sortMode="external"
        onSortChange={(key, dir) => { setSort({ key, dir }); setPage(1); }}
        page={1}
        pageSize={Math.max(1, query.data?.rows?.length ?? pageSize)}
        hidePager
        suppressToolbarSearch
        stickyHeader
        scrollMaxHeight="calc(100vh - 230px)"
        gearExtra={columnPanel}
        enableColumnReorder
        emptyText={q || Object.values(picks).some((p) => p.length > 0) ? "No items match the search and filters." : "No items yet — import a price list."}
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            {hasItem ? (
              <button type="button" data-testid="perfume-item-toggle" aria-pressed={!vis.itemOff}
                onClick={() => saveVis({ ...vis, itemOff: !vis.itemOff })}
                className={`h-[34px] rounded-sm border px-3 text-xs font-semibold ${vis.itemOff ? "border-gray-300 bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]" : "border-[#1F2A44] bg-[#1F2A44] text-white"}`}>
                {vis.itemOff ? tr("perfume.item.show", "Show item columns") : tr("perfume.item.hide", "Hide item columns")}
              </button>
            ) : null}
            {hasDesc ? (
              // Owner 2026-11-27 15:40 CT: their description is off by default; this one switch shows / hides every competitor's description.
              <button type="button" data-testid="perfume-desc-toggle" aria-pressed={descShown}
                onClick={() => saveVis({ ...vis, descOff: false, choices: { ...vis.choices, ...Object.fromEntries(cols.filter((c) => isDesc(c.key)).map((c) => [c.key, !descShown])) } })}
                className={`h-[34px] rounded-sm border px-3 text-xs font-semibold ${!descShown ? "border-gray-300 bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]" : "border-[#1F2A44] bg-[#1F2A44] text-white"}`}>
                {!descShown ? tr("perfume.desc.show", "Show competitor description") : tr("perfume.desc.hide", "Hide competitor description")}
              </button>
            ) : null}
            <input
              type="search"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
              placeholder={tr("perfume.desk.6", "Search code, UPC, SKU, brand, name")}
              aria-label={tr("perfume.desk.7", "Search items")}
              className="h-[34px] w-[260px] max-w-full rounded-sm border border-gray-300 px-2 text-xs"
            />
            <label className="flex items-center gap-1 text-xs text-gray-700">
              {tr("perfume.desk.target.label", "My margin %")}
              <input
                type="number"
                step="0.5"
                min="0"
                max="95"
                inputMode="decimal"
                data-testid="perfume-target-pct"
                value={targetDraft}
                placeholder={query.data?.target_pct != null ? String(query.data.target_pct) : ""}
                onChange={(e) => setTargetDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") applyAll(); }}
                aria-label={tr("perfume.desk.target.aria", "Margin percent for the My target columns")}
                className="h-[34px] w-[80px] rounded-sm border border-gray-300 px-2 text-xs tabular-nums"
              />
            </label>
            <MarginGroupsEditor />
            <label className="flex items-center gap-1 text-xs text-gray-700" data-testid="perfume-carried">
              <input type="checkbox" checked={carried} onChange={(e) => { setCarried(e.target.checked); setPage(1); }} />
              {tr("perfume.desk.carried", "Only items on the competitor's list")}
            </label>
            {view === "trade" || view === "comp" ? (
              <label className="flex items-center gap-1 text-xs text-gray-700">
                {tr("perfume.desk.earn.label", "Their earn %")}
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  max="95"
                  inputMode="decimal"
                  data-testid="perfume-earn-pct"
                  value={earnDraft}
                  placeholder={query.data?.earn_pct != null ? String(query.data.earn_pct) : ""}
                  onChange={(e) => setEarnDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") applyAll(); }}
                  aria-label={view === "comp" ? tr("perfume.desk.earn.ariaComp", "Margin I estimate the competitor earns — sets their cost ≈") : tr("perfume.desk.earn.aria", "Percent your suppliers earn, for the Trading offer")}
                  className="h-[34px] w-[80px] rounded-sm border border-gray-300 px-2 text-xs tabular-nums"
                />
              </label>
            ) : null}
            <Button type="button" className="h-[34px] px-3 text-xs" data-testid="perfume-apply" disabled={!pending || awaiting} onClick={applyAll}>
              {awaiting ? tr("perfume.desk.applying", "Applying…") : tr("perfume.desk.apply", "Apply")}
            </Button>
            <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" data-testid="perfume-save-default" disabled={savingDefault || (targetDraft.trim() === "" && (!showEarn || earnDraft.trim() === "") && target == null && earn == null)} onClick={() => void saveDefault()}>
              {savingDefault ? tr("perfume.desk.saving", "Saving…") : tr("perfume.desk.saveDefault", "Save as default")}
            </Button>
            <span data-testid="perfume-apply-status" role="status" aria-live="polite" className="text-xs">
              {pending
                ? <span className="font-semibold text-[#B45309]">{tr("perfume.desk.pending", "Not applied yet — press Apply")}</span>
                : awaiting
                  ? <span className="text-gray-600">{tr("perfume.desk.recomputing", "Recomputing…")}</span>
                  : confirmed
                    ? <span className="font-semibold text-[#14532D]">✓ {confirmed.saved ? tr("perfume.desk.savedAt", "Saved") : tr("perfume.desk.appliedAt", "Applied")} {confirmed.at} — {confirmed.text}</span>
                    : null}
            </span>
            {FACETS.map((f) => (
              <MultiSelectDropdown
                key={f.key}
                label={f.label}
                allLabel={f.all}
                data-testid={`perfume-filter-${f.key}`}
                searchable={f.key === "brand" || f.key === "vendor" || f.key === "size"}
                options={(query.data?.facets?.[f.key] ?? []).map((o) => ({ value: o.value, label: `${f.key === "gender" ? GENDER_WORD[o.value] ?? o.value : o.value} (${o.count.toLocaleString()})` }))}
                selected={picks[f.key]}
                onChange={(next) => { setPicks((p) => ({ ...p, [f.key]: next })); setPage(1); }}
              />
            ))}
            {Object.values(picks).some((p) => p.length > 0) ? (
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => { setPicks(NO_PICKS); setPage(1); }}>
                {tr("perfume.desk.filters.clear", "Clear filters")}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="secondary"
              className="h-[34px] px-3 text-xs"
              onClick={() => {
                const visible = shownCols.map((c) => c.key);
                downloadPerfumeExcel({ view, sort: sort.key, dir: sort.dir, q, ...picks, target_pct: target, earn_pct: earn, mine, carried, base, match, comps }, visible)
                  .then(() => pushToast(`Exported ${total.toLocaleString()} ${view === "analysis" ? "lines" : "items"} to Excel — with the formulas and colours`, "success"))
                  .catch((e) => pushToast(String(e?.message ?? e), "error"));
              }}
            >
              {tr("perfume.desk.8", "Export to Excel")}
            </Button>
          </div>
        }
      />
      )}
      </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-600">
        <span>{total.toLocaleString()} {view === "analysis" ? tr("perfume.desk.9b", "lines · page") : tr("perfume.desk.9", "items · page")} {page} {tr("perfume.desk.10", "of")} {pages}{query.data ? ` · measured ${new Date(query.data.measured_at).toLocaleTimeString()}` : ""}</span>
        <span className="flex items-center gap-1">
          <label className="flex items-center gap-1">
            {tr("perfume.desk.pagesize", "Rows per page")}
            <SelectCombobox
              value={String(pageSize)}
              onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }}
              aria-label={tr("perfume.desk.pagesize.aria", "Rows per page")}
              data-testid="perfume-page-size"
              className="h-[34px] w-[84px] text-xs"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={String(n)}>{n}</option>)}
            </SelectCombobox>
          </label>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page <= 1} onClick={() => setPage(1)}>{tr("perfume.desk.11", "First")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>{tr("perfume.desk.12", "Previous")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page >= pages} onClick={() => setPage(page + 1)}>{tr("perfume.desk.13", "Next")}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={page >= pages} onClick={() => setPage(pages)}>{tr("perfume.desk.14", "Last")}</Button>
        </span>
      </div>
    </section>
  );
}

/* ---------------- match clean-up ---------------- */

/** Owner 2026-11-12 ("perfumes completely done"): one click merges brands spelled two ways, then re-runs Review. */
function MatchCleanup() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    try {
      const c = await canonicalizePerfumeBrands();
      const r = await rematchPerfumeReview();
      const parts = Object.entries(r).map(([k, v]) => `${k.replace(/_/g, " ")} ${v}`).join(" · ");
      setResult(`${c.checked.toLocaleString()} items checked · ${c.renamed} renamed · ${c.merged} merged · ${Object.keys(c.brands).length} brand spellings · Review: ${parts}`);
      await qc.invalidateQueries({ queryKey: ["perfume"] });
      pushToast("Brands cleaned and Review re-run", "success");
    } catch (e) { pushToast(userFacingApiError(e, "Clean-up did not run"), "error"); }
    finally { setBusy(false); }
  };
  return (
    <div data-testid="perfume-match-cleanup">
      <div className="text-card-title">{tr("perfume.desk.38", "Match clean-up")}</div>
      <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void run()}>{busy ? tr("perfume.desk.40", "Running…") : tr("perfume.desk.39", "Merge brand spellings + re-run Review")}</Button>
        <span className="text-gray-600">{result ?? tr("perfume.desk.41", "One spelling per brand (CALVIN → CALVIN KLEIN, NARCISO R → NARCISO RODRIGUEZ …); the same bottle under two spellings becomes one item. Safe to run again.")}</span>
      </div>
    </div>
  );
}

/* ---------------- rules ---------------- */

const STEPS: Array<[PerfumeRules["round_step"], string]> = [["1", "Exact (no rounding)"], ["5", ".05"], ["10", ".10"], ["25", ".25"], ["50", ".50"], ["100", "1.00"], ["75", "ends in .75"]];
const DIRS: Array<[PerfumeRules["round_dir"], string]> = [["up", "Up"], ["nearest", "Nearest"], ["down", "Down"]];

function RulesPanel() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const rules = useQuery({ queryKey: ["perfume", "rules"], queryFn: getPerfumeRules });
  const vendors = useQuery({ queryKey: ["perfume", "vendors"], queryFn: listPerfumeVendors });
  const lists = useQuery({ queryKey: ["perfume", "lists"], queryFn: listPerfumeLists });
  const [draft, setDraft] = useState<Partial<PerfumeRules>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const r = { ...(rules.data ?? {}), ...draft } as PerfumeRules;
  if (!rules.data) return <div className="text-xs text-gray-500">{tr("perfume.desk.15", "Loading rules…")}</div>;
  const dollars = (k: keyof PerfumeRules) => (
    <input type="number" step="0.05" min="0" aria-label={String(k)} className="h-[40px] w-[120px] rounded-sm border border-gray-300 px-2 text-xs tabular-nums"
      value={((r[k] as number) / 100).toFixed(2)} onChange={(e) => setDraft({ ...draft, [k]: Math.round(Number(e.target.value) * 100) })} />
  );
  const percent = (k: "vendor_earn_pct" | "store_earn_pct") => (
    <input type="number" step="0.5" min="0" max="99" aria-label={k} className="h-[40px] w-[104px] rounded-sm border border-gray-300 px-2 text-xs tabular-nums"
      value={r[k]} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} />
  );
  const save = async () => {
    try { await putPerfumeRules(draft); setDraft({}); await qc.invalidateQueries({ queryKey: ["perfume"] }); setSavedAt(new Date().toLocaleTimeString()); pushToast("Rules saved — every view recomputed", "success"); }
    catch (e) { pushToast(userFacingApiError(e, "Rules not saved"), "error"); }
  };
  const seg = <T extends string>(opts: Array<[T, string]>, value: T, set: (v: T) => void) => (
    <span className="inline-flex flex-wrap gap-1">{opts.map(([v, l]) => (
      <button key={v} type="button" onClick={() => set(v)} aria-pressed={value === v}
        className={`h-[34px] rounded-sm border px-2 text-xs ${value === v ? "border-[#1F2A44] bg-[#1F2A44] text-white" : "border-gray-300 bg-[var(--surface-unselected)]"}`}>{l}</button>
    ))}</span>
  );
  return (
    <section className="max-w-[960px] space-y-4 rounded-sm border border-gray-200 bg-white p-3" aria-label={tr("perfume.desk.16", "Rules")}>
      <div>
        <div className="text-card-title">{tr("perfume.desk.17", "Closed numbers")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">{tr("perfume.desk.18", "Close to")} {seg(STEPS, r.round_step, (v) => setDraft({ ...draft, round_step: v }))} {tr("perfume.desk.19", "Direction")} {seg(DIRS, r.round_dir, (v) => setDraft({ ...draft, round_dir: v }))}</div>
      </div>
      <div>
        <div className="text-card-title">{tr("perfume.desk.match1", "Match the competitor")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">{tr("perfume.desk.match2", "My match price = their price less")} {dollars("match_under_cents")} {tr("perfume.desk.match3", "— List analysis shows the change, and my margin and profit at that price on my last and average cost")}</div>
      </div>
      <div>
        <div className="text-card-title">{tr("perfume.desk.20", "Vendor cushion (default — each vendor can override in Price lists)")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">{tr("perfume.desk.21", "From")} {dollars("cushion_lo_cents")} {tr("perfume.desk.22", "to")} {dollars("cushion_hi_cents")}</div>
      </div>
      <div>
        <div className="text-card-title">{tr("perfume.desk.23", "Freight per piece (default)")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">{tr("perfume.desk.24", "From")} {dollars("freight_lo_cents")} {tr("perfume.desk.25", "to")} {dollars("freight_hi_cents")}</div>
      </div>
      <div>
        <div className="text-card-title">{tr("perfume.desk.26", "What they earn")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">{tr("perfume.desk.27", "My suppliers earn")} {percent("vendor_earn_pct")}{tr("perfume.desk.29", "% on their price — the Trading tab offers them their price less this (change it there for one look, or here to keep it)")}</div>
      </div>
      <div>
        <div className="text-card-title">{tr("perfume.desk.34", "Competition margin — cushion by list price")}</div>
        <div className="mt-1 flex flex-wrap items-center gap-3 text-xs" data-testid="perfume-comp-tiers">
          {(r.competitor_cushion_tiers ?? []).map((t, i) => (
            <span key={i} className="inline-flex items-center gap-1">{t.over_cents === 0 ? tr("perfume.desk.35", "Any price") : `${tr("perfume.desk.36", "Over")} ${money(t.over_cents)}`}:
              <MoneyInput className="w-[96px]" ariaLabel={`cushion tier ${i + 1}`} valueCents={t.cushion_cents}
                onChangeCents={(c) => setDraft({ ...draft, competitor_cushion_tiers: (r.competitor_cushion_tiers ?? []).map((x, j) => (j === i ? { ...x, cushion_cents: c ?? 0 } : x)) })} />
            </span>
          ))}
          <span className="text-gray-600">{tr("perfume.desk.37", "— the Competition tab takes each competitor's list price less this as their sales price; × (1 − their margin %) = their cost ≈")}</span>
        </div>
      </div>
      <MatchCleanup />
      <div className="flex gap-2">
        <Button type="button" className="h-[34px] px-3 text-xs" disabled={!Object.keys(draft).length} onClick={() => void save()}>{tr("perfume.desk.30", "Save")}</Button>
        <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!Object.keys(draft).length} onClick={() => setDraft({})}>{tr("perfume.desk.31", "Cancel")}</Button>
        <span data-testid="perfume-rules-status" role="status" aria-live="polite" className="self-center text-xs">
          {Object.keys(draft).length
            ? <span className="font-semibold text-[#B45309]">{tr("perfume.desk.rulesPending", "Changes not saved yet — press Save")}</span>
            : savedAt ? <span className="font-semibold text-[#14532D]">✓ {tr("perfume.desk.rulesSaved", "Saved")} {savedAt} — {tr("perfume.desk.rulesSavedTail", "every view and export recomputed")}</span> : null}
        </span>
      </div>
      <div className="text-xs text-gray-600">
        {vendors.data?.vendors?.length ?? 0} {tr("perfume.desk.32", "vendors ·")} {lists.data?.lists?.length ?? 0} {tr("perfume.desk.33", "price lists on file. Est. cost (best supplier) = cheapest supplier price − low cushion + high freight (an estimate, the safe number; not your cost); best case = vendor price − high cushion + low freight. My actual cost = what you paid, from your inventory file. Margin = profit ÷ price. Markup = profit ÷ cost.")}
      </div>
    </section>
  );
}

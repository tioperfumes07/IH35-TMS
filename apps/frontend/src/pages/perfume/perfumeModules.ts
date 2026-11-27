/**
 * PERFUME-WORKSPACE — TIO Perfumes as its own workspace (owner 2026-11-26 17:38 CT: "THIS SHOULD ONLY BE VISIBLE FOR TIO
 * PERFUMES. AND HAVE OUR OWN MODULES AS PART OF THE APP"). When the app is on /perfume the left menu shows these modules
 * and nothing from the carriers; on any carrier page none of these show. Each module is a set of desk tabs.
 * The data stays walled (perfume schema, FORCE RLS owner-only) — this file only decides what the menu shows.
 */
import { BookOpen, Barcode, Boxes, CalendarDays, FileText, Landmark, Handshake, Mail, Send, ShoppingCart, Tags, Users } from "lucide-react";
import type { ComponentType } from "react";

export type PerfumeModuleId = "desk" | "mail" | "leads" | "campaigns" | "traders" | "shows" | "catalogs" | "sales" | "purchasing" | "items" | "inventory" | "books";
export type PerfumeModule = { id: PerfumeModuleId; label: string; Icon: ComponentType<{ className?: string }>; tabs: string[] };

export const PERFUME_MODULES: PerfumeModule[] = [
  { id: "desk", label: "Price desk", Icon: Tags, tabs: ["buy", "trade", "wholesale", "comp", "analysis", "all", "lists", "review", "rules"] },
  { id: "mail", label: "Mail lists", Icon: Mail, tabs: ["mail"] },
  { id: "leads", label: "Leads", Icon: Users, tabs: ["contacts", "vendors", "customers", "excel"] },
  { id: "campaigns", label: "Campaigns", Icon: Send, tabs: ["campaign", "sendlist"] },
  { id: "traders", label: "Traders", Icon: Handshake, tabs: ["traders"] },
  { id: "shows", label: "Trade shows", Icon: CalendarDays, tabs: ["shows"] },
  { id: "catalogs", label: "Catalogs", Icon: BookOpen, tabs: ["catalogs"] },
  // Owner 2026-11-26 18:13 CT: "we need quotations, and then historoy for quotations"; 19:12 CT: "sales order and purchase ordres
  // should already be created, i need my complete customer and vendors profile".
  { id: "sales", label: "Sales", Icon: FileText, tabs: ["quotes", "orders", "accounts", "levels", "pricelists"] },
  { id: "purchasing", label: "Purchasing", Icon: ShoppingCart, tabs: ["purchases", "suppliers"] },
  // Owner 2026-11-26 22:51 CT: "THE ITEM FILE FOR EACH ITEM … SO WE CAN EDIT … AND THE LINKAGE SCREEN THAT SHOWS THE ITEM UPC AND
  // LINKED TO AND DESCRIPTIONS TO ALL LINKED".
  { id: "items", label: "Items", Icon: Barcode, tabs: ["itemfile", "stocklink", "linkage", "items", "families"] },
  // Owner 2026-11-26 20:21 CT: "multiple inventories warehouses retail locations" — the ScentsX stock ledger.
  { id: "inventory", label: "Inventory", Icon: Boxes, tabs: ["stock", "reorder", "moves", "transfers", "counts", "writeoffs", "valuation", "sites"] },
  // Owner 2026-11-26 20:13 CT "Own company, same engine": ScentsX LLC's own books (chart, roles, balances).
  { id: "books", label: "Books", Icon: Landmark, tabs: ["books"] },
];

/** The module a desk tab belongs to (unknown / missing tab → the price desk). */
export function perfumeModuleOf(tab: string | null | undefined): PerfumeModule {
  return PERFUME_MODULES.find((m) => m.tabs.includes(tab ?? "")) ?? PERFUME_MODULES[0]!;
}

export const isPerfumePath = (pathname: string) => pathname === "/perfume" || pathname.startsWith("/perfume/");

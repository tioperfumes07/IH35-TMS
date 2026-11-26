/**
 * PERFUME-WORKSPACE — TIO Perfumes as its own workspace (owner 2026-11-26 17:38 CT: "THIS SHOULD ONLY BE VISIBLE FOR TIO
 * PERFUMES. AND HAVE OUR OWN MODULES AS PART OF THE APP"). When the app is on /perfume the left menu shows these modules
 * and nothing from the carriers; on any carrier page none of these show. Each module is a set of desk tabs.
 * The data stays walled (perfume schema, FORCE RLS owner-only) — this file only decides what the menu shows.
 */
import { CalendarDays, Handshake, Mail, Send, Tags, Users } from "lucide-react";
import type { ComponentType } from "react";

export type PerfumeModuleId = "desk" | "mail" | "leads" | "campaigns" | "traders" | "shows";
export type PerfumeModule = { id: PerfumeModuleId; label: string; Icon: ComponentType<{ className?: string }>; tabs: string[] };

export const PERFUME_MODULES: PerfumeModule[] = [
  { id: "desk", label: "Price desk", Icon: Tags, tabs: ["buy", "trade", "wholesale", "comp", "analysis", "all", "lists", "review", "rules"] },
  { id: "mail", label: "Mail lists", Icon: Mail, tabs: ["mail"] },
  { id: "leads", label: "Leads", Icon: Users, tabs: ["contacts"] },
  { id: "campaigns", label: "Campaigns", Icon: Send, tabs: ["campaign"] },
  { id: "traders", label: "Traders", Icon: Handshake, tabs: ["traders"] },
  { id: "shows", label: "Trade shows", Icon: CalendarDays, tabs: ["shows"] },
];

/** The module a desk tab belongs to (unknown / missing tab → the price desk). */
export function perfumeModuleOf(tab: string | null | undefined): PerfumeModule {
  return PERFUME_MODULES.find((m) => m.tabs.includes(tab ?? "")) ?? PERFUME_MODULES[0]!;
}

export const isPerfumePath = (pathname: string) => pathname === "/perfume" || pathname.startsWith("/perfume/");

/** PERFUME E3 salespeople (ROUND L.31 M18 E3): list / create / edit, assign customers (history kept), sales + commission by salesperson. */
import { apiRequest } from "./client";

export type PerfumeSalesperson = { id: string; name: string; commission_pct: number; active: boolean; notes: string | null; customers: number; created_at: string };
export type PerfumeRepRow = { salesperson_id: string | null; salesperson: string; commission_pct: number; customers: number; buying_customers: number;
  invoice_sales_cents: number; history_sales_cents: number; sales_cents: number; commission_cents: number };
export type PerfumeRepCustomer = { company_id: string; name: string; assigned_at: string | null; invoice_sales_cents: number; history_sales_cents: number; sales_cents: number };

export const listPerfumeSalespeople = () => apiRequest<{ salespeople: PerfumeSalesperson[] }>("/api/v1/perfume/salespeople");
export const createPerfumeSalesperson = (b: { name: string; commission_pct: number; notes?: string }) =>
  apiRequest<{ id: string }>("/api/v1/perfume/salespeople", { method: "POST", body: b });
export const updatePerfumeSalesperson = (id: string, b: { name?: string; commission_pct?: number; active?: boolean }) =>
  apiRequest<{ id: string }>(`/api/v1/perfume/salespeople/${encodeURIComponent(id)}`, { method: "PATCH", body: b });
export const assignPerfumeSalesperson = (b: { company_ids: string[]; salesperson_id: string | null; reason?: string }) =>
  apiRequest<{ changed: number; unchanged: number }>("/api/v1/perfume/salespeople/assign", { method: "POST", body: b });
export const getPerfumeSalesByRep = (from: string, to: string, currency: "USD" | "MXN") =>
  apiRequest<{ from: string; to: string; currency: string; attribution: string; totals: { sales_cents: number; commission_cents: number }; rows: PerfumeRepRow[] }>(
    `/api/v1/perfume/salespeople/report?from=${from}&to=${to}&currency=${currency}`);
export const getPerfumeRepCustomers = (salespersonId: string | null, from: string, to: string, currency: "USD" | "MXN") =>
  apiRequest<{ customers: PerfumeRepCustomer[] }>(
    `/api/v1/perfume/salespeople/report/customers?salesperson_id=${salespersonId ?? "unassigned"}&from=${from}&to=${to}&currency=${currency}`);

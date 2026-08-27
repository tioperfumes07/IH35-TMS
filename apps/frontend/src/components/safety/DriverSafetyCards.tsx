/**
 * SM3 — Safety Home Driver Cards
 *
 * A per-driver safety/compliance card board on the Safety landing (driver-files tab), above the DQF
 * table (additive — cards summarize, table details). Each card surfaces the six fields Jorge locked:
 *   1. Driver name           — listDrivers (mdata.drivers first_name / last_name)
 *   2. CDL expiry + countdown — listDrivers.cdl_expires_at
 *   3. Visa (foreign-status)  — listDrivers.visa_expires_at (+ visa_type; Mexican B1 drivers)
 *   4. DOT medical expiry     — listDrivers.dot_medical_expires_at
 *   5. Open incidents         — getSafetyEventsFiltered rollup by driver_id (is_active events in window)
 *   6. D&A pool status        — listDaEnrollments (GAP-81 safety.da_program_enrollments.is_active)
 *
 * Design references (best-in-class per SM3 research): Samsara / Motive expiring-credential countdowns
 * with a fixed 90/60/30/expired ladder; McLeod & Tenstreet DQ-file "standing at a glance"; FMCSA §391
 * DQ-file criticality (an expired CDL or medical card = cannot legally operate → top of the risk sort).
 *
 * Palette: §7 locked — navy/slate only; red (#dc2626) reserved here for critical-expiry (expired or
 * ≤14d) and open-incident emphasis. No amber/emerald/green/yellow status classes (§7 ratchet).
 *
 * The Safety layout's Activity-window + Status filter scope the safety-event rollup surfaced on each
 * card and drive the layout counter bar (real active/resolved/total EVENT counts for the window) —
 * fixing the previously orphaned control that showed a permanent "0 active · 0 resolved · 0 total".
 */

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listAllDrivers } from "../../api/mdata";
import { getSafetyEventsFiltered, listDaEnrollments } from "../../api/safety";
import type { SafetyActivityWindow, SafetyDriverFilter } from "./SafetyDashboardFilter";
import { Combobox } from "../Combobox";

type Props = {
  companyId: string;
  filter: SafetyDriverFilter;
  activityWindow: SafetyActivityWindow;
  /** Report window EVENT counts (active, total) to the shared layout counter bar. */
  onCountsChange: (active: number, total: number) => void;
  onOpenProfile?: (driverId: string) => void;
};

type CardSort = "risk" | "soonest" | "name";
type RiskFilter = "all" | "expiring30" | "expired" | "incidents" | "not_enrolled";

type DriverCard = {
  driverId: string;
  displayName: string;
  status: string;
  cdlExpiresAt: string | null;
  cdlDays: number | null;
  visaExpiresAt: string | null;
  visaDays: number | null;
  visaLabel: string;
  medicalExpiresAt: string | null;
  medicalDays: number | null;
  openIncidents: number;
  daEnrolled: boolean;
  daConsortium: string | null;
  soonestDays: number | null;
  riskScore: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const expiryUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const now = new Date();
  const nowUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((expiryUtc - nowUtc) / DAY_MS);
}

// FMCSA-weighted credential risk: an expired credential dominates, then the 14/30/60-day ladder.
function credentialWeight(days: number | null): number {
  if (days == null) return 0;
  if (days < 0) return 1000;
  if (days <= 14) return 500;
  if (days <= 30) return 200;
  if (days <= 60) return 50;
  return 0;
}

function soonestOf(...values: Array<number | null>): number | null {
  const present = values.filter((v): v is number => v != null);
  return present.length ? Math.min(...present) : null;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr.slice(0, 10);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

type CredSeverity = "critical" | "warn" | "soon" | "ok" | "none";

function credSeverity(days: number | null): CredSeverity {
  if (days == null) return "none";
  if (days < 0 || days <= 14) return "critical";
  if (days <= 30) return "warn";
  if (days <= 60) return "soon";
  return "ok";
}

// §7 palette only: red for critical-expiry, slate weights for everything else (no amber/emerald).
function countdownChipClass(sev: CredSeverity): string {
  if (sev === "critical") return "bg-red-50 text-red-700 border-red-200";
  if (sev === "warn") return "bg-slate-100 text-slate-800 border-slate-300 font-semibold";
  if (sev === "soon") return "bg-slate-50 text-slate-600 border-slate-200";
  if (sev === "ok") return "bg-slate-50 text-slate-500 border-slate-100";
  return "bg-white text-slate-400 border-slate-100";
}

function countdownText(days: number | null): string {
  if (days == null) return "Not on file";
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return `${days}d left`;
}

function CredentialRow({ label, expiresAt, days }: { label: string; expiresAt: string | null; days: number | null }) {
  const sev = credSeverity(days);
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[11px]">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-slate-700">{fmtDate(expiresAt)}</span>
        <span className={`shrink-0 rounded-sm border px-1.5 py-0.5 leading-none ${countdownChipClass(sev)}`}>
          {countdownText(days)}
        </span>
      </span>
    </div>
  );
}

export function DriverSafetyCards({ companyId, filter, activityWindow, onCountsChange, onOpenProfile }: Props) {
  const [sort, setSort] = useState<CardSort>("risk");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  // This is a company-wide compliance summary, not a picker. Server search remains useful, but the
  // unfiltered view must page through the complete active roster before calculating risk totals.
  const [rosterSearch, setRosterSearch] = useState("");

  const driversQ = useQuery({
    queryKey: ["safety-cards", "drivers", companyId, rosterSearch],
    enabled: Boolean(companyId),
    queryFn: () =>
      listAllDrivers({
        operating_company_id: companyId,
        status: "Active",
        search: rosterSearch || undefined,
      }),
  });

  const eventsQ = useQuery({
    queryKey: ["safety-cards", "events", companyId, filter, activityWindow],
    enabled: Boolean(companyId),
    queryFn: () => getSafetyEventsFiltered(companyId, filter, activityWindow),
  });

  const enrollmentsQ = useQuery({
    queryKey: ["safety-cards", "da-enrollments", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listDaEnrollments(companyId),
  });

  // Feed the shared Safety layout counter bar with REAL window event counts (active, total). The bar
  // derives resolved = total − active. This is the fix for the orphaned filter/counter control.
  const counters = eventsQ.data?.counters;
  useEffect(() => {
    if (!counters) return;
    onCountsChange(Number(counters.active_count ?? 0), Number(counters.total_count ?? 0));
  }, [counters, onCountsChange]);

  // Per-driver open-incident rollup: count is_active safety events in the current window by driver.
  const openIncidentsByDriver = useMemo(() => {
    const map = new Map<string, number>();
    for (const raw of eventsQ.data?.events ?? []) {
      const ev = raw as Record<string, unknown>;
      const driverId = typeof ev.driver_id === "string" ? ev.driver_id : null;
      if (!driverId) continue;
      const isActive = ev.is_active === true || ev.is_active === "true";
      if (!isActive) continue;
      map.set(driverId, (map.get(driverId) ?? 0) + 1);
    }
    return map;
  }, [eventsQ.data?.events]);

  const enrolledDriverIds = useMemo(() => {
    const set = new Set<string>();
    for (const e of enrollmentsQ.data?.enrollments ?? []) {
      if (e.is_active) set.add(e.driver_uuid);
    }
    return set;
  }, [enrollmentsQ.data?.enrollments]);

  const enrolledConsortiumByDriver = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of enrollmentsQ.data?.enrollments ?? []) {
      if (e.is_active && !map.has(e.driver_uuid)) map.set(e.driver_uuid, e.consortium_name);
    }
    return map;
  }, [enrollmentsQ.data?.enrollments]);

  const cards = useMemo<DriverCard[]>(() => {
    const roster = driversQ.data?.drivers ?? [];
    const built = roster.map((d): DriverCard => {
      const first = (d.first_name ?? "").trim();
      const last = (d.last_name ?? "").trim();
      const displayName = [last, first].filter(Boolean).join(", ") || "Unnamed driver";
      const cdlDays = daysUntil(d.cdl_expires_at);
      const visaDays = daysUntil(d.visa_expires_at);
      const medicalDays = daysUntil(d.dot_medical_expires_at);
      const openIncidents = openIncidentsByDriver.get(d.id) ?? 0;
      const daEnrolled = enrolledDriverIds.has(d.id);
      let riskScore =
        credentialWeight(cdlDays) + credentialWeight(visaDays) + credentialWeight(medicalDays) + openIncidents * 300;
      if (!daEnrolled) riskScore += 150;
      return {
        driverId: d.id,
        displayName,
        status: String(d.status ?? ""),
        cdlExpiresAt: d.cdl_expires_at,
        cdlDays,
        visaExpiresAt: d.visa_expires_at,
        visaDays,
        visaLabel: d.visa_type ? `Visa (${d.visa_type})` : "Visa",
        medicalExpiresAt: d.dot_medical_expires_at,
        medicalDays,
        openIncidents,
        daEnrolled,
        daConsortium: enrolledConsortiumByDriver.get(d.id) ?? null,
        soonestDays: soonestOf(cdlDays, visaDays, medicalDays),
        riskScore,
      };
    });

    const filtered = built.filter((c) => {
      if (riskFilter === "all") return true;
      if (riskFilter === "expiring30") return c.soonestDays != null && c.soonestDays >= 0 && c.soonestDays <= 30;
      if (riskFilter === "expired") return c.soonestDays != null && c.soonestDays < 0;
      if (riskFilter === "incidents") return c.openIncidents > 0;
      if (riskFilter === "not_enrolled") return !c.daEnrolled;
      return true;
    });

    filtered.sort((a, b) => {
      if (sort === "name") return a.displayName.localeCompare(b.displayName);
      if (sort === "soonest") {
        const as = a.soonestDays ?? Number.POSITIVE_INFINITY;
        const bs = b.soonestDays ?? Number.POSITIVE_INFINITY;
        if (as !== bs) return as - bs;
        return a.displayName.localeCompare(b.displayName);
      }
      // risk (default): most at risk first, then soonest expiring, then name
      if (b.riskScore !== a.riskScore) return b.riskScore - a.riskScore;
      const asr = a.soonestDays ?? Number.POSITIVE_INFINITY;
      const bsr = b.soonestDays ?? Number.POSITIVE_INFINITY;
      if (asr !== bsr) return asr - bsr;
      return a.displayName.localeCompare(b.displayName);
    });

    return filtered;
  }, [driversQ.data?.drivers, openIncidentsByDriver, enrolledDriverIds, enrolledConsortiumByDriver, riskFilter, sort]);

  const summary = useMemo(() => {
    const roster = driversQ.data?.drivers ?? [];
    let expiring = 0;
    let expired = 0;
    let incidents = 0;
    let notEnrolled = 0;
    for (const d of roster) {
      const soon = soonestOf(daysUntil(d.cdl_expires_at), daysUntil(d.visa_expires_at), daysUntil(d.dot_medical_expires_at));
      if (soon != null && soon < 0) expired += 1;
      else if (soon != null && soon <= 30) expiring += 1;
      if ((openIncidentsByDriver.get(d.id) ?? 0) > 0) incidents += 1;
      if (!enrolledDriverIds.has(d.id)) notEnrolled += 1;
    }
    return { total: roster.length, expiring, expired, incidents, notEnrolled };
  }, [driversQ.data?.drivers, openIncidentsByDriver, enrolledDriverIds]);

  const loading = driversQ.isLoading || eventsQ.isLoading;
  const enrollmentsUnavailable = enrollmentsQ.isError;

  const sortOptions: Array<{ id: CardSort; label: string }> = [
    { id: "risk", label: "Most at risk" },
    { id: "soonest", label: "Soonest expiring" },
    { id: "name", label: "Name" },
  ];
  const riskChips: Array<{ id: RiskFilter; label: string; count?: number }> = [
    { id: "all", label: "All", count: summary.total },
    { id: "expiring30", label: "Expiring ≤30d", count: summary.expiring },
    { id: "expired", label: "Expired", count: summary.expired },
    { id: "incidents", label: "Open incidents", count: summary.incidents },
    { id: "not_enrolled", label: "Not in D&A pool", count: summary.notEnrolled },
  ];

  return (
    <section className="mb-4" aria-label="Driver safety cards" data-testid="driver-safety-cards">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Driver Safety Cards</h3>
          <p className="text-[11px] text-slate-500">
            Credential standing at a glance — CDL, visa, DOT medical, open incidents, D&amp;A pool.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[11px] text-slate-500">
            Find driver
            <input
              type="search"
              value={rosterSearch}
              onChange={(e) => setRosterSearch(e.target.value)}
              placeholder="Name…"
              data-testid="driver-cards-search"
              className="w-40 rounded-sm border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-700"
            />
          </label>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
            <label htmlFor="driver-cards-sort">Sort</label>
            <Combobox
              id="driver-cards-sort"
              dataTestId="driver-cards-sort"
              value={sort}
              options={sortOptions.map((option) => ({ value: option.id, label: option.label }))}
              onChange={(next) => setSort(next as CardSort)}
              className="min-w-40"
            />
          </div>
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {riskChips.map((chip) => {
          const active = riskFilter === chip.id;
          const emphasize = (chip.id === "expired" || chip.id === "incidents") && (chip.count ?? 0) > 0;
          return (
            <button
              key={chip.id}
              type="button"
              data-testid={`driver-cards-chip-${chip.id}`}
              onClick={() => setRiskFilter(chip.id)}
              className={`rounded-full border px-2.5 py-0.5 text-[11px] ${
                active
                  ? "border-[#1f2a44] bg-[#1f2a44] text-white"
                  : emphasize
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {chip.label}
              {chip.count != null ? <span className="ml-1 opacity-70">{chip.count}</span> : null}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="rounded-sm border border-slate-200 bg-white px-3 py-8 text-center text-[11px] text-slate-500">
          Loading driver safety cards…
        </div>
      ) : cards.length === 0 ? (
        <div className="rounded-sm border border-slate-200 bg-white px-3 py-8 text-center text-[11px] text-slate-500">
          No drivers match this filter.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {cards.map((card) => {
            const critical = card.soonestDays != null && card.soonestDays <= 14;
            return (
              <button
                key={card.driverId}
                type="button"
                data-testid={`driver-card-${card.driverId}`}
                onClick={() => onOpenProfile?.(card.driverId)}
                className={`flex flex-col rounded-sm border bg-white p-3 text-left transition-colors hover:border-slate-400 ${
                  critical ? "border-l-2 border-l-red-500 border-slate-200" : "border-slate-200"
                }`}
              >
                <div className="mb-1.5 flex items-start justify-between gap-2">
                  <span className="min-w-0 truncate text-[13px] font-semibold text-slate-900">{card.displayName}</span>
                  <span className="shrink-0 rounded-sm border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-500">
                    {card.status || "—"}
                  </span>
                </div>

                <div className="border-t border-slate-100 pt-1">
                  <CredentialRow label="CDL" expiresAt={card.cdlExpiresAt} days={card.cdlDays} />
                  <CredentialRow label={card.visaLabel} expiresAt={card.visaExpiresAt} days={card.visaDays} />
                  <CredentialRow label="DOT medical" expiresAt={card.medicalExpiresAt} days={card.medicalDays} />
                </div>

                <div className="mt-1.5 flex items-center justify-between border-t border-slate-100 pt-1.5 text-[11px]">
                  <span className="text-slate-500">
                    Open incidents{" "}
                    <span className={card.openIncidents > 0 ? "font-semibold text-red-700" : "text-slate-700"}>
                      {card.openIncidents}
                    </span>
                  </span>
                  <span
                    className={
                      enrollmentsUnavailable
                        ? "text-slate-400"
                        : card.daEnrolled
                          ? "text-slate-600"
                          : "font-semibold text-red-700"
                    }
                    title={card.daConsortium ?? undefined}
                  >
                    {enrollmentsUnavailable ? "D&A: not tracked" : card.daEnrolled ? "D&A: in pool" : "D&A: not enrolled"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

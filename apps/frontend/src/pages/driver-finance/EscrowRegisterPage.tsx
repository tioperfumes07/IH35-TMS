/**
 * ROUND 443.254 N5 — Driver Escrow Register (V3-Settlements-EscrowRegister).
 * Dated lines · source settlement/JE · running balance. Not the driver profile.
 *
 * ROUND 443.250 — V3 KPI strip (Driver / Held / Target / Release) via V3KpiTile.
 * Engine unchanged: getEscrowDriverBalances + getEscrowDriverTimeline.
 */
import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom"; // Link: register source → settlement/JE
import { useQuery } from "@tanstack/react-query";
import { getEscrowDriverBalances, getEscrowDriverTimeline } from "../../api/banking";
import { getDriverEscrowTarget } from "../../api/driverFinance";
import { Button } from "../../components/Button";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityLink } from "../../components/shared/EntityLink";
import { MoneyCell } from "../../components/shared/MoneyCell";
import { entityLabel } from "../../lib/entity-label";
import { useTranslation } from "react-i18next";
import { formatDisplayName } from "../../components/v3/formatDisplayName";
import { BoardSection } from "../../components/v3/BoardSection";
import { V3KpiTile } from "../../components/v3/V3KpiTile";
import { formatUsd, formatUsdCents, formatUsdTable, formatQuantityTable } from "../../lib/money";
import { formatCalendarDateUS, formatDateUS } from "../../lib/formatDate";
import { addDaysIso, companyToday } from "../../lib/businessDate";
import { SettlementsModuleShell } from "./SettlementsModuleShell";
import { V3 } from "../../design/v3-tokens";

/** Owner board Settlements-EscrowRegister.dc.html — policy chrome, not a new engine. */
const ESCROW_RELEASE_WINDOW_DAYS = 60;

type RegisterRow = {
  id: string;
  /** ACCT-F11093: the movement's document date (YYYY-MM-DD), never the day it was keyed. */
  date: string;
  /** ACCT-F11093: escrow is per load — the load this row moved for (null only for a non-load movement). */
  loadId: string | null;
  loadNumber: string | null;
  source: string;
  /** Prefer EntityLink via settlementId / journalEntryId; href kept for unknown sources. */
  sourceHref: string | null;
  settlementId: string | null;
  journalEntryId: string | null;
  type: string;
  inAmt: number | null;
  outAmt: number | null;
  balance: number;
};

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** Client CSV of the register lines on screen (fill-not-shell — Export was a dead button). */
function exportEscrowRegisterCsv(driverName: string, rows: RegisterRow[]): void {
  const header = ["Date", "Load", "Source", "Type", "In", "Out", "Balance"].map(csvEscape).join(",");
  const body = rows
    .map((r) =>
      [
        formatCalendarDateUS(r.date) || "",
        r.loadNumber ?? "",
        r.source,
        r.type,
        r.inAmt == null ? "" : formatUsd(r.inAmt),
        r.outAmt == null ? "" : formatUsd(r.outAmt),
        formatUsd(r.balance),
      ]
        .map((v) => csvEscape(String(v)))
        .join(","),
    )
    .join("\n");
  const slug = driverName.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "driver";
  const blob = new Blob([`${header}\n${body}\n`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `escrow-register-${slug}-${companyToday()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function labelType(raw: string | null): string {
  const t = String(raw ?? "").toLowerCase();
  if (t === "deposit") return "Deduction";
  if (t === "release") return "Release";
  if (t === "adjustment") return "Adjustment";
  if (t === "forfeiture") return "Forfeiture";
  if (t === "opening" || t.includes("open")) return "Opening";
  if (!t) return "—";
  return t.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function EscrowRegisterPage() {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const { driverId = "" } = useParams<{ driverId: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const releaseEscrowHref = `/accounting/escrow?holder_id=${encodeURIComponent(driverId)}`;

  const balQ = useQuery({
    queryKey: ["escrow-register-bal", companyId, driverId],
    queryFn: () => getEscrowDriverBalances(companyId),
    enabled: Boolean(companyId && driverId),
  });
  const tlQ = useQuery({
    queryKey: ["escrow-register-tl", companyId, driverId],
    queryFn: () => getEscrowDriverTimeline(companyId, driverId),
    enabled: Boolean(companyId && driverId),
  });

  const driver = (balQ.data?.drivers ?? []).find((d) => d.driver_id === driverId);
  const driverName = formatDisplayName(driver?.driver_name ?? "Driver");
  const held = Number(driver?.escrow_balance ?? 0);
  const heldCents = Math.round(held * 100);
  const heldDisplay = balQ.isError ? "—" : formatUsdTable(held);

  const targetQ = useQuery({
    queryKey: ["escrow-register-target", companyId, driverId, heldCents],
    queryFn: () => getDriverEscrowTarget(driverId, companyId, heldCents),
    enabled: Boolean(companyId && driverId && !balQ.isError),
  });

  const lastSettlementAt = useMemo(() => {
    const timeline = tlQ.data?.timeline ?? [];
    let max = "";
    for (const t of timeline) {
      if (!t.settlement_id) continue;
      const at = String(t.created_at ?? "");
      if (at && at.localeCompare(max) > 0) max = at;
    }
    return max || null;
  }, [tlQ.data?.timeline]);

  const releaseEligibleDate = useMemo(() => {
    if (!lastSettlementAt) return null;
    const isoDay = lastSettlementAt.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDay)) return null;
    return addDaysIso(isoDay, ESCROW_RELEASE_WINDOW_DAYS);
  }, [lastSettlementAt]);

  const targetDisplay = useMemo(() => {
    if (targetQ.isError || balQ.isError) return "—";
    if (targetQ.isPending) return "—";
    const cents = targetQ.data?.escrow_target_cents;
    if (cents == null) return "—";
    return formatUsdCents(cents);
  }, [targetQ.isError, targetQ.isPending, targetQ.data?.escrow_target_cents, balQ.isError]);

  const releaseDisplay = useMemo(() => {
    if (tlQ.isError || balQ.isError) return "—";
    if (!releaseEligibleDate) return "—";
    return formatDateUS(releaseEligibleDate) || "—";
  }, [tlQ.isError, balQ.isError, releaseEligibleDate]);

  const rows: RegisterRow[] = useMemo(() => {
    // Design N2 (Settlements-EscrowRegister.dc.html): first line is "Opening balance (historical)"
    // so running balance ties to Held = opening + signed timeline activity.
    // ACCT-F11093: the register runs in DOCUMENT-date order (settlement period end / JE date), keyed-at time breaks ties.
    const docDate = (t: { document_date?: string | null; journal_entry_date?: string | null; created_at: string }) =>
      String(t.document_date ?? t.journal_entry_date ?? t.created_at ?? "").slice(0, 10);
    const timeline = [...(tlQ.data?.timeline ?? [])].sort(
      (a, b) =>
        docDate(a).localeCompare(docDate(b)) ||
        String(a.created_at).localeCompare(String(b.created_at)) ||
        String(a.load_number ?? "").localeCompare(String(b.load_number ?? "")),
    );
    let activityNet = 0;
    for (const t of timeline) {
      const amt = Number(t.amount ?? 0);
      const typ = String(t.entry_type ?? "").toLowerCase();
      const isOut = typ === "release" || typ === "forfeiture" || amt < 0;
      const abs = Math.abs(amt);
      activityNet += isOut ? -abs : abs;
    }
    const openingAmt = Number.isFinite(held) ? held - activityNet : 0;
    let run = openingAmt;
    const openingDate = timeline[0] ? docDate(timeline[0]) : "";
    const built: RegisterRow[] = [
      {
        id: `opening-balance-${driverId || "driver"}`,
        date: openingDate,
        loadId: null,
        loadNumber: null,
        source: "Opening balance (historical)",
        sourceHref: null,
        settlementId: null,
        journalEntryId: null,
        type: "Opening",
        inAmt: openingAmt >= 0 ? openingAmt : null,
        outAmt: openingAmt < 0 ? Math.abs(openingAmt) : null,
        balance: run,
      },
    ];
    for (const t of timeline) {
      const amt = Number(t.amount ?? 0);
      const typ = String(t.entry_type ?? "").toLowerCase();
      const isOut = typ === "release" || typ === "forfeiture" || amt < 0;
      const abs = Math.abs(amt);
      run += isOut ? -abs : abs;
      // A uuid fragment is never a label (verify-no-uuid-label-rendering): the source names its kind + date; EntityLink
      // opens the exact settlement / journal entry.
      // ACCT-F11093 (row 22): the load has its own linked column; the source names the document it came from + its date.
      const rowDate = docDate(t);
      const settLabel = t.settlement_id
        ? `Settlement · ${formatCalendarDateUS(rowDate) || "posted"}`
        : t.journal_entry_id
          ? `Journal · ${formatCalendarDateUS(rowDate) || "entry"}`
          : t.memo || "Escrow entry";
      built.push({
        id: t.id,
        date: rowDate,
        loadId: t.load_id ?? null,
        loadNumber: t.load_id ? (t.load_number ?? null) : null,
        source: settLabel,
        sourceHref: t.settlement_id
          ? `/driver-finance/settlements?settlement_id=${encodeURIComponent(t.settlement_id)}`
          : t.journal_entry_id
            ? `/accounting/journal-entries/${encodeURIComponent(t.journal_entry_id)}`
            : null,
        settlementId: t.settlement_id ?? null,
        journalEntryId: t.journal_entry_id ?? null,
        type: labelType(t.entry_type),
        inAmt: isOut ? null : abs,
        outAmt: isOut ? abs : null,
        balance: run,
      });
    }
    return built.reverse();
  }, [tlQ.data?.timeline, held, driverId]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.source.toLowerCase().includes(q) ||
        r.type.toLowerCase().includes(q) ||
        (r.loadNumber ?? "").toLowerCase().includes(q) ||
        (formatCalendarDateUS(r.date) ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  const columns = useMemo<ParityColumn<RegisterRow>[]>(
    () => [
      {
        key: "date",
        label: "Date",
        sortable: true,
        sortValue: (r) => r.date,
        render: (r) => formatCalendarDateUS(r.date) || "—",
      },
      {
        key: "load",
        label: "Load",
        sortable: true,
        sortValue: (r) => r.loadNumber ?? "",
        render: (r) =>
          r.loadId ? (
            <EntityLink
              kind="load"
              id={r.loadId}
              label={entityLabel(r.loadNumber, r.loadId, "Load")}
              className="font-semibold underline"
              data-testid="escrow-register-load-link"
            />
          ) : (
            ""
          ),
      },
      {
        key: "source",
        label: "Source",
        sortable: true,
        sortValue: (r) => r.source,
        render: (r) => {
          if (r.settlementId) {
            return (
              <EntityLink
                kind="settlement"
                id={r.settlementId}
                label={r.source}
                className="font-semibold underline"
                data-testid="escrow-register-settlement-link"
              />
            );
          }
          if (r.journalEntryId) {
            return (
              <EntityLink
                kind="journal_entry"
                id={r.journalEntryId}
                label={r.source}
                className="font-semibold underline"
                data-testid="escrow-register-je-link"
              />
            );
          }
          if (r.sourceHref) {
            return (
              <Link to={r.sourceHref} className="underline" style={{ color: V3.link }}>
                {r.source}
              </Link>
            );
          }
          return r.source;
        },
      },
      { key: "type", label: "Type", sortable: true },
      {
        key: "inAmt",
        label: "In",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.inAmt ?? 0,
        render: (r) => {
          if (r.inAmt == null) return "";
          const cents = Math.round(r.inAmt * 100);
          const format = (c: number) => formatUsdTable(c / 100).replace(/^\$/, "");
          if (r.settlementId) {
            return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "settlement", id: r.settlementId } }} />;
          }
          if (r.journalEntryId) {
            return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "journal_entry", id: r.journalEntryId } }} />;
          }
          if (r.loadId) {
            return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "load", id: r.loadId } }} />;
          }
          return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "driver", id: driverId } }} />;
        },
      },
      {
        key: "outAmt",
        label: "Out",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.outAmt ?? 0,
        render: (r) => {
          if (r.outAmt == null) return "";
          const cents = Math.round(r.outAmt * 100);
          const format = (c: number) => formatUsdTable(c / 100).replace(/^\$/, "");
          if (r.settlementId) {
            return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "settlement", id: r.settlementId } }} />;
          }
          if (r.journalEntryId) {
            return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "journal_entry", id: r.journalEntryId } }} />;
          }
          if (r.loadId) {
            return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "load", id: r.loadId } }} />;
          }
          return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "driver", id: driverId } }} />;
        },
      },
      {
        key: "balance",
        label: "Balance",
        sortable: true,
        className: "text-right",
        cellClass: "text-right tabular-nums",
        sortValue: (r) => r.balance,
        render: (r) => {
          const cents = Math.round(r.balance * 100);
          const format = (c: number) => formatUsdTable(c / 100).replace(/^\$/, "");
          if (r.settlementId) {
            return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "settlement", id: r.settlementId } }} />;
          }
          if (r.journalEntryId) {
            return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "journal_entry", id: r.journalEntryId } }} />;
          }
          if (r.loadId) {
            return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "load", id: r.loadId } }} />;
          }
          return <MoneyCell cents={cents} format={format} drill={{ entity: { kind: "driver", id: driverId } }} />;
        },
      },
    ],
    [driverId],
  );

  if (!companyId) {
    return (
      <SettlementsModuleShell showBack backLabel="Escrow" backTo="/driver-finance/escrow">
        <div className="space-y-3 px-1" data-testid="escrow-register-page">
          <BoardSection title="Escrow register" testId="escrow-register-need-company">
            <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>
          </BoardSection>
        </div>
      </SettlementsModuleShell>
    );
  }

  return (
    <SettlementsModuleShell showBack backLabel="Escrow" backTo="/driver-finance/escrow">
      <div
        className="space-y-3 px-1"
        data-testid="escrow-register-page"
        data-settlements-escrow-register-rebuild="1"
      >
        <MoneyListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search load · source · type · date…"
          searchTestId="escrow-register-search"
          onClearAll={() => setSearch("")}
          activeFilterCount={search.trim() ? 1 : 0}
        >
          <Button
            size="sm"
            data-testid="settlements-escrow-register-creator"
            onClick={() => navigate("/driver-finance/settlements?creator=1")}
          >
            + Settlement Creator
          </Button>
          <Button
            size="sm"
            variant="secondary"
            type="button"
            data-testid="escrow-register-export"
            disabled={tlQ.isError || filteredRows.length === 0}
            onClick={() => exportEscrowRegisterCsv(driverName, filteredRows)}
          >
            Export
          </Button>
          <Button
            size="sm"
            type="button"
            data-testid="escrow-register-release"
            onClick={() => navigate(releaseEscrowHref)}
          >
            Release escrow
          </Button>
        </MoneyListToolbar>

        {/* Record-naming law: the driver this register belongs to opens the driver record. */}
        <p className="text-xs text-[#4B5563]" data-testid="escrow-register-driver">
          {t("drivers.driver_label")}: <EntityLink kind="driver" id={driverId} label={driverName} data-testid="escrow-register-driver-link" />
        </p>

        {/* ROUND 443.282 — Target from getDriverEscrowTarget; Release = last settlement + window. */}
        <div
          style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 8 }}
          data-testid="escrow-register-kpi-strip"
          data-escrow-register-v3-kpis="1"
        >
          <V3KpiTile
            label="Driver"
            value={balQ.isError ? "—" : driverName}
            sub="active bond"
            testId="escrow-register-kpi-driver"
          />
          <V3KpiTile
            label="Held"
            value={heldDisplay}
            sub="current escrow balance"
            testId="escrow-register-kpi-held"
          />
          <V3KpiTile
            label="Target"
            value={targetDisplay}
            sub="per pay-rate template"
            testId="escrow-register-kpi-target"
          />
          <V3KpiTile
            label="Release"
            value={releaseDisplay}
            sub={`${formatQuantityTable(ESCROW_RELEASE_WINDOW_DAYS, 0)} days after last settlement`}
            testId="escrow-register-kpi-release"
          />
        </div>
        {tlQ.isError ? (
          <ListErrorState
            title="Couldn't load escrow register"
            status={0}
            message={(tlQ.error as Error)?.message}
            onRetry={() => void tlQ.refetch()}
          />
        ) : (
          <BoardSection
            title={`Escrow register — ${driverName}`}
            onViewAll={() => navigate("/accounting/escrow")}
            testId="escrow-register-board-section"
            footer="Each line opens its settlement or journal entry."
          >
            <ParityTable<RegisterRow> appearance="board"
              title={`Escrow register — ${driverName}`}
              columns={columns}
              rows={filteredRows}
              suppressToolbarSearch
              rowKey={(r) => r.id}
              loading={tlQ.isLoading || balQ.isLoading}
              emptyText="No escrow lines for this driver."
              storageKey={`settlements-escrow-register-${driverId}`}
              serverViewKey={`settlements-escrow-register-${driverId}`}
              tableTestId="escrow-register-table"
              gearButtonTestId="escrow-register-column-gear"
            />
          </BoardSection>
        )}
      </div>
    </SettlementsModuleShell>
  );
}

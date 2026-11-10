import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  getCapacity,
  getCapacityPreview,
  setUnitOffer,
  updateCapacitySettings,
  type CapacityRow,
  type CapacitySource,
} from "../../api/dispatch-capacity";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ParityDrawer } from "../../components/parity/ParityDrawer";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { OverrideButton } from "../../components/override/OverrideButton";
import { EntityLink } from "../../components/shared/EntityLink";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateTimeUS } from "../../lib/formatDate";

/**
 * CAPACITY ENGINE (spec 11-10) — Dispatch › Available Trucks: where and when every in-service truck is free, from the
 * last load in its chain (final stop) or its GPS position, and whether it is offered to customers / load boards.
 * Unknown values show "—" with the reason; a truck with a reason is never offered.
 */
const SOURCE_LABEL: Record<CapacitySource, string> = {
  actual: "Actual departure",
  appointment: "Appointment",
  scheduled: "Scheduled",
  gps: "GPS (no open load)",
};

type SortKey = "unit_number" | "driver_name" | "equipment" | "available_city" | "available_at" | "source" | "last_load_number" | "offer_enabled";

function sortRows(rows: CapacityRow[], key: SortKey, dir: "asc" | "desc"): CapacityRow[] {
  const val = (r: CapacityRow): string | number => {
    if (key === "available_at") return r.available_at ? new Date(r.available_at).getTime() : Number.MAX_SAFE_INTEGER;
    if (key === "offer_enabled") return r.offerable ? 0 : r.offer_enabled ? 1 : 2;
    if (key === "available_city") return `${r.available_state ?? "~"}|${r.available_city ?? "~"}`;
    return String(r[key] ?? "~");
  };
  const out = [...rows].sort((a, b) => {
    const x = val(a);
    const y = val(b);
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true });
    return c || a.unit_number.localeCompare(b.unit_number, undefined, { numeric: true });
  });
  return dir === "asc" ? out : out.reverse();
}

export function AvailableTrucksPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { user } = useAuth();
  const qc = useQueryClient();
  const [sortKey, setSortKey] = useState<SortKey>("available_at");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [unitFilter, setUnitFilter] = useState<string[]>([]);
  const [equipFilter, setEquipFilter] = useState<string[]>([]);
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [offerFilter, setOfferFilter] = useState<string[]>([]);
  const [previewKind, setPreviewKind] = useState<"morning" | "change" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const capQ = useQuery({
    queryKey: ["dispatch", "capacity", companyId],
    queryFn: () => getCapacity(companyId),
    enabled: Boolean(companyId),
  });
  const previewQ = useQuery({
    queryKey: ["dispatch", "capacity", "preview", companyId, previewKind],
    queryFn: () => getCapacityPreview(companyId, previewKind ?? "morning"),
    enabled: Boolean(companyId && previewKind),
  });

  const offerM = useMutation({
    mutationFn: (args: { unitId: string; enabled: boolean; reasonCode: string | null }) =>
      setUnitOffer(companyId, args.unitId, args.enabled, args.reasonCode),
    onSuccess: () => { setActionError(null); void qc.invalidateQueries({ queryKey: ["dispatch", "capacity", companyId] }); },
    onError: (e: unknown) => setActionError(e instanceof Error ? e.message : "Could not change the offer."),
  });
  const switchM = useMutation({
    mutationFn: (on: boolean) => updateCapacitySettings(companyId, { send_truck_offers: on }),
    onSuccess: () => { setActionError(null); void qc.invalidateQueries({ queryKey: ["dispatch", "capacity", companyId] }); },
    onError: (e: unknown) => setActionError(e instanceof Error ? e.message : "Could not change the switch."),
  });

  const rows = capQ.data?.rows ?? [];
  const options = useMemo(() => {
    const uniq = (xs: Array<string | null>) => [...new Set(xs.filter((x): x is string => Boolean(x)))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return {
      units: uniq(rows.map((r) => r.unit_number)).map((v) => ({ value: v, label: v })),
      equipment: uniq(rows.map((r) => r.equipment)).map((v) => ({ value: v, label: v })),
      states: uniq(rows.map((r) => r.available_state)).map((v) => ({ value: v, label: v })),
    };
  }, [rows]);

  const visible = useMemo(() => {
    const filtered = rows.filter((r) =>
      (unitFilter.length === 0 || unitFilter.includes(r.unit_number)) &&
      (equipFilter.length === 0 || (r.equipment != null && equipFilter.includes(r.equipment))) &&
      (stateFilter.length === 0 || (r.available_state != null && stateFilter.includes(r.available_state))) &&
      (offerFilter.length === 0 ||
        (offerFilter.includes("offered") && r.offerable) ||
        (offerFilter.includes("off") && !r.offer_enabled) ||
        (offerFilter.includes("unknown") && r.offer_enabled && !r.offerable))
    );
    return sortRows(filtered, sortKey, sortDir);
  }, [rows, unitFilter, equipFilter, stateFilter, offerFilter, sortKey, sortDir]);

  if (!companyId) {
    return <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company.</p>;
  }

  const settings = capQ.data?.settings;
  const isOwner = user?.role === "Owner";

  const columns: Array<ParityColumn<CapacityRow>> = [
    {
      key: "unit_number",
      label: "Unit",
      sortable: true,
      className: "font-medium",
      render: (r) => <EntityLink kind="unit" id={r.unit_id} label={r.unit_number} data-testid={`capacity-unit-${r.unit_number}`} />,
    },
    { key: "driver_name", label: "Driver", sortable: true, render: (r) => r.driver_name ?? <span className="text-[#6B7280]">—</span> },
    {
      key: "equipment",
      label: "Equipment",
      sortable: true,
      render: (r) => r.equipment
        ? <span title={r.equipment_source === "next_load" ? "From the booked load" : "From the truck's last load"}>{r.equipment}</span>
        : <span className="text-[#6B7280]">—</span>,
    },
    {
      key: "available_city",
      label: "Available in",
      sortable: true,
      render: (r) => r.available_city && r.available_state ? `${r.available_city}, ${r.available_state}` : <span className="text-[#6B7280]">—</span>,
    },
    {
      key: "available_at",
      label: "Available at",
      sortable: true,
      render: (r) => r.available_at ? formatDateTimeUS(r.available_at) || "—" : <span className="text-[#6B7280]">—</span>,
    },
    {
      key: "source",
      label: "Source",
      sortable: true,
      render: (r) => (
        <span>
          {r.source ? SOURCE_LABEL[r.source] : "—"}
          {r.reason ? <span className="ml-1 block text-xs text-[#B45309]" data-testid={`capacity-reason-${r.unit_number}`}>{r.reason}</span> : null}
        </span>
      ),
    },
    {
      key: "last_load_number",
      label: "Booked next",
      sortable: true,
      render: (r) => r.last_load_id
        ? (
          <span>
            <EntityLink kind="load" id={r.last_load_id} label={r.last_load_number ?? "Load"} />
            {r.open_load_count > 1 ? <span className="ml-1 text-xs text-[#6B7280]">({r.open_load_count} open loads — last one shown)</span> : null}
          </span>
        )
        : <span className="text-[#6B7280]">None</span>,
    },
    {
      key: "offer_enabled",
      label: "Offer",
      sortable: true,
      render: (r) => (
        <div className="flex items-center gap-2" data-testid={`capacity-offer-${r.unit_number}`}>
          {r.offer_enabled
            ? <span className={r.offerable ? "text-[#047857]" : "text-[#6B7280]"}>{r.offerable ? "On" : "On (not offered — see reason)"}</span>
            : <span className="text-[#B91C1C]">Off{r.off_reason_code ? ` · ${r.off_reason_code}` : ""}</span>}
          {r.offer_enabled ? (
            <OverrideButton
              context="dispatch"
              label="Turn off"
              size="sm"
              testId={`capacity-offer-off-${r.unit_number}`}
              disabled={offerM.isPending}
              onConfirm={(reasonCode) => offerM.mutateAsync({ unitId: r.unit_id, enabled: false, reasonCode }).then(() => undefined)}
            />
          ) : (
            <button
              type="button"
              className="rounded-sm border px-2 py-0.5 text-xs"
              disabled={offerM.isPending}
              onClick={() => offerM.mutate({ unitId: r.unit_id, enabled: true, reasonCode: null })}
              data-testid={`capacity-offer-on-${r.unit_number}`}
            >
              Turn on
            </button>
          )}
        </div>
      ),
    },
  ];

  const filterBar = (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectDropdown label="Unit" options={options.units} selected={unitFilter} onChange={setUnitFilter} searchable data-testid="capacity-filter-unit" />
      <MultiSelectDropdown label="Equipment" options={options.equipment} selected={equipFilter} onChange={setEquipFilter} data-testid="capacity-filter-equipment" />
      <MultiSelectDropdown label="State" options={options.states} selected={stateFilter} onChange={setStateFilter} data-testid="capacity-filter-state" />
      <MultiSelectDropdown
        label="Offer"
        options={[{ value: "offered", label: "Offered" }, { value: "unknown", label: "Not offered — missing data" }, { value: "off", label: "Turned off" }]}
        selected={offerFilter}
        onChange={setOfferFilter}
        data-testid="capacity-filter-offer"
      />
    </div>
  );

  const preview = previewQ.data;

  return (
    <div data-testid="dispatch-available-trucks-page" className="mx-auto max-w-7xl space-y-4">
      <PageHeader
        backHref="/dispatch"
        title="Available trucks"
        subtitle="Where and when each in-service truck is free — from its last booked load's final stop, or its GPS position when it has no open load."
        actions={
          <div className="flex items-center gap-2">
            <button type="button" className="rounded-sm border px-3 py-1.5 text-xs" onClick={() => setPreviewKind("morning")} data-testid="capacity-preview-open">
              Preview today's email
            </button>
            <Link to="/customers" className="rounded-sm border px-3 py-1.5 text-xs">Customer contacts</Link>
          </div>
        }
      />

      <section className="grid gap-2 rounded-sm border bg-white px-3 py-2 text-xs md:grid-cols-3" data-testid="capacity-status">
        <div>
          <div className="font-semibold">Send truck offers</div>
          <div className="mt-1 flex items-center gap-2">
            <span data-testid="capacity-switch-state" className={settings?.send_truck_offers ? "text-[#047857]" : "text-[#B91C1C]"}>
              {settings ? (settings.send_truck_offers ? "On — 07:00 digest + 12:30 change alert (CT)" : "Off — no email is sent") : "—"}
            </span>
            {isOwner && settings ? (
              <button
                type="button"
                className="rounded-sm border px-2 py-0.5"
                disabled={switchM.isPending}
                onClick={() => switchM.mutate(!settings.send_truck_offers)}
                data-testid="capacity-switch-toggle"
              >
                {settings.send_truck_offers ? "Turn off" : "Turn on"}
              </button>
            ) : null}
          </div>
        </div>
        <div>
          <div className="font-semibold">Audience</div>
          <div className="mt-1" data-testid="capacity-recipient-count">
            {capQ.data ? `${capQ.data.recipient_count} contact${capQ.data.recipient_count === 1 ? "" : "s"} flagged "Receives truck offers"` : "—"}
          </div>
        </div>
        <div>
          <div className="font-semibold">Load boards</div>
          {(capQ.data?.boards ?? []).map((b) => (
            <div key={b.board} className="mt-1" data-testid={`capacity-board-${b.board}`}>
              <span className="font-medium">{b.board === "dat" ? "DAT" : "Truckstop"}:</span>{" "}
              {b.connected ? <span className="text-[#047857]">Connected</span> : <span className="text-[#B45309]">{b.reason}</span>}
            </div>
          ))}
        </div>
      </section>

      {actionError ? <ListErrorBanner message={actionError} onRetry={() => setActionError(null)} /> : null}
      {capQ.isError ? <ListErrorBanner message="Failed to load available trucks." onRetry={() => void capQ.refetch()} /> : null}

      {!capQ.isError ? (
        <ParityTable<CapacityRow>
          appearance="board"
          title="Trucks — availability"
          columns={columns}
          rows={visible}
          rowKey={(r) => r.unit_id}
          loading={capQ.isLoading}
          emptyText="No in-service trucks match these filters."
          storageKey="dispatch-available-trucks"
          exportFilename="available-trucks"
          filterBar={filterBar}
          suppressToolbarRange
          sortKey={sortKey}
          sortDirection={sortDir}
          sortMode="external"
          onSortChange={(key, direction) => { setSortKey(key as SortKey); setSortDir(direction); }}
        />
      ) : null}

      <ParityDrawer
        open={previewKind != null}
        title="Preview today's email"
        subtitle="Exactly what would be queued — nothing is sent from this preview."
        onClose={() => setPreviewKind(null)}
        size="wide"
      >
        <div className="space-y-3 text-sm" data-testid="capacity-preview">
          <div className="flex gap-2">
            {(["morning", "change"] as const).map((k) => (
              <button
                key={k}
                type="button"
                className={`rounded-sm border px-2 py-1 text-xs ${previewKind === k ? "bg-[#1F2937] text-white" : ""}`}
                onClick={() => setPreviewKind(k)}
              >
                {k === "morning" ? "07:00 morning digest" : "12:30 change alert"}
              </button>
            ))}
          </div>
          {previewQ.isLoading ? <p className="text-xs text-[#4B5563]">Building the preview…</p> : null}
          {previewQ.isError ? <ListErrorBanner message="Failed to build the preview." onRetry={() => void previewQ.refetch()} /> : null}
          {preview ? (
            <>
              {preview.blockers.length ? (
                <div className="rounded-sm border border-[#F59E0B] bg-[#FFFBEB] px-3 py-2 text-xs" data-testid="capacity-preview-blockers">
                  <div className="font-semibold">Nothing will be sent until:</div>
                  <ul className="ml-4 list-disc">{preview.blockers.map((b) => <li key={b}>{b}</li>)}</ul>
                </div>
              ) : null}
              <p className="text-xs text-[#4B5563]">{preview.emails.length} email{preview.emails.length === 1 ? "" : "s"} for {preview.send_date} (CT).</p>
              {preview.emails.map((e) => (
                <div key={e.to} className="rounded-sm border">
                  <div className="border-b bg-[#F9FAFB] px-3 py-2 text-xs">
                    <div><span className="font-semibold">To:</span> {e.contact_name ? `${e.contact_name} <${e.to}>` : e.to} · {e.customer_name ?? ""}</div>
                    <div><span className="font-semibold">Subject:</span> {e.subject}</div>
                  </div>
                  {e.html ? (
                    <iframe title={`preview-${e.to}`} sandbox="" srcDoc={e.html} className="h-[420px] w-full" />
                  ) : (
                    <p className="px-3 py-2 text-xs text-[#B91C1C]">The email body cannot be built until the company footer is complete.</p>
                  )}
                </div>
              ))}
            </>
          ) : null}
        </div>
      </ParityDrawer>
    </div>
  );
}

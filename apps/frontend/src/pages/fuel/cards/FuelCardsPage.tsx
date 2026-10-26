/**
 * E-22 Fuel Cards tab — the card -> truck (+ driver) registry over effective dates
 * (apps/backend/src/fuel/fuel-card-assignments.routes.ts, fuel.fuel_card_assignments,
 * migration 202615140600, PR #23695). Backend-only until now; this is the first screen.
 */
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  endFuelCardAssignment,
  listFuelCardAssignments,
  listFuelCardTypeIssuers,
  setFuelCardTypeIssuer,
  voidFuelCardAssignment,
  type FuelCardAssignment,
  type FuelCardTypeIssuer,
} from "../../../api/fuel-card-assignments";
import { EntityPicker } from "../../../components/EntityPicker";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useCanVoidCancel } from "../../../auth/useCanVoidCancel";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { ActionButton } from "../../../components/shared/ActionButton";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { StatusBadge } from "../../../components/layout/StatusBadge";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";
import { Button } from "../../../components/Button";
import { DatePicker } from "../../../components/forms/DatePicker";
import { AssignFuelCardDrawer } from "../../../components/fuel/AssignFuelCardDrawer";
import { V3KpiTile } from "../../../components/v3/V3KpiTile";
import { MoneyListToolbar } from "../../../components/table/MoneyListToolbar";
import { FuelBoardSection } from "../FuelBoardSection";
import { formatDateUS } from "../../../lib/formatDate";
import { companyWallClockToIso, companyToday } from "../../../lib/businessDate";
import { userFacingApiError } from "../../../lib/api-error-message";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";

const LINK = "text-[#1F2A44] hover:underline";

function statusBadge(row: FuelCardAssignment): { variant: "crit" | "positive" | "neutral"; label: string } {
  if (row.voided_at) return { variant: "crit", label: "Voided" };
  if (row.effective_to && new Date(row.effective_to).getTime() <= Date.now()) return { variant: "neutral", label: "Ended" };
  return { variant: "positive", label: "Active" };
}

/** ROUND 443.250 — identity counts from listFuelCardAssignments (engine unchanged). */
function assignmentKpis(rows: FuelCardAssignment[]): { active: number; ended: number; voided: number; total: number } {
  let active = 0;
  let ended = 0;
  let voided = 0;
  for (const row of rows) {
    const s = statusBadge(row).label;
    if (s === "Active") active += 1;
    else if (s === "Ended") ended += 1;
    else voided += 1;
  }
  return { active, ended, voided, total: rows.length };
}

function EndCardDrawer({
  assignment,
  operatingCompanyId,
  onClose,
  onDone,
}: {
  assignment: FuelCardAssignment | null;
  operatingCompanyId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [effectiveTo, setEffectiveTo] = useState(companyToday());
  const [saving, setSaving] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const open = Boolean(assignment);
  const close = () => {
    if (saving) return;
    setEffectiveTo(companyToday());
    setSubmitError("");
    onClose();
  };

  const submit = async () => {
    if (!assignment) return;
    setSaving(true);
    setSubmitError("");
    try {
      await endFuelCardAssignment(operatingCompanyId, assignment.id, companyWallClockToIso(`${effectiveTo}T00:00`));
      onDone();
      close();
    } catch (err) {
      setSubmitError(userFacingApiError(err, "Failed to end card assignment"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <ParityDrawer
      open={open}
      onClose={close}
      title={`End card …${assignment?.card_last_digits ?? ""}`}
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={close} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" loading={saving} onClick={() => void submit()} data-testid="fuel-cards-end-submit">
            End assignment
          </Button>
        </div>
      }
    >
      <div className="space-y-3 text-xs" data-testid="fuel-cards-end-drawer">
        <p className="text-gray-600">
          Card …{assignment?.card_last_digits} moves off truck {assignment?.unit_number ?? "this truck"} as of the date below.
        </p>
        <label htmlFor="fuel-cards-end-effective-to" className="block font-semibold text-[#1F2A44]">
          Effective to *
          <div className="mt-1">
            <DatePicker
              id="fuel-cards-end-effective-to"
              value={effectiveTo}
              onChange={setEffectiveTo}
              data-testid="fuel-cards-end-effective-to"
            />
          </div>
        </label>
        {submitError ? (
          <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800" role="alert" data-testid="fuel-cards-end-error">
            {submitError}
          </div>
        ) : null}
      </div>
    </ParityDrawer>
  );
}

function VoidCardDrawer({
  assignment,
  operatingCompanyId,
  onClose,
  onDone,
}: {
  assignment: FuelCardAssignment | null;
  operatingCompanyId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  return (
    <VoidReasonModal
      open={Boolean(assignment)}
      title={`Void card …${assignment?.card_last_digits ?? ""}`}
      postsReversingEntry={false}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!assignment) return;
        await voidFuelCardAssignment(operatingCompanyId, assignment.id, reason);
        onDone();
        onClose();
      }}
      submitLabel="Void"
    />
  );
}

/**
 * ROUND 381.6 — who issues each card type (Relay, Dreamline). The owner designates it here; nothing guesses it by name.
 * Forward: every card row shows its issuer; reverse: the vendor's link opens this page filtered to that vendor's cards.
 */
function CardIssuersPanel({ companyId, canWrite, onChanged }: { companyId: string; canWrite: boolean; onChanged: () => void }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const issuers = useQuery({
    queryKey: ["fuel", "card-type-issuers", companyId],
    queryFn: () => listFuelCardTypeIssuers(companyId),
    enabled: Boolean(companyId),
  });
  const save = async (row: FuelCardTypeIssuer, vendorId: string | null) => {
    if (vendorId === row.issuer_vendor_id) return;
    setSavingId(row.id);
    setError("");
    try {
      await setFuelCardTypeIssuer(companyId, row.id, vendorId);
      await queryClient.invalidateQueries({ queryKey: ["fuel", "card-type-issuers", companyId] });
      onChanged();
    } catch (err) {
      setError(userFacingApiError(err, "Failed to set the card issuer"));
    } finally {
      setSavingId(null);
    }
  };
  const columns: ParityColumn<FuelCardTypeIssuer>[] = [
    { key: "display_name", label: "Card type", sortable: true, render: (row) => row.display_name },
    {
      key: "issuer_vendor_name",
      label: "Issuer (vendor)",
      render: (row) =>
        canWrite ? (
          <div className="max-w-xs" data-testid={`fuel-card-issuer-${row.code}`}>
            <EntityPicker
              kind="vendor"
              operatingCompanyId={companyId}
              value={row.issuer_vendor_id}
              onChange={(id) => void save(row, id)}
              allowCreate={false}
              allowClear
              disabled={savingId === row.id}
              size="sm"
              placeholder="Choose the issuing vendor"
              ariaLabel={`Issuer of ${row.display_name}`}
            />
          </div>
        ) : row.issuer_vendor_id ? (
          <EntityLinkOrTombstone kind="vendor" id={row.issuer_vendor_id} name={row.issuer_vendor_name} noun="Vendor" className={LINK} />
        ) : (
          <span className="text-gray-400">Not designated</span>
        ),
    },
    { key: "active_card_count", label: "Cards", sortable: true, render: (row) => String(row.active_card_count) },
  ];
  return (
    <FuelBoardSection
      title="Card issuers"
      subtitle="The vendor that issues each fuel card type — shown on every card below"
      testId="fuel-cards-issuers-v3-panel"
    >
      {error ? (
        <div className="mb-2 rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800" role="alert" data-testid="fuel-card-issuer-error">
          {error}
        </div>
      ) : null}
      {issuers.isError ? (
        <ListErrorBanner onRetry={() => void issuers.refetch()} message="Card issuers could not be loaded." />
      ) : (
        <ParityTable
          rows={issuers.data?.rows ?? []}
          columns={columns}
          loading={issuers.isPending}
          storageKey="fuel-card-type-issuers"
          emptyText="No active fuel card types"
          rowKey={(row) => row.id}
        />
      )}
    </FuelBoardSection>
  );
}

export function FuelCardsPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const canWrite = useCanVoidCancel();
  const queryClient = useQueryClient();

  const [includeVoided, setIncludeVoided] = useState(false);
  // Reverse link from a vendor's profile: /fuel/cards?vendor_id=<issuer>.
  const [searchParams, setSearchParams] = useSearchParams();
  const vendorFilter = searchParams.get("vendor_id") ?? undefined;
  const [assignOpen, setAssignOpen] = useState(false);
  const [cardSearch, setCardSearch] = useState("");
  const [endTarget, setEndTarget] = useState<FuelCardAssignment | null>(null);
  const [voidTarget, setVoidTarget] = useState<FuelCardAssignment | null>(null);

  const query = useQuery({
    queryKey: ["fuel", "card-assignments", companyId, includeVoided, vendorFilter ?? null],
    queryFn: () => listFuelCardAssignments(companyId, { include_voided: includeVoided, vendor_id: vendorFilter }),
    enabled: Boolean(companyId),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["fuel", "card-assignments", companyId] });

  const columns: ParityColumn<FuelCardAssignment>[] = [
    { key: "card_last_digits", label: "Card", render: (row) => `Card …${row.card_last_digits}` },
    { key: "fuel_card_type_name", label: "Card type", sortable: true, render: (row) => row.fuel_card_type_name ?? "—" },
    {
      key: "issuer_vendor_name",
      label: "Issuer",
      render: (row) =>
        row.issuer_vendor_id ? (
          <EntityLinkOrTombstone kind="vendor" id={row.issuer_vendor_id} name={row.issuer_vendor_name} noun="Vendor" className={LINK} />
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    {
      key: "unit_number",
      label: "Truck",
      render: (row) => <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" className={LINK} />,
    },
    {
      key: "driver_name",
      label: "Driver",
      render: (row) =>
        row.driver_id ? (
          <EntityLinkOrTombstone kind="driver" id={row.driver_id} name={row.driver_name} noun="Driver" className={LINK} />
        ) : (
          <span className="text-gray-400">—</span>
        ),
    },
    { key: "effective_from", label: "From", sortable: true, render: (row) => formatDateUS(row.effective_from) },
    {
      key: "effective_to",
      label: "To", sortable: true,
      render: (row) => (row.effective_to ? formatDateUS(row.effective_to) : "Current"),
    },
    { key: "notes", label: "Notes", sortable: true, allowWrap: true, render: (row) => row.notes ?? "—" },
    {
      key: "voided_at",
      label: "Status",
      render: (row) => {
        const s = statusBadge(row);
        return <StatusBadge variant={s.variant}>{s.label}</StatusBadge>;
      },
    },
    ...(canWrite
      ? ([
          {
            key: "id",
            label: "Actions",
            sortable: false,
            render: (row: FuelCardAssignment) =>
              row.voided_at ? (
                <span className="text-gray-400">—</span>
              ) : (
                <div className="flex items-center gap-2">
                  {!row.effective_to || new Date(row.effective_to).getTime() > Date.now() ? (
                    <ActionButton onClick={() => setEndTarget(row)} data-testid={`fuel-cards-end-${row.id}`}>
                      End
                    </ActionButton>
                  ) : null}
                  <ActionButton onClick={() => setVoidTarget(row)} data-testid={`fuel-cards-void-${row.id}`}>
                    Void
                  </ActionButton>
                </div>
              ),
          } satisfies ParityColumn<FuelCardAssignment>,
        ])
      : []),
  ];

  if (!companyId) {
    return (
      <div className="space-y-3" data-testid="fuel-cards-page">
        <FuelBoardSection title="Fuel cards" testId="fuel-cards-need-company">
          <div className="px-3.5 py-3 text-xs text-gray-700">
            Select an operating company to view fuel cards.
          </div>
        </FuelBoardSection>
      </div>
    );
  }

  const allRows = query.data?.rows ?? [];
  const q = cardSearch.trim().toLowerCase();
  const rows = q
    ? allRows.filter((row) =>
        [
          row.card_last_digits,
          row.fuel_card_type_name,
          row.issuer_vendor_name,
          row.unit_number,
          row.driver_name,
          row.notes,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q),
      )
    : allRows;
  const kpis = assignmentKpis(allRows);
  const kpiValue = (n: number) => (query.isPending ? "…" : query.isError ? "—" : String(n));

  return (
    <div className="space-y-3" data-testid="fuel-cards-page">
      {/* ROUND 443.326 Fuel Cards — FuelBoardSection + MoneyListToolbar — Active / Ended / Voided / Assignments from listFuelCardAssignments. */}
      <div
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 8 }}
        data-testid="fuel-cards-v3-kpi-strip"
        data-fuel-cards-v3-kpis="1"
      >
        <V3KpiTile label="Active" value={kpiValue(kpis.active)} sub="current assignment" testId="fuel-cards-kpi-active" />
        <V3KpiTile label="Ended" value={kpiValue(kpis.ended)} sub="past effective to" testId="fuel-cards-kpi-ended" />
        <V3KpiTile label="Voided" value={kpiValue(kpis.voided)} sub={includeVoided ? "in this list" : "show voided to count"} testId="fuel-cards-kpi-voided" />
        <V3KpiTile label="Assignments" value={kpiValue(kpis.total)} sub="rows in filter" testId="fuel-cards-kpi-assignments" />
      </div>
      <MoneyListToolbar
        search={cardSearch}
        onSearchChange={setCardSearch}
        searchPlaceholder="Search card, truck, driver…"
        onClearAll={() => setCardSearch("")}
        activeFilterCount={0}
        testIdPrefix="fuel-cards"
      >
        <label className="flex h-9 items-center gap-1 text-xs text-gray-600" data-testid="fuel-cards-show-voided">
          <input type="checkbox" checked={includeVoided} onChange={(e) => setIncludeVoided(e.target.checked)} />
          Show voided
        </label>
      </MoneyListToolbar>
      <CardIssuersPanel companyId={companyId} canWrite={canWrite} onChanged={invalidate} />
      <FuelBoardSection
        title="Fuel card -> truck registry"
        subtitle="Every fuel card and the truck (and optional driver) it currently fuels, over effective dates"
        testId="fuel-cards-registry-v3-panel"
        headerRight={
          canWrite ? (
            <ActionButton onClick={() => setAssignOpen(true)} data-testid="fuel-cards-assign-open">
              + Assign card
            </ActionButton>
          ) : undefined
        }
      >
        <div className="mb-2 flex items-center gap-3 px-3 pt-2">
          {vendorFilter ? (
              <span className="flex items-center gap-1 text-xs text-gray-700" data-testid="fuel-cards-vendor-filter">
                Issued by <EntityLinkOrTombstone kind="vendor" id={vendorFilter} name={query.data?.rows?.[0]?.issuer_vendor_name ?? null} noun="Vendor" className={LINK} />
                <button
                  type="button"
                  className="text-gray-500 hover:underline"
                  onClick={() => { const next = new URLSearchParams(searchParams); next.delete("vendor_id"); setSearchParams(next); }}
                  data-testid="fuel-cards-vendor-filter-clear"
                >
                  (all cards)
                </button>
              </span>
            ) : null}
        </div>
        {query.isError ? (
          <ListErrorBanner onRetry={() => void query.refetch()} message="Fuel card assignments could not be loaded." />
        ) : (
          <ParityTable
            title="Fuel card assignments"
            rows={rows}
            columns={columns}
            loading={query.isPending}
            storageKey="fuel-card-assignments"
            emptyText="No fuel cards assigned yet"
            rowKey={(row) => row.id}
            suppressToolbarSearch
          />
        )}
      </FuelBoardSection>

      <AssignFuelCardDrawer
        open={assignOpen}
        operatingCompanyId={companyId}
        onClose={() => setAssignOpen(false)}
        onCreated={invalidate}
      />
      <EndCardDrawer assignment={endTarget} operatingCompanyId={companyId} onClose={() => setEndTarget(null)} onDone={invalidate} />
      <VoidCardDrawer assignment={voidTarget} operatingCompanyId={companyId} onClose={() => setVoidTarget(null)} onDone={invalidate} />
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useToast } from "../../components/Toast";
import { EditTrailerModal } from "../../components/fleet/EditTrailerModal";
import { ActionBar } from "../../components/trailer-profile/ActionBar";
import { ComplianceSection } from "../../components/trailer-profile/ComplianceSection";
import { CurrentAssignmentSection } from "../../components/trailer-profile/CurrentAssignmentSection";
import { DocumentsSection } from "../../components/trailer-profile/DocumentsSection";
import { IdentityStatusHeader } from "../../components/trailer-profile/IdentityStatusHeader";
import { MaintenanceSnapshotSection } from "../../components/trailer-profile/MaintenanceSnapshotSection";
import { ReeferTelemetrySection } from "../../components/trailer-profile/ReeferTelemetrySection";
import { StatusChangeModal } from "../../components/trailer-profile/StatusChangeModal";
import { TrailerReeferSection } from "../../components/trailer-profile/TrailerReeferSection";
import { ServiceTimeline } from "../../components/maintenance/ServiceTimeline";
import { TypeSpecsSection } from "../../components/trailer-profile/TypeSpecsSection";
import { InsuranceClaimsReverseSection } from "../../components/insurance/InsuranceClaimsReverseSection";
import { AssetSafetyReverseSection } from "../../components/safety/AssetSafetyReverseSection";
import { LinkedBankTransactionsPanel } from "../../components/banking/LinkedBankTransactionsPanel";
import { EntityAuditHistoryTab } from "../../components/audit/EntityAuditHistoryTab";
import { LegalMattersReverseSection } from "../../components/legal/LegalMattersReverseSection";
import { FuelTransactionsReverseSection } from "../../components/fuel/FuelTransactionsReverseSection";
import { ExpensesReverseSection } from "../../components/accounting/ExpensesReverseSection";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { TrailerTiresReverseSection } from "../../components/maintenance/TrailerTiresReverseSection";
import { EquipmentTransfersReverseSection } from "../../components/dispatch/EquipmentTransfersReverseSection";
import { entityLabel } from "../../lib/entity-label";

export type TrailerProfileAggregate = {
  equipment: Record<string, unknown>;
  type_specs: Record<string, unknown>;
  current_assignment: Record<string, unknown>;
  loads: Array<Record<string, unknown>>;
  reefer: Record<string, unknown> | null;
  samsara_telemetry: Record<string, unknown> | null;
  maintenance: Record<string, unknown>;
  compliance: Record<string, unknown>;
  documents: Array<Record<string, unknown>>;
  plates: Array<Record<string, unknown>>;
};

function fetchTrailerProfile(equipmentId: string, operatingCompanyId: string) {
  return apiRequest<TrailerProfileAggregate>(
    `/api/v1/mdata/equipment/${equipmentId}?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
  );
}

export function TrailerProfilePage() {
  const { id = "" } = useParams();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);

  const profileQ = useQuery({
    queryKey: ["trailer-profile", id, companyId],
    queryFn: () => fetchTrailerProfile(id, companyId),
    enabled: Boolean(id && companyId),
  });

  const invalidateProfile = () => {
    void queryClient.invalidateQueries({ queryKey: ["trailer-profile", id, companyId] });
  };

  // Dead-click fix (0441-mod9-trailerprofile-archive-dead): this used to be a "not yet
  // implemented" no-op even though the real endpoint (reused by FleetTable's bulk "Inactivate
  // selected" for trailers) already exists — POST /api/v1/mdata/equipment/:id/deactivate.
  // Soft-delete only (deactivated_at), never a hard delete; reversible via "Reactivate" on the
  // Fleet roster.
  const archiveMutation = useMutation({
    mutationFn: () =>
      apiRequest(`/api/v1/mdata/equipment/${id}/deactivate?operating_company_id=${encodeURIComponent(companyId)}`, {
        method: "POST",
        body: {},
      }),
    onSuccess: () => {
      pushToast("Trailer archived (soft-deleted) — reversible from the Fleet roster.", "success");
      invalidateProfile();
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
    },
    onError: (e) => pushToast(e instanceof Error ? e.message : "Failed to archive trailer", "error"),
  });

  const handleArchive = () => {
    if (!window.confirm("Archive this trailer? This soft-deletes it (reversible) — the record is retained.")) return;
    archiveMutation.mutate();
  };

  if (!companyId) {
    return <div className="rounded-sm border bg-white p-4 text-sm">Select an operating company.</div>;
  }
  if (profileQ.isLoading) {
    return <div className="rounded-sm border bg-white p-4 text-sm">Loading trailer profile…</div>;
  }
  if (!profileQ.data) {
    return <div className="rounded-sm border bg-white p-4 text-sm">Trailer not found.</div>;
  }

  const aggregate = profileQ.data;
  const equipment = aggregate.equipment;
  const isReefer = String(equipment.equipment_type) === "Reefer";
  const trailerLabel = entityLabel(equipment.equipment_number, id, "Trailer");

  return (
    <div className="space-y-4 pb-20">
      <PageHeader backHref="/fleet" breadcrumb={["Fleet", trailerLabel]} title={trailerLabel} subtitle="Trailer profile" />
      <div data-testid="tp-section-1-identity">
        <IdentityStatusHeader
          equipment={equipment}
          onChangeStatus={(next) => {
            if (next === "__change__") setStatusModalOpen(true);
          }}
        />
      </div>
      <div data-testid="tp-section-2-specs">
        <TypeSpecsSection specs={aggregate.type_specs} />
      </div>
      <div data-testid="tp-section-3-assignment">
        <CurrentAssignmentSection assignment={aggregate.current_assignment} />
      </div>
      <section data-testid="tp-section-3b-load-history" className="rounded-sm border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-semibold text-gray-800">Loads</h2>
        <div className="mt-2 space-y-1 text-xs">
          {(aggregate.loads ?? []).map((load) => (
            <div key={String(load.load_id)} className="flex items-center justify-between gap-3">
              <EntityLinkOrTombstone
                kind="load"
                id={load.load_id == null ? null : String(load.load_id)}
                name={load.load_number}
                noun="Load"
              />
              <span className="text-gray-500">{String(load.status ?? "—")}</span>
            </div>
          ))}
          {(aggregate.loads ?? []).length === 0 ? <p className="text-gray-500">No linked loads.</p> : null}
        </div>
      </section>
      <EquipmentTransfersReverseSection companyId={companyId} equipmentId={id} />
      {isReefer ? (
        <>
          <div data-testid="tp-section-4-reefer">
            <ReeferTelemetrySection reefer={aggregate.reefer} telemetry={aggregate.samsara_telemetry} />
          </div>
          <TrailerReeferSection trailerId={id} companyId={companyId} />
        </>
      ) : null}
      <div data-testid="tp-section-5-maintenance">
        <MaintenanceSnapshotSection maintenance={aggregate.maintenance} />
        <div className="mt-3">
          <ServiceTimeline companyId={companyId} equipmentId={id} showUnitEventTypes={false} />
        </div>
      </div>
      <div data-testid="tp-section-5b-tires">
        <TrailerTiresReverseSection operatingCompanyId={companyId} equipmentId={id} />
      </div>
      <div data-testid="tp-section-6-compliance">
        <ComplianceSection compliance={aggregate.compliance} plates={aggregate.plates} />
      </div>
      <div data-testid="tp-section-6b-insurance-claims">
        <InsuranceClaimsReverseSection
          operatingCompanyId={companyId}
          filter={{ trailer_id: id }}
          contextLabel="this trailer"
          data-testid="trailer-profile-insurance-claims"
        />
      </div>
      {/* SAF-F17 — reverse linkage. DOT inspections, DVIRs, incidents (trailer interchanges
          especially), and — since RANK5-ACCIDENT-TRAILER-ID (#6324) — accidents too, all carry this
          trailer's id; none of it was readable from the trailer before this. */}
      <div data-testid="tp-section-6c-safety-records">
        <AssetSafetyReverseSection
          operatingCompanyId={companyId}
          assetKind="trailer"
          assetId={id}
          data-testid="trailer-profile-safety-records"
        />
      </div>
      {/* EXPENSE-FUEL-TRAILER-LIST-FILTER-MISSING — fuel and expenses both carry this trailer's id
          (populated going-forward since #6316) but had no list-level filter until this session, and
          no reverse surface on the trailer profile at all (unlike claims/legal/safety above). */}
      <div data-testid="tp-section-6d-fuel-transactions">
        <FuelTransactionsReverseSection
          operatingCompanyId={companyId}
          filter={{ trailer_id: id }}
          contextLabel="this trailer"
          data-testid="trailer-profile-fuel-transactions"
        />
      </div>
      <div data-testid="tp-section-6e-expenses">
        <ExpensesReverseSection
          operatingCompanyId={companyId}
          filter={{ trailer_id: id }}
          contextLabel="this trailer"
          data-testid="trailer-profile-expenses"
        />
      </div>
      <div data-testid="tp-section-7-documents">
        <DocumentsSection
          equipmentId={id}
          equipmentNumber={trailerLabel}
          companyId={companyId}
          documents={aggregate.documents}
          onUploaded={invalidateProfile}
        />
      </div>
      <div data-testid="tp-section-7b-linked-bank-txns">
        <LinkedBankTransactionsPanel
          companyId={companyId}
          linkage={{ kind: "trailer_id", id }}
          entityLabel={trailerLabel}
        />
      </div>
      <div data-testid="tp-section-7c-legal-matters">
        {/* CLS-REVERSE-LINKAGE-MISSING — reverse drill-through to legal.matters for THIS trailer.
            Filtered on equipment_id, not unit_id: trailers are mdata.equipment rows and units are
            mdata.units rows, so reusing unit_id here would have queried the wrong key space and
            shown an empty panel forever. */}
        <LegalMattersReverseSection
          operatingCompanyId={companyId}
          filter={{ equipment_id: id }}
          contextLabel="this trailer"
          data-testid="trailer-profile-legal-matters"
        />
      </div>
      <section data-testid="tp-section-audit-history" className="rounded-sm border border-gray-200 bg-white p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">Audit History</h3>
        <EntityAuditHistoryTab operatingCompanyId={companyId} entityType="equipment" entityId={id} />
      </section>
      {/* DUALPATH-07 fix (2026-07-22): the old tp-section-9-activity TrailerRecentActivitySection
          widget was removed from the live render path — ServiceTimeline (tp-section-5-maintenance,
          above, already equipment_id-filtered per B26) is the sole canonical activity surface.
          TrailerRecentActivitySection.tsx is archived (ARCHIVE-not-DELETE), not deleted, per Rule 07. */}
      <div data-testid="tp-section-8-action-bar">
        <ActionBar
          equipmentId={id}
          companyId={companyId}
          equipmentNumber={trailerLabel}
          onEdit={() => setEditModalOpen(true)}
          onChangeStatus={() => setStatusModalOpen(true)}
          onArchive={handleArchive}
        />
      </div>
      <StatusChangeModal
        open={statusModalOpen}
        trailerId={id}
        companyId={companyId}
        currentStatus={String(equipment.status ?? "")}
        onClose={() => setStatusModalOpen(false)}
        onSaved={invalidateProfile}
      />
      <EditTrailerModal
        open={editModalOpen}
        trailerId={id}
        operatingCompanyId={companyId}
        onClose={() => setEditModalOpen(false)}
        onSaved={invalidateProfile}
      />
    </div>
  );
}

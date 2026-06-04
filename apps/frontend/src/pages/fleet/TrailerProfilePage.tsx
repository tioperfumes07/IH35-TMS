import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { apiRequest } from "../../api/client";
import { PageHeader } from "../../components/layout/PageHeader";
import { useCompanyContext } from "../../contexts/CompanyContext";
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
import { TrailerRecentActivitySection } from "../../components/trailer-profile/TrailerRecentActivitySection";
import { TypeSpecsSection } from "../../components/trailer-profile/TypeSpecsSection";

export type TrailerProfileAggregate = {
  equipment: Record<string, unknown>;
  type_specs: Record<string, unknown>;
  current_assignment: Record<string, unknown>;
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

  if (!companyId) {
    return <div className="rounded border bg-white p-4 text-sm">Select an operating company.</div>;
  }
  if (profileQ.isLoading) {
    return <div className="rounded border bg-white p-4 text-sm">Loading trailer profile…</div>;
  }
  if (!profileQ.data) {
    return <div className="rounded border bg-white p-4 text-sm">Trailer not found.</div>;
  }

  const aggregate = profileQ.data;
  const equipment = aggregate.equipment;
  const isReefer = String(equipment.equipment_type) === "Reefer";

  return (
    <div className="space-y-4 pb-20">
      <PageHeader title={String(equipment.equipment_number ?? "Trailer")} subtitle="Trailer profile" />
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
      {isReefer ? (
        <>
          <div data-testid="tp-section-4-reefer">
            <ReeferTelemetrySection reefer={aggregate.reefer} telemetry={aggregate.samsara_telemetry} />
          </div>
          <TrailerReeferSection trailerId={id} />
        </>
      ) : null}
      <div data-testid="tp-section-5-maintenance">
        <MaintenanceSnapshotSection maintenance={aggregate.maintenance} />
        <div className="mt-3">
          <ServiceTimeline companyId={companyId} equipmentId={id} showUnitEventTypes={false} />
        </div>
      </div>
      <div data-testid="tp-section-6-compliance">
        <ComplianceSection compliance={aggregate.compliance} plates={aggregate.plates} />
      </div>
      <div data-testid="tp-section-7-documents">
        <DocumentsSection equipmentId={id} companyId={companyId} documents={aggregate.documents} />
      </div>
      <TrailerRecentActivitySection equipmentId={id} companyId={companyId} />
      <div data-testid="tp-section-8-action-bar">
        <ActionBar
          equipmentId={id}
          companyId={companyId}
          equipmentNumber={String(equipment.equipment_number ?? id)}
          onEdit={() => setEditModalOpen(true)}
          onChangeStatus={() => setStatusModalOpen(true)}
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

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  getDotInspections,
  getSafetyAccidents,
  getSafetyDvirSubmissions,
  listSafetyIncidents,
  type SafetyIncidentType,
} from "../../api/safety";
import { useAuth } from "../../auth/useAuth";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";

/**
 * SAF-F17 — the REVERSE half of the asset↔safety link (unit and trailer profiles).
 *
 * Every one of these records already stored the asset it happened to — `safety.accident_reports.unit_id`,
 * `safety.dot_inspections.unit_id`/`trailer_id`, `safety.dvir_submissions.unit_id`/`trailer_id`,
 * `safety.incidents.unit_id`/`trailer_id` — and NONE of it was readable from the asset. Opening a
 * unit showed telemetry, maintenance, compliance, insurance and legal, and not one accident, DOT
 * inspection or DVIR. DEFINITION-OF-DONE §1.C: forward persistence with no reverse surface is NOT done.
 *
 * Every read is scoped SERVER-SIDE. Each list route caps at LIMIT 500, so filtering in the browser
 * would silently under-report the moment the company crosses that cap — on DOT inspections and
 * accidents, quietly hiding an asset's history is a compliance defect, not a cosmetic one.
 *
 * ASSET MODEL (do not "simplify" this):
 *   - Trucks live in `mdata.units`; trailers live in `mdata.equipment`. They are different tables.
 *   - `mdata.units` has NO `operating_company_id` (owner_company_id / currently_leased_to_company_id),
 *     which is why company scoping here comes from the selected-company context, exactly as the
 *     existing Legal/Insurance reverse sections on these same pages do.
 *   - `safety.accident_reports` has NO `trailer_id` column at all, so the Accidents block is
 *     deliberately UNIT-ONLY. Rendering an always-empty "Accidents" block on a trailer would assert
 *     a clean accident history that was never actually recorded anywhere.
 */

type Row = Record<string, unknown>;

const s = (value: unknown): string => (value == null ? "" : String(value));

const INCIDENT_KINDS: { type: SafetyIncidentType; title: string; route: string; linkLabel: string }[] = [
  { type: "damage_report", title: "Damage Reports", route: "/safety/damage-reports", linkLabel: "Open Damage Reports" },
  {
    type: "trailer_interchange",
    title: "Trailer Interchanges",
    route: "/safety/trailer-interchanges",
    linkLabel: "Open Trailer Interchanges",
  },
  { type: "cargo_claim", title: "Cargo Claims", route: "/safety/cargo-claims", linkLabel: "Open Cargo Claims" },
];

function SectionShell({
  title,
  to,
  linkLabel,
  testId,
  isLoading,
  isError,
  errorText,
  emptyText,
  count,
  children,
}: {
  title: string;
  to: string;
  linkLabel: string;
  testId: string;
  isLoading: boolean;
  isError: boolean;
  errorText: string;
  emptyText: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          {title}
          {count > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({count})</span> : null}
        </h3>
        <Link className="text-xs font-semibold text-slate-700 underline" to={to}>
          {linkLabel}
        </Link>
      </div>
      {isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {isError ? <p className="text-sm text-red-600">{errorText}</p> : null}
      {!isLoading && !isError && count === 0 ? <p className="text-sm text-gray-500">{emptyText}</p> : null}
      {count > 0 ? <ul className="space-y-2">{children}</ul> : null}
    </div>
  );
}

function IncidentsBlock({
  companyId,
  assetKind,
  assetId,
  kind,
}: {
  companyId: string;
  assetKind: "unit" | "trailer";
  assetId: string;
  kind: (typeof INCIDENT_KINDS)[number];
}) {
  const filter = assetKind === "unit" ? { unit_id: assetId } : { trailer_id: assetId };
  const query = useQuery({
    queryKey: ["safety", "reverse", "incidents", kind.type, assetKind, companyId, assetId],
    queryFn: () => listSafetyIncidents(companyId, kind.type, filter),
    enabled: Boolean(companyId) && Boolean(assetId),
  });
  const rows: Row[] = query.data?.incidents ?? [];

  return (
    <SectionShell
      title={kind.title}
      to={kind.route}
      linkLabel={kind.linkLabel}
      testId={`asset-safety-reverse-${kind.type.replace(/_/g, "-")}`}
      isLoading={query.isLoading}
      isError={query.isError}
      errorText={`Failed to load ${kind.title.toLowerCase()} for this ${assetKind}.`}
      emptyText={`No ${kind.title.toLowerCase()} for this ${assetKind}.`}
      count={rows.length}
    >
      {rows.map((incident) => (
        <li key={s(incident.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
          {/* SAF-B30: was plain text with the comment "no per-record detail surface to open". The
              surface exists — the cluster list now honours ?incident_id= — so this drills through. */}
          <EntityLink
            kind={kind.type}
            id={s(incident.id)}
            label={s(incident.description) || kind.title}
            className="font-semibold"
          />
          <span className="ml-2 text-gray-600">{s(incident.status) || "open"}</span>
          <div className="mt-1 text-xs text-gray-600">
            {formatDateUS(s(incident.incident_at))}
            {incident.location ? ` · ${s(incident.location)}` : ""}
            {incident.interchange_party ? ` · ${s(incident.interchange_party)}` : ""}
          </div>
        </li>
      ))}
    </SectionShell>
  );
}

type Props = {
  operatingCompanyId: string;
  /** "unit" reads mdata.units ids; "trailer" reads mdata.equipment ids. Not interchangeable. */
  assetKind: "unit" | "trailer";
  assetId: string;
  "data-testid"?: string;
};

export function AssetSafetyReverseSection({
  operatingCompanyId,
  assetKind,
  assetId,
  "data-testid": testId = "asset-safety-reverse-section",
}: Props) {
  const { user } = useAuth();
  const role = user?.role;
  const canViewSafety =
    role === "Owner" || role === "Administrator" || role === "Manager" || role === "Safety";

  const enabled = canViewSafety && Boolean(operatingCompanyId) && Boolean(assetId);
  const isUnit = assetKind === "unit";

  const accidentsQuery = useQuery({
    queryKey: ["safety", "reverse", "accidents", operatingCompanyId, assetId],
    queryFn: () => getSafetyAccidents(operatingCompanyId, { unit_id: assetId }),
    // Unit-only: safety.accident_reports has no trailer column (see file header).
    enabled: enabled && isUnit,
  });

  const inspectionsQuery = useQuery({
    queryKey: ["safety", "reverse", "dot-inspections", assetKind, operatingCompanyId, assetId],
    queryFn: () =>
      getDotInspections(operatingCompanyId, isUnit ? { unit_id: assetId } : { trailer_id: assetId }),
    enabled,
  });

  const dvirQuery = useQuery({
    queryKey: ["safety", "reverse", "dvir", assetKind, operatingCompanyId, assetId],
    queryFn: () =>
      getSafetyDvirSubmissions(operatingCompanyId, isUnit ? { unit_id: assetId } : { trailer_id: assetId }),
    enabled,
  });

  if (!canViewSafety) return null;

  const accidents: Row[] = accidentsQuery.data?.accidents ?? [];
  const inspections: Row[] = inspectionsQuery.data?.inspections ?? [];
  const dvirs: Row[] = dvirQuery.data?.submissions ?? [];
  const contextLabel = isUnit ? "unit" : "trailer";

  return (
    <div className="space-y-3" data-testid={testId}>
      <h2 className="text-sm font-semibold text-gray-900">Safety records linked to this {contextLabel}</h2>

      {isUnit ? (
        <SectionShell
          title="Accidents"
          to="/safety/accidents"
          linkLabel="Open Accidents"
          testId="asset-safety-reverse-accidents"
          isLoading={accidentsQuery.isLoading}
          isError={accidentsQuery.isError}
          errorText="Failed to load accidents for this unit."
          emptyText="No accidents recorded for this unit."
          count={accidents.length}
        >
          {accidents.map((accident) => (
            <li key={s(accident.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
              <EntityLink
                kind="accident"
                id={s(accident.id) || null}
                label={s(accident.description) || `Accident ${s(accident.id).slice(0, 8)}`}
                className="font-semibold text-slate-700"
              />
              <div className="mt-1 text-xs text-gray-600">
                {formatDateUS(s(accident.accident_at))}
                {accident.driver_name ? ` · ${s(accident.driver_name)}` : ""}
              </div>
            </li>
          ))}
        </SectionShell>
      ) : null}

      <SectionShell
        title="DOT Inspections"
        to="/safety/dot-inspections"
        linkLabel="Open DOT Inspections"
        testId="asset-safety-reverse-dot-inspections"
        isLoading={inspectionsQuery.isLoading}
        isError={inspectionsQuery.isError}
        errorText={`Failed to load DOT inspections for this ${contextLabel}.`}
        emptyText={`No DOT inspections for this ${contextLabel}.`}
        count={inspections.length}
      >
        {inspections.map((inspection) => (
          <li key={s(inspection.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
            <EntityLink
              kind="dot_inspection"
              id={s(inspection.id) || null}
              label={`Level ${s(inspection.inspection_level) || "—"} · ${s(inspection.outcome) || "—"}`}
              className="font-semibold text-slate-700"
            />
            <div className="mt-1 text-xs text-gray-600">
              {formatDateUS(s(inspection.inspection_date))}
              {inspection.inspector_name ? ` · ${s(inspection.inspector_name)}` : ""}
              {inspection.location ? ` · ${s(inspection.location)}` : ""}
            </div>
          </li>
        ))}
      </SectionShell>

      <SectionShell
        title="DVIRs"
        to="/safety/idvr"
        linkLabel="Open DVIRs"
        testId="asset-safety-reverse-dvir"
        isLoading={dvirQuery.isLoading}
        isError={dvirQuery.isError}
        errorText={`Failed to load DVIRs for this ${contextLabel}.`}
        emptyText={`No DVIRs for this ${contextLabel}.`}
        count={dvirs.length}
      >
        {dvirs.map((dvir) => (
          <li key={s(dvir.id)} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
            {/* No EntityLink kind: the DVIR list has no per-record drill target to open. */}
            <span className="font-semibold text-slate-700">
              {s(dvir.type) || "DVIR"} · {s(dvir.defect_severity) || "none"}
            </span>
            <span className="ml-2 text-gray-600">{s(dvir.driver_name)}</span>
            <div className="mt-1 text-xs text-gray-600">
              {formatDateUS(s(dvir.submitted_at))} · {s(dvir.defect_count) || "0"} defect(s)
            </div>
            {dvir.follow_up_wo_id ? (
              <div className="mt-1 text-xs text-gray-600">
                Follow-up work order{" "}
                <EntityLink
                  kind="work_order"
                  id={s(dvir.follow_up_wo_id) || null}
                  label={s(dvir.follow_up_wo_id).slice(0, 8)}
                  className="font-semibold text-slate-700"
                />
              </div>
            ) : null}
          </li>
        ))}
      </SectionShell>

      {INCIDENT_KINDS.map((kind) => (
        <IncidentsBlock
          key={kind.type}
          companyId={operatingCompanyId}
          assetKind={assetKind}
          assetId={assetId}
          kind={kind}
        />
      ))}
    </div>
  );
}

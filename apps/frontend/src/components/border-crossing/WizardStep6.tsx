import type { PortOfEntry, WizardFormState } from "./borderCrossingApi";
import { formatDateTimeLocalUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";

type Props = {
  form: WizardFormState;
  ports: PortOfEntry[];
  result: {
    crossingId?: string;
    emanifestReference?: string;
    fastCardWarning?: string | null;
  } | null;
};

export function WizardStep6({ form, ports, result }: Props) {
  const port = ports.find((p) => p.id === form.portOfEntryId);
  const hasIds = Boolean(form.loadId || form.unitId || form.driverId || form.customsBrokerId);

  return (
    <section data-testid="border-wizard-step-6" className="space-y-3">
      <h3 className="text-sm font-semibold">Step 6 — Review & generate eManifest</h3>
      {/* Exact Leaves border_crossing_wizard review — form held UUIDs with no EntityLinks */}
      {hasIds ? (
        <div
          className="flex flex-wrap gap-x-3 gap-y-1 rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700"
          data-testid="border-wizard-step-6-entitylinks"
        >
          {form.loadId ? (
            <span>
              Load:{" "}
              <EntityLink
                kind="load"
                id={form.loadId}
                label={entityLabel(form.loadLabel, form.loadId, "Load")}
                data-testid="border-wizard-step6-load-link"
              />
            </span>
          ) : null}
          {form.unitId ? (
            <span>
              Unit:{" "}
              <EntityLink
                kind="unit"
                id={form.unitId}
                label={entityLabel(form.unitLabel, form.unitId, "Unit")}
                data-testid="border-wizard-step6-unit-link"
              />
            </span>
          ) : null}
          {form.driverId ? (
            <span>
              Driver:{" "}
              <EntityLink
                kind="driver"
                id={form.driverId}
                label={entityLabel(form.driverLabel, form.driverId, "Driver")}
                data-testid="border-wizard-step6-driver-link"
              />
            </span>
          ) : null}
          {form.customsBrokerId ? (
            <span>
              Broker:{" "}
              <EntityLink
                kind="vendor"
                id={form.customsBrokerId}
                label={entityLabel(form.customsBrokerLabel, form.customsBrokerId, "Vendor")}
                data-testid="border-wizard-step6-broker-link"
              />
            </span>
          ) : null}
        </div>
      ) : null}
      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-gray-500">Direction</dt>
          <dd>{form.direction || "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Port</dt>
          <dd>{port?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Planned date</dt>
          <dd>{formatDateTimeLocalUS(form.plannedDate) || "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Commodity</dt>
          <dd>{form.commodity || "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Weight</dt>
          <dd>{form.weight ? `${form.weight} lbs` : "—"}</dd>
        </div>
        <div>
          <dt className="text-gray-500">Hazmat</dt>
          <dd>{form.hazmat ? "Yes" : "No"}</dd>
        </div>
      </dl>
      {result?.emanifestReference ? (
        <div className="rounded-sm border border-green-300 bg-green-50 p-3 text-sm">
          <p>
            Crossing logged · eManifest ref <strong>{result.emanifestReference}</strong>
          </p>
          {result.fastCardWarning ? <p className="mt-1 text-amber-800">{result.fastCardWarning}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

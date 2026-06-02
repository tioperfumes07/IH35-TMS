import type { PortOfEntry, WizardFormState } from "./borderCrossingApi";

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

  return (
    <section data-testid="border-wizard-step-6" className="space-y-3">
      <h3 className="text-sm font-semibold">Step 6 — Review & generate eManifest</h3>
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
          <dd>{form.plannedDate || "—"}</dd>
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
        <div className="rounded border border-green-300 bg-green-50 p-3 text-sm">
          <p>
            Crossing logged · eManifest ref <strong>{result.emanifestReference}</strong>
          </p>
          {result.fastCardWarning ? <p className="mt-1 text-amber-800">{result.fastCardWarning}</p> : null}
        </div>
      ) : null}
    </section>
  );
}

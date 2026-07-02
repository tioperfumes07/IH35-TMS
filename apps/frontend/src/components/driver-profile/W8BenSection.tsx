function statusBadge(status: string | undefined) {
  if (status === "on_file") return { label: "On file", cls: "border-emerald-300 bg-emerald-50 text-emerald-700" };
  if (status === "expiring") return { label: "Renewal due", cls: "border-yellow-300 bg-yellow-50 text-yellow-800" };
  return { label: "Missing", cls: "border-red-300 bg-red-50 text-red-700" };
}

function fmt(value: unknown) {
  const s = String(value ?? "").trim();
  return s ? s : "—";
}

/**
 * W-8BEN — IRS "Certificate of Foreign Status of Beneficial Owner". IH35 B-1 drivers
 * (Mexican foreign persons) must have one on file at hire, renewed yearly (IH35 policy).
 * Read-only summary of the latest active certificate + status + yearly-renewal reminder,
 * mirroring the border-credentials / training expiry pattern.
 */
export function W8BenSection({
  w8ben,
  onCapture,
}: {
  w8ben: Record<string, unknown>;
  onCapture?: () => void;
}) {
  const status = String(w8ben.status ?? "missing");
  const onFile = Boolean(w8ben.on_file);
  const badge = statusBadge(status);
  const renewalDue = w8ben.renewal_due_date ? String(w8ben.renewal_due_date) : null;
  const renewalDays = typeof w8ben.renewal_days_until === "number" ? (w8ben.renewal_days_until as number) : null;

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-gray-800">W-8BEN (foreign status)</h2>
          <span className={`rounded border px-2 py-0.5 text-[11px] font-semibold ${badge.cls}`}>{badge.label}</span>
        </div>
        <button
          type="button"
          className="text-xs text-slate-700 underline disabled:cursor-not-allowed disabled:text-gray-400"
          data-testid="dp-capture-w8ben"
          onClick={onCapture}
          disabled={!onCapture}
        >
          {onFile ? "+ Create renewal" : "+ Create"}
        </button>
      </div>

      {onFile ? (
        <>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Legal name" value={w8ben.full_legal_name} />
            <Field label="Country of citizenship" value={w8ben.country_of_citizenship} />
            <Field label="Foreign TIN (RFC/CURP)" value={w8ben.foreign_tin} />
            <Field label="U.S. TIN" value={w8ben.us_tin} />
            <Field label="Date of birth" value={w8ben.date_of_birth} />
            <Field label="Signed" value={w8ben.signed_date} />
            <Field label="IRS expiration" value={w8ben.irs_expiration_date} />
            <Field label="Certified by" value={w8ben.certification_name} />
          </div>
          <p className="mt-3 text-xs text-slate-600">
            {renewalDue ? (
              renewalDays !== null && renewalDays < 0 ? (
                <span className="text-red-700">Yearly renewal overdue — was due {renewalDue}.</span>
              ) : renewalDays !== null && renewalDays <= 60 ? (
                <span className="text-yellow-800">
                  Yearly renewal due {renewalDue} ({renewalDays} days).
                </span>
              ) : (
                <span>Next yearly renewal due {renewalDue}.</span>
              )
            ) : null}
          </p>
        </>
      ) : (
        <p className="mt-3 text-xs text-red-700">
          No W-8BEN on file. Required at hire for foreign (B-1) drivers — capture the certificate.
        </p>
      )}
    </section>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded border border-gray-100 p-3">
      <div className="text-[10px] uppercase text-gray-500">{label}</div>
      <div className="text-sm font-medium text-gray-900">{fmt(value)}</div>
    </div>
  );
}

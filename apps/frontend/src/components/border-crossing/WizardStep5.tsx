type Props = {
  driverId: string;
  fastCardVerified: boolean | null;
  fastCardWarning: string | null;
  checking: boolean;
};

export function WizardStep5({ driverId, fastCardVerified, fastCardWarning, checking }: Props) {
  return (
    <section data-testid="border-wizard-step-5" className="space-y-3">
      <h3 className="text-sm font-semibold">Step 5 — Driver credentials (FAST card)</h3>
      {!driverId ? (
        <p className="text-sm text-amber-700">No driver selected — FAST card verification skipped.</p>
      ) : checking ? (
        <p className="text-sm text-gray-600">Checking driver FAST card expiration…</p>
      ) : (
        <div
          data-testid="fast-card-status"
          className={`rounded border p-3 text-sm ${fastCardVerified ? "border-green-300 bg-green-50" : "border-amber-300 bg-amber-50"}`}
        >
          {fastCardVerified ? (
            <p>FAST card verified — expiration is current.</p>
          ) : (
            <p>{fastCardWarning ?? "FAST card could not be verified."}</p>
          )}
        </div>
      )}
      <p className="text-xs text-gray-500">
        Wizard verifies <code>fast_card_expiration</code> from the driver profile (Block 14). Expired or missing cards
        show a warning but allow completion.
      </p>
    </section>
  );
}

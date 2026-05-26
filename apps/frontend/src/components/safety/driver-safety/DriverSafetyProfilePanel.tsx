type ExpiryPill = "green" | "amber" | "red" | "unknown";

type DriverSafetyProfilePanelProps = {
  driverName: string;
  driverDisplayId: string;
  medicalExpiryPill: ExpiryPill;
  dqMissingCount: number;
  trainingDueCount: number;
};

export function DriverSafetyProfilePanel({
  driverName,
  driverDisplayId,
  medicalExpiryPill,
  dqMissingCount,
  trainingDueCount,
}: DriverSafetyProfilePanelProps) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-4">
      <header className="mb-3">
        <h2 className="text-lg font-semibold text-gray-900">Driver Safety Profile</h2>
        <p className="text-sm text-gray-500">
          {driverName} ({driverDisplayId})
        </p>
      </header>
      <div className="grid gap-3 text-sm sm:grid-cols-3">
        <article className="rounded-md bg-gray-50 p-3">
          <p className="font-medium text-gray-700">Medical Card</p>
          <p className="text-gray-900">{medicalExpiryPill.toUpperCase()}</p>
        </article>
        <article className="rounded-md bg-gray-50 p-3">
          <p className="font-medium text-gray-700">DQ Missing</p>
          <p className="text-gray-900">{dqMissingCount}</p>
        </article>
        <article className="rounded-md bg-gray-50 p-3">
          <p className="font-medium text-gray-700">Training Due</p>
          <p className="text-gray-900">{trainingDueCount}</p>
        </article>
      </div>
    </section>
  );
}

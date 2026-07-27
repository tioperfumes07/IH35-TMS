import { StatusBadge } from "../StatusBadge";

export function IdentityHeader({
  driver,
  employmentStatusLabel,
}: {
  driver: Record<string, unknown>;
  /**
   * DRV-04. This header used to read `driver.employment_status` — a RETIRED column with no writer.
   * Verified on prod 2026-07-27 (lucia bypass, positive control mdata.drivers = 178): it is populated
   * on 0 of 178 drivers, while the canonical mdata.drivers.driver_employment_status_id is populated on
   * 178 of 178. So the header silently fell through to pay_basis, or to an em dash, for EVERY driver —
   * the field looked merely blank rather than broken, which is why it survived.
   *
   * The label comes from reference.employment_statuses via the aggregate's reference-FK enrichment.
   * It is passed in rather than read off `driver` because the aggregate exposes it alongside the other
   * reference-FK labels, not on the raw driver row.
   */
  employmentStatusLabel?: string | null;
}) {
  const name = [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || "Driver";
  const photoUrl = driver.photo_url ? String(driver.photo_url) : null;
  // Canonical label first; pay_basis remains the pre-existing secondary. The retired column is NOT
  // consulted at all — a value there would be stale by definition, since nothing writes it.
  const employment = employmentStatusLabel
    ? String(employmentStatusLabel).toUpperCase()
    : driver.pay_basis
      ? String(driver.pay_basis)
      : "—";

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-start gap-4">
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-200 text-lg font-semibold text-slate-600">
            {name.slice(0, 1)}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-semibold text-gray-900">{name}</h2>
          <p className="text-xs text-gray-600">
            DOB {driver.date_of_birth ? String(driver.date_of_birth) : "—"} · Hired{" "}
            {driver.hire_date ? String(driver.hire_date) : "—"}
          </p>
          <p className="text-xs text-gray-600">
            {employment} · ID {driver.employee_id_display ? String(driver.employee_id_display) : "—"}
          </p>
        </div>
        <StatusBadge status={String(driver.status ?? "Active")} />
      </div>
    </section>
  );
}

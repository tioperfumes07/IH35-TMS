import { StatusBadge } from "../StatusBadge";

export function IdentityHeader({ driver }: { driver: Record<string, unknown> }) {
  const name = [driver.first_name, driver.last_name].filter(Boolean).join(" ").trim() || "Driver";
  const photoUrl = driver.photo_url ? String(driver.photo_url) : null;
  const employment = driver.employment_status ? String(driver.employment_status).toUpperCase() : driver.pay_basis ? String(driver.pay_basis) : "—";

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
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

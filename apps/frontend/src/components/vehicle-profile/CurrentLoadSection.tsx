import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";

export function CurrentLoadSection({
  currentLoad,
  unitId,
  unitNumber,
}: {
  currentLoad: Record<string, unknown> | null;
  unitId: string;
  unitNumber: string;
}) {
  if (!currentLoad) {
    return (
      <section className="rounded-sm border border-dashed border-gray-200 bg-gray-50 p-4 text-xs text-gray-600">
        <h3 className="font-semibold text-gray-800">Current load</h3>
        <p className="mt-1">Available — no active load assigned to unit <EntityLinkOrTombstone kind="unit" id={unitId} name={unitNumber} noun="Unit" data-testid="available-unit-record-link" />.</p>
      </section>
    );
  }
  const customerId = currentLoad.customer_id ? String(currentLoad.customer_id) : null;
  const customerName = currentLoad.customer != null ? String(currentLoad.customer) : "—";
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <h3 className="text-xs font-semibold text-gray-800">Current load</h3>
      <p className="mt-1 text-xs">
        Load{" "}
        {currentLoad.load_id ? (
          <EntityLinkOrTombstone kind="load" id={String(currentLoad.load_id)} name={currentLoad.load_number} noun="Load" className="font-semibold text-slate-700 underline" data-testid="vp-current-load-link" />
        ) : (
          String(currentLoad.load_number)
        )}{" "}
        · {String(currentLoad.pickup ?? "?")} → {String(currentLoad.delivery ?? "?")}
      </p>
      <p className="text-xs text-gray-600">
        Customer:{" "}
        {customerId ? (
          <EntityLinkOrTombstone kind="customer" id={customerId} name={customerName} noun="Customer" className="font-semibold text-slate-700 underline" data-testid="vp-current-load-customer-link" />
        ) : (
          customerName
        )}{" "}
        · ETA {String(currentLoad.eta ?? "—")} · Status {String(currentLoad.status)}
      </p>
    </section>
  );
}

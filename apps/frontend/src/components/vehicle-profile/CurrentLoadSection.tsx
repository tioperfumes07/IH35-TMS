import { Link } from "react-router-dom";
import { Button } from "../Button";

export function CurrentLoadSection({
  currentLoad,
  unitId,
}: {
  currentLoad: Record<string, unknown> | null;
  unitId: string;
}) {
  if (!currentLoad) {
    return (
      <section className="rounded border border-dashed border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <h3 className="font-semibold text-gray-800">Current load</h3>
        <p className="mt-1">Available — no active load assigned to unit {unitId.slice(0, 8)}.</p>
      </section>
    );
  }
  return (
    <section className="rounded border border-gray-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-gray-800">Current load</h3>
      <p className="mt-1 text-sm">
        Load {String(currentLoad.load_number)} · {String(currentLoad.pickup ?? "?")} → {String(currentLoad.delivery ?? "?")}
      </p>
      <p className="text-xs text-gray-600">
        Customer: {String(currentLoad.customer ?? "—")} · ETA {String(currentLoad.eta ?? "—")} · Status {String(currentLoad.status)}
      </p>
      {currentLoad.load_id ? (
        <Link to={`/dispatch/loads/${String(currentLoad.load_id)}`}>
          <Button size="sm" className="mt-2">
            View load detail
          </Button>
        </Link>
      ) : null}
    </section>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { UseFormRegister } from "react-hook-form";
import { listUsers } from "../../../api/identity";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";

// render-v5 §header (maintenance-create-wo-render-v5.html) — the WO header fields that persist to LIVE
// maintenance.work_orders columns (migration 202606221200 / #1353): Status, Open date/time (opened_at),
// Authorized by (authorized_by_user_id), Repaired by, Authorization #, Service location. All real, all
// persisted post-insert. Fields whose DB column does NOT exist yet (Priority, Close date/time, Odometer/
// Engine-hrs Samsara) are intentionally NOT rendered here — no fabrication; they wait on a gated migration /
// a Samsara data source. §7 navy. Compact h-7 inputs to match the VMRS/asset-location sections.

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-0.5">
      <span className="font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const INPUT = "h-7 w-full rounded border border-gray-300 px-2";

export function CreateWOSectionRenderV5Header({ register }: { register: UseFormRegister<CreateWOFormValues> }) {
  const usersQuery = useQuery({
    queryKey: ["identity", "users", "wo-authorized-by"],
    queryFn: () => listUsers(false),
  });
  const users = usersQuery.data?.users ?? [];
  const userLabel = (u: { name?: string; first_name?: string | null; last_name?: string | null; email: string | null }) =>
    u.name?.trim() || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || "—";

  return (
    <section data-testid="wo-renderv5-header" className="rounded border border-slate-300 bg-white p-2 text-xs">
      <div className="mb-1 font-semibold text-[#1F2A44]">Work order header</div>
      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        <Cell label="Status">
          <select {...register("status")} className={INPUT}>
            <option value="open">Open</option>
            <option value="in_progress">In progress</option>
            <option value="waiting_parts">Awaiting parts</option>
            <option value="complete">Complete</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </Cell>
        <Cell label="Open date">
          <input type="date" {...register("open_date")} className={INPUT} />
        </Cell>
        <Cell label="Open time">
          <input type="time" {...register("open_time")} className={INPUT} />
        </Cell>
        <Cell label="Authorized by employees">
          <select {...register("authorized_by_user_id")} className={INPUT}>
            <option value="">— select —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)}
              </option>
            ))}
          </select>
        </Cell>
        <Cell label="Repaired by">
          <select {...register("repaired_by")} className={INPUT}>
            <option value="">— select —</option>
            <option value="in_house">In house</option>
            <option value="outside_vendor">Outside vendor</option>
          </select>
        </Cell>
        <Cell label="Authorization #">
          <input {...register("authorization_number")} className={INPUT} placeholder="Authorization #" />
        </Cell>
        <Cell label="Service location (mobile / roadside)">
          <select {...register("service_location_type")} className={INPUT}>
            <option value="">— select —</option>
            <option value="shop">Shop</option>
            <option value="mobile">Mobile</option>
            <option value="roadside">Roadside</option>
          </select>
        </Cell>
      </div>
    </section>
  );
}

import { useQuery } from "@tanstack/react-query";
import type { UseFormRegister, UseFormSetValue, UseFormWatch } from "react-hook-form";
import { listAssignableUsers } from "../../../api/identity";
import { DatePicker } from "../../../components/forms/DatePicker";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import type { CreateWOFormValues } from "./CreateWorkOrderModal";
import { useCompanyContext } from "../../../contexts/CompanyContext";

// render-v5 §header (maintenance-create-wo-render-v5.html) — the WO header fields that persist to LIVE
// maintenance.work_orders columns: Status, Priority (wo_priority, mig 0310 CHECK routine|urgent|immediate),
// Open date/time (opened_at), Authorized by (authorized_by_user_id), Repaired by, Authorization #, Service
// location (migration 202606221200 / #1353). All real, all persisted post-insert. Fields whose DB column
// does NOT exist yet (Close date/time, Odometer/Engine-hrs Samsara) are intentionally NOT rendered here —
// no fabrication; they wait on a gated migration / a Samsara data source. §7 navy. Compact h-7 inputs.

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-0.5">
      <span className="font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

const INPUT = "h-7 w-full rounded-sm border border-gray-300 px-2";

export function CreateWOSectionRenderV5Header({
  register,
  watch,
  setValue,
}: {
  register: UseFormRegister<CreateWOFormValues>;
  watch: UseFormWatch<CreateWOFormValues>;
  setValue: UseFormSetValue<CreateWOFormValues>;
}) {
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const usersQuery = useQuery({
    queryKey: ["identity", "users", "wo-authorized-by", operatingCompanyId],
    queryFn: ({ signal }) => listAssignableUsers(operatingCompanyId, signal),
    enabled: Boolean(operatingCompanyId),
  });
  const users = usersQuery.data?.users ?? [];
  const userLabel = (u: { name?: string; first_name?: string | null; last_name?: string | null; email: string | null }) =>
    u.name?.trim() || `${u.first_name ?? ""} ${u.last_name ?? ""}`.trim() || u.email || "—";

  return (
    <section data-testid="wo-renderv5-header" className="rounded-sm border border-slate-300 bg-white p-2 text-xs">
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
        <Cell label="Priority">
          {/* mig-0310 CHECK: stored value is exactly routine|urgent|immediate (display labels only). */}
          <select {...register("wo_priority")} className={INPUT}>
            <option value="">— select —</option>
            <option value="routine">Routine</option>
            <option value="urgent">Urgent</option>
            <option value="immediate">Immediate</option>
          </select>
        </Cell>
        <Cell label="Open date">
          <DatePicker value={watch("open_date") || ""} onChange={(v) => setValue("open_date", v, { shouldDirty: true })} className={INPUT} />
        </Cell>
        <Cell label="Open time">
          <input type="time" {...register("open_time")} className={INPUT} />
        </Cell>
        <Cell label="Close date">
          {/* W-FIX-8: render-v5 §A Close date/time → maintenance.work_orders.closed_at (existing column). */}
          <DatePicker value={watch("close_date") || ""} onChange={(v) => setValue("close_date", v, { shouldDirty: true })} className={INPUT} />
        </Cell>
        <Cell label="Close time">
          <input type="time" {...register("close_time")} className={INPUT} />
        </Cell>
        <Cell label="Authorized by employees">
          <SelectCombobox {...register("authorized_by_user_id")} className={INPUT}>
            <option value="">— select —</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {userLabel(u)}
              </option>
            ))}
          </SelectCombobox>
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

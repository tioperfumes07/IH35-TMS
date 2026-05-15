import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { createDriverTimeOffRequest, listDriverTimeOffRequests } from "../../api/driver";
import { ActionButton } from "../../components/shared/ActionButton";
import { useToast } from "../../components/Toast";

export function DriverTimeOffPage() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["driver", "time-off"], queryFn: listDriverTimeOffRequests });
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [type, setType] = useState<"vacation" | "sick" | "personal">("vacation");
  const [notes, setNotes] = useState("");

  const mu = useMutation({
    mutationFn: () => createDriverTimeOffRequest({ start_date: start, end_date: end, type, notes: notes || undefined }),
    onSuccess: async () => {
      pushToast("Request submitted", "success");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["driver", "time-off"] });
    },
    onError: () => pushToast("Request failed", "error"),
  });

  return (
    <div className="space-y-3 text-sm">
      <h2 className="text-base font-semibold">Time off</h2>
      <section className="rounded border border-slate-200 bg-white p-3">
        <h3 className="text-xs font-semibold uppercase text-slate-600">New request</h3>
        <label className="mt-1 block text-xs">
          Start
          <input type="date" className="mt-0.5 w-full rounded border" value={start} onChange={(e) => setStart(e.target.value)} />
        </label>
        <label className="mt-1 block text-xs">
          End
          <input type="date" className="mt-0.5 w-full rounded border" value={end} onChange={(e) => setEnd(e.target.value)} />
        </label>
        <label className="mt-1 block text-xs">
          Type
          <select className="mt-0.5 w-full rounded border" value={type} onChange={(e) => setType(e.target.value as typeof type)}>
            <option value="vacation">Vacation</option>
            <option value="sick">Sick</option>
            <option value="personal">Personal</option>
          </select>
        </label>
        <label className="mt-1 block text-xs">
          Notes
          <textarea className="mt-0.5 w-full rounded border" value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </label>
        <ActionButton className="mt-2" onClick={() => mu.mutate()} disabled={mu.isPending}>
          Submit
        </ActionButton>
      </section>
      <section>
        <h3 className="text-xs font-semibold uppercase text-slate-600">Past requests</h3>
        <ul className="mt-1 space-y-1">
          {(q.data?.requests ?? []).map((r) => (
            <li key={r.id} className="rounded border border-slate-100 px-2 py-1 text-xs">
              {r.start_date} → {r.end_date} · {r.type} · {r.status}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

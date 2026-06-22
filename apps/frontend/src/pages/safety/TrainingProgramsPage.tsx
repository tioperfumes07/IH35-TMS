import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyTrainingRecord,
  createTrainingProgram,
  getTrainingCompletions,
  type TrainingProgramCategory,
  type TrainingProgramFrequency,
} from "../../api/safety";
import { listDrivers } from "../../api/mdata";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";

type Props = {
  operatingCompanyId: string;
};

type ProgramRow = {
  id: string;
  name: string;
  category: string;
  frequency: string;
  passing_grade?: string | null;
};

function deriveProgramsFromCompletions(rows: Array<Record<string, unknown>>): ProgramRow[] {
  const byName = new Map<string, ProgramRow>();
  for (const row of rows) {
    const name = String(row.training_type ?? row.training_name ?? row.name ?? "").trim();
    if (!name || byName.has(name)) continue;
    byName.set(name, {
      id: String(row.id ?? name),
      name,
      category: String(row.category ?? "other"),
      frequency: String(row.frequency ?? "annual"),
      passing_grade: (row.passing_grade as string | null | undefined) ?? null,
    });
  }
  return Array.from(byName.values());
}

export function TrainingProgramsPage({ operatingCompanyId }: Props) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<ProgramRow | null>(null);
  const [name, setName] = useState("");
  const [category, setCategory] = useState<TrainingProgramCategory>("entry_level");
  const [frequency, setFrequency] = useState<TrainingProgramFrequency>("annual");
  const [recertifyMonths, setRecertifyMonths] = useState("12");
  const [passingGrade, setPassingGrade] = useState("");
  const [assignDriverIds, setAssignDriverIds] = useState<string[]>([]);
  const [sessionPrograms, setSessionPrograms] = useState<ProgramRow[]>([]);

  const completionsQuery = useQuery({
    queryKey: ["safety", "training-completions", operatingCompanyId],
    queryFn: () => getTrainingCompletions(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const driversQuery = useQuery({
    queryKey: ["mdata", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, status: "Active" }),
    enabled: Boolean(operatingCompanyId),
  });

  const programs = useMemo(() => {
    const derived = deriveProgramsFromCompletions(completionsQuery.data?.training_completions ?? []);
    const merged = new Map<string, ProgramRow>();
    for (const row of [...derived, ...sessionPrograms]) merged.set(row.name, row);
    return Array.from(merged.values());
  }, [completionsQuery.data?.training_completions, sessionPrograms]);

  const createMutation = useMutation({
    mutationFn: () =>
      createTrainingProgram(operatingCompanyId, {
        name: name.trim(),
        category,
        frequency: frequency === "n_month" ? "n_month" : frequency,
        passing_grade: passingGrade.trim() || undefined,
      }),
    onSuccess: (created) => {
      setSessionPrograms((current) => [
        ...current,
        {
          id: String(created.id ?? name),
          name: String(created.name ?? name),
          category: String(created.category ?? category),
          frequency: String(created.frequency ?? frequency),
          passing_grade: (created.passing_grade as string | null | undefined) ?? null,
        },
      ]);
      setCreateOpen(false);
      setName("");
      setPassingGrade("");
      void queryClient.invalidateQueries({ queryKey: ["safety"] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedProgram) return;
      const completedAt = new Date().toISOString();
      const expiryDate =
        frequency === "annual"
          ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
          : frequency === "n_month"
            ? new Date(Date.now() + Number(recertifyMonths || 12) * 30 * 24 * 60 * 60 * 1000)
                .toISOString()
                .slice(0, 10)
            : undefined;
      await Promise.all(
        assignDriverIds.map((driverId) =>
          createSafetyTrainingRecord(operatingCompanyId, {
            driver_id: driverId,
            training_name: selectedProgram.name,
            completed_at: completedAt,
            expiry_date: expiryDate,
            notes: "Assigned from training programs page",
          })
        )
      );
    },
    onSuccess: () => {
      setAssignOpen(false);
      setAssignDriverIds([]);
      setSelectedProgram(null);
      void queryClient.invalidateQueries({ queryKey: ["safety"] });
    },
  });

  return (
    <div className="space-y-3" data-testid="training-programs-page">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white px-3 py-2">
        <div>
          <div className="text-sm font-semibold text-slate-800">Training Programs</div>
          <div className="text-[11px] text-slate-500">Define required programs and assign drivers to completion tracking.</div>
        </div>
        <Button size="sm" data-testid="training-programs-create-btn" onClick={() => setCreateOpen(true)}>
          + Create Training Program
        </Button>
      </div>

      <div className="overflow-x-auto rounded border border-gray-200 bg-white">
        <table className="min-w-full text-xs" data-testid="training-programs-table">
          <thead className="bg-gray-50 text-[10px] uppercase text-slate-600">
            <tr>
              <th className="px-2 py-1 text-left">Program</th>
              <th className="px-2 py-1 text-left">Category</th>
              <th className="px-2 py-1 text-left">Recertify</th>
              <th className="px-2 py-1 text-left">Passing grade</th>
              <th className="px-2 py-1 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {programs.map((program) => (
              <tr key={program.id} className="border-t border-gray-100" data-testid={`training-program-row-${program.id}`}>
                <td className="px-2 py-1">{program.name}</td>
                <td className="px-2 py-1">{program.category.replace("_", " ")}</td>
                <td className="px-2 py-1">{program.frequency.replace("_", " ")}</td>
                <td className="px-2 py-1">{program.passing_grade ?? "—"}</td>
                <td className="px-2 py-1">
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    data-testid={`training-program-assign-${program.id}`}
                    onClick={() => {
                      setSelectedProgram(program);
                      setAssignOpen(true);
                    }}
                  >
                    Assign drivers
                  </button>
                </td>
              </tr>
            ))}
            {programs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-2 py-3 text-center text-slate-500">
                  No training programs found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create Training Program">
        <form
          className="space-y-3"
          data-testid="training-program-create-modal"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <label className="block text-xs text-slate-600">
            Program name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
              data-testid="training-program-name"
              required
            />
          </label>
          <label className="block text-xs text-slate-600">
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value as TrainingProgramCategory)}
              className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
              data-testid="training-program-category"
            >
              <option value="entry_level">Entry level</option>
              <option value="refresher">Refresher</option>
              <option value="remedial">Remedial</option>
              <option value="hazmat">Hazmat</option>
              <option value="other">Other</option>
            </select>
          </label>
          <label className="block text-xs text-slate-600">
            Recertify interval
            <select
              value={frequency}
              onChange={(event) => setFrequency(event.target.value as TrainingProgramFrequency)}
              className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
              data-testid="training-program-frequency"
            >
              <option value="one_time">One time</option>
              <option value="annual">Annual</option>
              <option value="n_month">Every N months</option>
            </select>
          </label>
          {frequency === "n_month" ? (
            <label className="block text-xs text-slate-600">
              Months
              <input
                type="number"
                min={1}
                max={60}
                value={recertifyMonths}
                onChange={(event) => setRecertifyMonths(event.target.value)}
                className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
                data-testid="training-program-months"
              />
            </label>
          ) : null}
          <label className="block text-xs text-slate-600">
            Passing grade (optional)
            <input
              value={passingGrade}
              onChange={(event) => setPassingGrade(event.target.value)}
              className="mt-1 block h-8 w-full rounded border border-gray-200 px-2 text-xs"
              data-testid="training-program-passing-grade"
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={createMutation.isPending} data-testid="training-program-submit">
              Create Training Program
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={assignOpen} onClose={() => setAssignOpen(false)} title="Assign Drivers">
        <form
          className="space-y-3"
          data-testid="training-program-assign-modal"
          onSubmit={(event) => {
            event.preventDefault();
            assignMutation.mutate();
          }}
        >
          <div className="text-xs text-slate-600">
            Program: <span className="font-semibold text-slate-800">{selectedProgram?.name ?? "—"}</span>
          </div>
          <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-gray-200 p-2">
            {(driversQuery.data?.drivers ?? []).map((driver) => (
              <label key={driver.id} className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={assignDriverIds.includes(driver.id)}
                  data-testid={`training-program-assign-driver-${driver.id}`}
                  onChange={() =>
                    setAssignDriverIds((current) =>
                      current.includes(driver.id) ? current.filter((id) => id !== driver.id) : [...current, driver.id]
                    )
                  }
                />
                {`${driver.first_name ?? ""} ${driver.last_name ?? ""}`.trim() || driver.id}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => setAssignOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={assignMutation.isPending}
              disabled={assignDriverIds.length === 0}
              data-testid="training-program-assign-submit"
            >
              Assign drivers
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default TrainingProgramsPage;

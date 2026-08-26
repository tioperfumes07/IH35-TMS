import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createSafetyTrainingRecord,
  createTrainingProgram,
  listTrainingPrograms,
  type TrainingProgram,
  type TrainingProgramCategory,
  type TrainingProgramFrequency,
} from "../../api/safety";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { useDriverLabels } from "../../hooks/useDriverLabels";
import { userFacingApiError } from "../../lib/api-error-message";
import { PageHeader } from "../../components/forms/shared/PageHeader";
import { Combobox } from "../../components/Combobox";

type Props = {
  operatingCompanyId: string;
};

type ProgramRow = TrainingProgram;

/** @matrix-built modules=safety cols=driver,connectivity,reverse_link,qbo_chrome */

function addUtcMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next.toISOString().slice(0, 10);
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
  const [assignPick, setAssignPick] = useState<string | null>(null);
  const companyGenerationRef = useRef(0);

  const programsQuery = useQuery({
    queryKey: ["safety", "training-programs", operatingCompanyId],
    queryFn: () => listTrainingPrograms(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const { byId: driverNameById } = useDriverLabels(operatingCompanyId, assignDriverIds);

  const addAssignDriver = (driverId: string | null) => {
    if (!driverId) {
      setAssignPick(null);
      return;
    }
    setAssignDriverIds((current) => (current.includes(driverId) ? current : [...current, driverId]));
    setAssignPick(null);
  };

  const programs = programsQuery.data?.training_programs ?? [];

  const createMutation = useMutation({
    mutationFn: (input: {
      companyId: string;
      generation: number;
      payload: Parameters<typeof createTrainingProgram>[1];
    }) => createTrainingProgram(input.companyId, input.payload),
    onSuccess: (_created, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      setCreateOpen(false);
      setName("");
      setPassingGrade("");
      void queryClient.invalidateQueries({ queryKey: ["safety", "training-programs", input.companyId] });
    },
  });

  const assignMutation = useMutation({
    mutationFn: async (input: {
      companyId: string;
      generation: number;
      program: ProgramRow;
      driverIds: string[];
      completedAt: string;
    }) => {
      const { program } = input;
      const expiryDate =
        program.frequency === "annual"
          ? addUtcMonths(new Date(input.completedAt), 12)
          : program.frequency === "n_month" && program.recertify_months
            ? addUtcMonths(new Date(input.completedAt), program.recertify_months)
            : undefined;
      await Promise.all(
        input.driverIds.map((driverId) =>
          createSafetyTrainingRecord(input.companyId, {
            driver_id: driverId,
            training_name: program.name,
            completed_at: input.completedAt,
            expiry_date: expiryDate,
            notes: "Assigned from training programs page",
          })
        )
      );
    },
    onSuccess: (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      setAssignOpen(false);
      setAssignDriverIds([]);
      setAssignPick(null);
      setSelectedProgram(null);
      void queryClient.invalidateQueries({ queryKey: ["safety", "training-completions", input.companyId] });
    },
  });

  const closeCreate = () => {
    companyGenerationRef.current += 1;
    createMutation.reset();
    setCreateOpen(false);
    setName("");
    setCategory("entry_level");
    setFrequency("annual");
    setRecertifyMonths("12");
    setPassingGrade("");
  };

  const closeAssign = () => {
    companyGenerationRef.current += 1;
    assignMutation.reset();
    setAssignOpen(false);
    setAssignDriverIds([]);
    setAssignPick(null);
    setSelectedProgram(null);
  };

  useEffect(() => {
    companyGenerationRef.current += 1;
    createMutation.reset();
    assignMutation.reset();
    setCreateOpen(false);
    setAssignOpen(false);
    setSelectedProgram(null);
    setName("");
    setCategory("entry_level");
    setFrequency("annual");
    setRecertifyMonths("12");
    setPassingGrade("");
    setAssignDriverIds([]);
    setAssignPick(null);
  }, [operatingCompanyId]);

  // Migrated to the shared QBO-parity grid — columns, order, and the per-row "Assign drivers"
  // action are preserved verbatim (§7 additive-only).
  const programColumns: Array<ParityColumn<ProgramRow>> = [
    { key: "name", label: "Program", sortable: true },
    { key: "category", label: "Category", sortable: true, render: (p) => p.category.replace("_", " ") },
    {
      key: "frequency",
      label: "Recertify",
      sortable: true,
      render: (p) =>
        p.frequency === "n_month" && p.recertify_months
          ? `Every ${p.recertify_months} months`
          : p.frequency.replace("_", " "),
    },
    { key: "passing_grade", label: "Passing grade", render: (p) => p.passing_grade ?? "—" },
    {
      key: "action",
      label: "Action",
      render: (p) => (
        <button
          type="button"
          className="text-slate-700 underline"
          data-testid={`training-program-assign-${p.id}`}
          onClick={() => {
            setSelectedProgram(p);
            setAssignOpen(true);
          }}
        >
          Assign drivers
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-3" data-testid="training-programs-page">
      {/*
        UI-BACK-BUTTON-MISSING-ENTIRELY: alias-tab leaf (part of the systemwide route-manifest audit,
        wave 4) -- SafetyLayout wraps every /safety/* route but renders no header of its own, so each
        leaf is responsible for its own. This one had a bespoke title bar with no back control.
      */}
      <PageHeader
        title="Training Programs"
        subtitle="Define required programs and assign drivers to completion tracking."
        breadcrumb={[{ label: "Safety" }, { label: "Training Programs" }]}
        backHref="/safety"
        actions={
          <Button size="sm" data-testid="training-programs-create-btn" onClick={() => setCreateOpen(true)}>
            + Create Training Program
          </Button>
        }
      />

      {/* CLS-LIST-ERROR-STATE-UNGUARDED: a failed query fell through to emptyText "No training programs found." — an outage
          presenting as a carrier with no driver training on record. */}
      {programsQuery.isError ? (
        <ListErrorState
          title="Couldn't load training programs"
          status={0}
          message={(programsQuery.error as Error)?.message}
          onRetry={() => void programsQuery.refetch()}
        />
      ) : (
      <ParityTable<ProgramRow>
        columns={programColumns}
        rows={programs}
        rowKey={(p) => p.id}
        loading={programsQuery.isLoading}
        emptyText="No training programs found."
        storageKey="safety-training-programs"
        exportFilename="training-programs"
        tableTestId="training-programs-table"
        rowTestId={(p) => `training-program-row-${p.id}`}
      />
      )}

      <Modal variant="drawer" open={createOpen} onClose={closeCreate} title="Create Training Program">
        <form
          className="space-y-3"
          data-testid="training-program-create-modal"
          onSubmit={(event) => {
            event.preventDefault();
            const companyId = operatingCompanyId;
            createMutation.mutate({
              companyId,
              generation: companyGenerationRef.current,
              payload: {
                name: name.trim(),
                category,
                frequency,
                recertify_months: frequency === "n_month" ? Number(recertifyMonths) : undefined,
                passing_grade: passingGrade.trim() || undefined,
              },
            });
          }}
        >
          <label className="block text-xs text-slate-600">
            Program name
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="mt-1 block h-8 w-full rounded-sm border border-gray-200 px-2 text-xs"
              data-testid="training-program-name"
              required
            />
          </label>
          <div className="block text-xs text-slate-600">
            <label htmlFor="training-program-category">Category</label>
            <Combobox
              id="training-program-category"
              dataTestId="training-program-category"
              options={[
                { value: "entry_level", label: "Entry level" },
                { value: "refresher", label: "Refresher" },
                { value: "remedial", label: "Remedial" },
                { value: "hazmat", label: "Hazmat" },
                { value: "other", label: "Other" },
              ]}
              value={category}
              onChange={(next) => next && setCategory(next as TrainingProgramCategory)}
              className="mt-1"
              placeholder="Select category"
            />
          </div>
          <div className="block text-xs text-slate-600">
            <label htmlFor="training-program-frequency">Recertify interval</label>
            <Combobox
              id="training-program-frequency"
              dataTestId="training-program-frequency"
              options={[
                { value: "one_time", label: "One time" },
                { value: "annual", label: "Annual" },
                { value: "n_month", label: "Every N months" },
              ]}
              value={frequency}
              onChange={(next) => next && setFrequency(next as TrainingProgramFrequency)}
              className="mt-1"
              placeholder="Select recertification interval"
            />
          </div>
          {frequency === "n_month" ? (
            <label className="block text-xs text-slate-600">
              Months
              <input
                type="number"
                min={1}
                max={60}
                value={recertifyMonths}
                onChange={(event) => setRecertifyMonths(event.target.value)}
                className="mt-1 block h-8 w-full rounded-sm border border-gray-200 px-2 text-xs"
                data-testid="training-program-months"
              />
            </label>
          ) : null}
          <label className="block text-xs text-slate-600">
            Passing grade (optional)
            <input
              value={passingGrade}
              onChange={(event) => setPassingGrade(event.target.value)}
              className="mt-1 block h-8 w-full rounded-sm border border-gray-200 px-2 text-xs"
              data-testid="training-program-passing-grade"
            />
          </label>
          {createMutation.isError && createMutation.variables?.generation === companyGenerationRef.current ? (
            <p className="text-xs text-red-700" data-testid="training-program-create-error">
              {userFacingApiError(createMutation.error, "Could not create the training program.")}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={closeCreate}>
              Cancel
            </Button>
            <Button type="submit" size="sm" loading={createMutation.isPending} data-testid="training-program-submit">
              Create Training Program
            </Button>
          </div>
        </form>
      </Modal>

      <Modal open={assignOpen} onClose={closeAssign} title="Assign Drivers">
        <form
          className="space-y-3"
          data-testid="training-program-assign-modal"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selectedProgram) return;
            assignMutation.mutate({
              companyId: operatingCompanyId,
              generation: companyGenerationRef.current,
              program: selectedProgram,
              driverIds: [...assignDriverIds],
              completedAt: new Date().toISOString(),
            });
          }}
        >
          <div className="text-xs text-slate-600">
            Program: <span className="font-semibold text-slate-800">{selectedProgram?.name ?? "—"}</span>
          </div>
          <div className="text-xs font-semibold text-slate-600">Drivers</div>
          {/* Picker law: EntityPicker kind=driver — server search; nested create. */}
          <div data-testid="training-program-driver-search">
            <EntityPicker
              kind="driver"
              operatingCompanyId={operatingCompanyId}
              value={assignPick}
              onChange={addAssignDriver}
              nestedInDrawer
              enabled={assignOpen}
              placeholder="Search drivers…"
              dataTestId="training-program-driver-picker"
            />
          </div>
          {assignDriverIds.length > 0 ? (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-sm border border-gray-200 p-2">
              {assignDriverIds.map((driverId) => (
                <li
                  key={driverId}
                  className="flex items-center justify-between gap-2 text-xs text-slate-700"
                  data-testid={`training-program-assign-driver-${driverId}`}
                >
                  <EntityLink
                    kind="driver"
                    id={driverId}
                    label={entityLabel(driverNameById.get(driverId), driverId, "Driver")}
                  />
                  <button
                    type="button"
                    className="text-slate-600 underline"
                    onClick={() =>
                      setAssignDriverIds((current) => current.filter((id) => id !== driverId))
                    }
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {assignMutation.isError && assignMutation.variables?.generation === companyGenerationRef.current ? (
            <p className="text-xs text-red-700" data-testid="training-program-assign-error">
              {userFacingApiError(assignMutation.error, "Could not assign drivers to the program.")}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={closeAssign}>
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

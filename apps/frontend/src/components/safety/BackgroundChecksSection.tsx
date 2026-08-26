import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSafetyBackgroundCheck, listSafetyBackgroundChecks, type SafetyBackgroundCheckRow } from "../../api/safety";
import { Button } from "../Button";
import { DatePicker } from "../forms/DatePicker";
import { DriverPickerWithCreate } from "../drivers/DriverPickerWithCreate";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorBanner } from "../shared/ListErrorBanner";
import { Modal } from "../Modal";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { Combobox } from "../Combobox";
import { companyToday } from "../../lib/businessDate";
import { formatDateUS } from "../../lib/formatDate";
import { entityLabel } from "../../lib/entity-label";

const CHECK_TYPES = [
  { value: "mvr", label: "Motor vehicle record" },
  { value: "psp", label: "PSP" },
  { value: "drug", label: "Drug & alcohol" },
  { value: "employment_verify", label: "Employment verification" },
] as const;

/** @matrix-built modules=safety cols=driver,connectivity,reverse_link */
export function BackgroundChecksSection({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId?: string }) {
  const queryClient = useQueryClient();
  const companyGenerationRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState(driverId ?? "");
  const [checkType, setCheckType] = useState<SafetyBackgroundCheckRow["check_type"]>("mvr");
  const [result, setResult] = useState<SafetyBackgroundCheckRow["result"]>("pass");
  const [checkedAt, setCheckedAt] = useState(companyToday());
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const [attemptClose, setAttemptClose] = useState<() => void>(() => () => {});

  const query = useQuery({
    queryKey: ["safety", "background-checks", operatingCompanyId, driverId ?? "all"],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => listSafetyBackgroundChecks(operatingCompanyId, driverId),
  });
  const createMutation = useMutation({
    mutationFn: (input: {
      companyId: string;
      generation: number;
      driverId: string;
      checkType: SafetyBackgroundCheckRow["check_type"];
      result: SafetyBackgroundCheckRow["result"];
      checkedAt: string;
      expiryDate: string;
      notes: string;
    }) => createSafetyBackgroundCheck(input.companyId, {
      driver_id: input.driverId,
      check_type: input.checkType,
      result: input.result,
      checked_at: new Date(`${input.checkedAt}T12:00:00`).toISOString(),
      expiry_date: input.expiryDate || undefined,
      notes: input.notes.trim() || undefined,
    }),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      companyGenerationRef.current += 1;
      setOpen(false);
      setSelectedDriverId(driverId ?? "");
      setCheckType("mvr");
      setResult("pass");
      setCheckedAt(companyToday());
      setExpiryDate("");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["safety", "background-checks", input.companyId] });
    },
  });
  useEffect(() => {
    companyGenerationRef.current += 1;
    createMutation.reset();
    setOpen(false);
    setSelectedDriverId(driverId ?? "");
    setCheckType("mvr");
    setResult("pass");
    setCheckedAt(companyToday());
    setExpiryDate("");
    setNotes("");
  }, [operatingCompanyId, driverId]);

  const closeCreate = () => {
    if (createMutation.isPending) return;
    setOpen(false);
  };
  const isCreateDirty = selectedDriverId !== (driverId ?? "")
    || checkType !== "mvr"
    || result !== "pass"
    || checkedAt !== companyToday()
    || Boolean(expiryDate)
    || Boolean(notes.trim());

  const columns: Array<ParityColumn<SafetyBackgroundCheckRow>> = [
    { key: "checked_at", label: "Checked", sortable: true, render: (row) => formatDateUS(row.checked_at) },
    ...(driverId ? [] : [{ key: "driver_name", label: "Driver", render: (row: SafetyBackgroundCheckRow) => <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} /> }]),
    { key: "check_type", label: "Check", sortable: true, render: (row) => CHECK_TYPES.find((type) => type.value === row.check_type)?.label ?? row.check_type },
    { key: "result", label: "Result", sortable: true, render: (row) => <span className={row.result === "pass" ? "text-slate-700" : "text-red-700"}>{row.result}</span> },
    { key: "expiry_date", label: "Expires", sortable: true, render: (row) => row.expiry_date ? formatDateUS(row.expiry_date) : "—" },
  ];

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4" data-testid="background-checks-section">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Background & MVR checks</h2>
          <p className="mt-1 text-xs text-slate-600">Company-scoped driver screening history and expirations.</p>
        </div>
        <Button size="sm" onClick={() => { setSelectedDriverId(driverId ?? ""); setOpen(true); }}>+ Add check</Button>
      </div>
      <div className="mt-3">
        {query.isError ? <ListErrorBanner message="Background checks could not be loaded." onRetry={() => void query.refetch()} /> : (
          <ParityTable<SafetyBackgroundCheckRow>
            rows={query.data?.background_checks ?? []}
            columns={columns}
            rowKey={(row) => row.id}
            loading={query.isLoading}
            emptyText="No background checks found."
            storageKey={driverId ? "driver-background-checks" : "safety-background-checks"}
          />
        )}
      </div>
      <Modal variant="drawer" open={open} onClose={closeCreate} title="Add background check" confirmDiscardOnClose isDirty={isCreateDirty} onRegisterAttemptClose={setAttemptClose}>
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate({
            companyId: operatingCompanyId,
            generation: companyGenerationRef.current,
            driverId: selectedDriverId,
            checkType,
            result,
            checkedAt,
            expiryDate,
            notes,
          });
        }}>
          <label className="block text-xs text-slate-600">Driver
            <div className="mt-1"><DriverPickerWithCreate operatingCompanyId={operatingCompanyId} value={selectedDriverId || null} onChange={(next) => setSelectedDriverId(next ?? "")} open={open} placeholder="Select driver" dataField="background-check-driver" /></div>
          </label>
          <label className="block text-xs text-slate-600">Check type
            <Combobox className="mt-1" options={CHECK_TYPES.map((item) => ({ ...item }))} value={checkType} onChange={(next) => next && setCheckType(next as SafetyBackgroundCheckRow["check_type"])} />
          </label>
          <label className="block text-xs text-slate-600">Result
            <Combobox className="mt-1" options={[{ value: "pass", label: "Pass" }, { value: "fail", label: "Fail" }]} value={result} onChange={(next) => next && setResult(next as SafetyBackgroundCheckRow["result"])} />
          </label>
          <div className="block text-xs text-slate-600"><label htmlFor="background-check-checked-date">Checked date</label><DatePicker id="background-check-checked-date" className="mt-1 w-full" value={checkedAt} onChange={setCheckedAt} /></div>
          <div className="block text-xs text-slate-600"><label htmlFor="background-check-expiry-date">Expiry date (optional)</label><DatePicker id="background-check-expiry-date" className="mt-1 w-full" value={expiryDate} onChange={setExpiryDate} /></div>
          <label className="block text-xs text-slate-600">Notes<textarea className="mt-1 min-h-16 w-full rounded-sm border border-gray-200 px-2 py-1 text-xs" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          {createMutation.isError && createMutation.variables?.generation === companyGenerationRef.current ? <p className="text-xs text-red-700">The check could not be saved. Confirm the driver belongs to this company and try again.</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="secondary" onClick={attemptClose} disabled={createMutation.isPending}>Cancel</Button><Button type="submit" size="sm" loading={createMutation.isPending} disabled={!selectedDriverId}>Save check</Button></div>
        </form>
      </Modal>
    </section>
  );
}

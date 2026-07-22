import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createSafetyFine } from "../../../api/safety";
import { listDrivers } from "../../../api/mdata";
import { Button } from "../../../components/Button";
import { Combobox } from "../../../components/Combobox";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { DatePicker } from "../../../components/forms/DatePicker";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { CreateDriverModal } from "../../../components/drivers/CreateDriverModal";
import { companyToday } from "../../../lib/businessDate";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onCreated: () => void;
};

export function FineCreateModal({ open, operatingCompanyId, onClose, onCreated }: Props) {
  const [subjectType, setSubjectType] = useState<"driver" | "company">("driver");
  const [subjectDriverId, setSubjectDriverId] = useState<string | null>(null);
  const [issuedByAuthority, setIssuedByAuthority] = useState("DOT");
  const [jurisdiction, setJurisdiction] = useState("");
  const [violationDescription, setViolationDescription] = useState("");
  const [issuedDate, setIssuedDate] = useState(companyToday());
  const [amountUsd, setAmountUsd] = useState("");
  const [notes, setNotes] = useState("");
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);

  const driversQuery = useQuery({
    queryKey: ["safety", "fine-create", "drivers", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, status: "Active", limit: 200 }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const driverOptions = useMemo(
    () =>
      (driversQuery.data?.drivers ?? []).map((d) => ({
        value: d.id,
        label: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || d.id,
      })),
    [driversQuery.data]
  );

  const createMutation = useMutation({
    mutationFn: () =>
      createSafetyFine(operatingCompanyId, {
        subject_type: subjectType,
        subject_driver_id: subjectType === "driver" ? subjectDriverId || null : null,
        issued_by_authority: issuedByAuthority,
        jurisdiction: jurisdiction || null,
        violation_description: violationDescription,
        issued_date: issuedDate,
        amount_cents: Math.round(Number(amountUsd || 0) * 100),
        notes: notes || null,
      }),
    onSuccess: () => {
      onCreated();
      onClose();
    },
  });

  return (
    <>
      <ParityDrawer
        open={open}
        onClose={onClose}
        title="Create Fine"
        size="wide"
        footer={
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" form="safety-fine-create-form" loading={createMutation.isPending}>
              Create Fine
            </Button>
          </div>
        }
      >
        <form
          id="safety-fine-create-form"
          className="space-y-3"
          data-testid="safety-fine-create-drawer"
          onSubmit={(event) => {
            event.preventDefault();
            createMutation.mutate();
          }}
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Subject type</label>
              <SelectCombobox
                value={subjectType}
                onChange={(event) => setSubjectType(event.target.value as "driver" | "company")}
                className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
              >
                <option value="driver">Driver</option>
                <option value="company">Company</option>
              </SelectCombobox>
            </div>
            {subjectType === "driver" ? (
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-gray-600">Driver *</label>
                <Combobox
                  options={driverOptions}
                  value={subjectDriverId}
                  onChange={setSubjectDriverId}
                  placeholder="Select driver"
                  loading={driversQuery.isLoading}
                  allowAddNew={{
                    label: "+ Create driver",
                    onAdd: () => setDriverCreateOpen(true),
                  }}
                />
              </div>
            ) : null}
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Issued by authority</label>
              <input
                value={issuedByAuthority}
                onChange={(event) => setIssuedByAuthority(event.target.value)}
                className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Jurisdiction</label>
              <input
                value={jurisdiction}
                onChange={(event) => setJurisdiction(event.target.value)}
                className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">Violation description</label>
              <input
                value={violationDescription}
                onChange={(event) => setViolationDescription(event.target.value)}
                className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
                required
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Issued date</label>
              <DatePicker
                value={issuedDate}
                onChange={setIssuedDate}
                className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Amount USD</label>
              <MoneyInput
                valueDollars={amountUsd ? Number(amountUsd) : null}
                onChangeDollars={(d) => setAmountUsd(d == null ? "" : String(d))}
                ariaLabel="Amount USD"
              />
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">Notes</label>
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
                rows={2}
              />
            </div>
          </div>
          {createMutation.isError ? (
            <p className="text-xs text-red-700">{(createMutation.error as Error)?.message ?? "Create failed"}</p>
          ) : null}
        </form>
      </ParityDrawer>

      <CreateDriverModal
        open={driverCreateOpen}
        companyId={operatingCompanyId}
        onClose={() => setDriverCreateOpen(false)}
        onCreated={(driverId) => {
          setSubjectDriverId(driverId);
          setDriverCreateOpen(false);
          void driversQuery.refetch();
        }}
      />
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createSafetyMedicalCard, listSafetyMedicalCards, type SafetyMedicalCardRow } from "../../api/safety";
import { Button } from "../Button";
import { DriverPickerWithCreate } from "../drivers/DriverPickerWithCreate";
import { DatePicker } from "../forms/DatePicker";
import { Modal } from "../Modal";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorBanner } from "../shared/ListErrorBanner";
import { companyToday } from "../../lib/businessDate";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";

/** @matrix-built modules=safety cols=driver,connectivity,reverse_link */
export function MedicalCardsHistorySection({ operatingCompanyId, driverId }: { operatingCompanyId: string; driverId?: string }) {
  const queryClient = useQueryClient();
  const companyGenerationRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState(driverId ?? "");
  const [cardNumber, setCardNumber] = useState("");
  const [issuedDate, setIssuedDate] = useState(companyToday());
  const [expiryDate, setExpiryDate] = useState("");
  const [notes, setNotes] = useState("");
  const query = useQuery({
    queryKey: ["safety", "medical-cards", operatingCompanyId, driverId ?? "all"],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => listSafetyMedicalCards(operatingCompanyId, driverId),
  });
  const createMutation = useMutation({
    mutationFn: (input: {
      companyId: string;
      generation: number;
      driverId: string;
      cardNumber: string;
      issuedDate: string;
      expiryDate: string;
      notes: string;
    }) => createSafetyMedicalCard(input.companyId, {
      driver_id: input.driverId,
      card_number: input.cardNumber.trim(),
      issued_date: input.issuedDate,
      expiry_date: input.expiryDate,
      notes: input.notes.trim() || undefined,
    }),
    onSuccess: async (_result, input) => {
      if (input.generation !== companyGenerationRef.current) return;
      setOpen(false);
      setCardNumber("");
      setExpiryDate("");
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["safety", "medical-cards", input.companyId] });
    },
  });
  useEffect(() => {
    companyGenerationRef.current += 1;
    createMutation.reset();
    setOpen(false);
    setSelectedDriverId(driverId ?? "");
    setCardNumber("");
    setIssuedDate(companyToday());
    setExpiryDate("");
    setNotes("");
  }, [operatingCompanyId, driverId]);
  const columns: Array<ParityColumn<SafetyMedicalCardRow>> = [
    ...(driverId ? [] : [{ key: "driver_name", label: "Driver", render: (row: SafetyMedicalCardRow) => <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} /> }]),
    { key: "card_number", label: "Card number", sortable: true },
    { key: "issued_date", label: "Issued", sortable: true, render: (row) => formatDateUS(row.issued_date) },
    { key: "expiry_date", label: "Expires", sortable: true, render: (row) => formatDateUS(row.expiry_date) },
    { key: "expiry_pill", label: "Status", sortable: true, render: (row) => <span className={row.expiry_pill === "red" ? "text-red-700" : "text-slate-700"}>{row.expiry_pill === "red" ? "Expired" : row.days_to_expiry == null ? "Unknown" : `${row.days_to_expiry} days`}</span> },
  ];
  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4" data-testid="medical-cards-history-section">
      <div className="flex items-center justify-between gap-2">
        <div><h2 className="text-sm font-semibold text-slate-900">DOT medical card history</h2><p className="mt-1 text-xs text-slate-600">Canonical active cards with company-scoped driver linkage.</p></div>
        <Button size="sm" onClick={() => { setSelectedDriverId(driverId ?? ""); setOpen(true); }}>+ Add card</Button>
      </div>
      <div className="mt-3">
        {query.isError ? <ListErrorBanner message="Medical card history could not be loaded." onRetry={() => void query.refetch()} /> : <ParityTable<SafetyMedicalCardRow> rows={query.data?.cards ?? []} columns={columns} rowKey={(row) => row.id} loading={query.isLoading} emptyText="No medical cards found." storageKey={driverId ? "driver-medical-cards" : "safety-medical-cards"} />}
      </div>
      <Modal variant="drawer" open={open} onClose={() => setOpen(false)} title="Add DOT medical card">
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          createMutation.mutate({
            companyId: operatingCompanyId,
            generation: companyGenerationRef.current,
            driverId: selectedDriverId,
            cardNumber,
            issuedDate,
            expiryDate,
            notes,
          });
        }}>
          <label className="block text-xs text-slate-600">Driver<div className="mt-1"><DriverPickerWithCreate operatingCompanyId={operatingCompanyId} value={selectedDriverId || null} onChange={(next) => setSelectedDriverId(next ?? "")} open={open} placeholder="Select driver" dataField="medical-card-driver" /></div></label>
          <label className="block text-xs text-slate-600">Card number<input required className="mt-1 h-12 min-h-12 w-full rounded-sm border border-gray-200 px-2 text-xs" value={cardNumber} onChange={(event) => setCardNumber(event.target.value)} /></label>
          <div className="block text-xs text-slate-600"><label htmlFor="medical-card-issued-date">Issued date</label><DatePicker id="medical-card-issued-date" className="mt-1 w-full" value={issuedDate} onChange={setIssuedDate} /></div>
          <div className="block text-xs text-slate-600"><label htmlFor="medical-card-expiry-date">Expiry date</label><DatePicker id="medical-card-expiry-date" className="mt-1 w-full" value={expiryDate} onChange={setExpiryDate} /></div>
          <label className="block text-xs text-slate-600">Notes<textarea className="mt-1 min-h-16 w-full rounded-sm border border-gray-200 px-2 py-1 text-xs" value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
          {createMutation.isError && createMutation.variables?.generation === companyGenerationRef.current ? <p className="text-xs text-red-700">The card could not be saved. Confirm the driver belongs to this company and try again.</p> : null}
          <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" size="sm" loading={createMutation.isPending} disabled={!selectedDriverId || !cardNumber.trim() || !issuedDate || !expiryDate}>Save card</Button></div>
        </form>
      </Modal>
    </section>
  );
}

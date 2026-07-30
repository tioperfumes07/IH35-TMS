import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createSafetyFine } from "../../../api/safety";
import { listDrivers, listUnits } from "../../../api/mdata";
import { listCivilFineTypes } from "../../../api/catalogs-safety";
import { confirmUpload, requestUploadUrl } from "../../../api/docs";
import { listDispatchLoads } from "../../../api/dispatch";
import { Button } from "../../../components/Button";
import { Combobox } from "../../../components/Combobox";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
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
  // SAF-B14: catalogs.civil_fine_types (57 live rows) was reachable ONLY from its own list page — no
  // creator consumed it, so every fine was typed by hand and `safety.civil_fines.violation_code` (a
  // column the create route has always accepted) was never populated. Free text cannot be grouped,
  // counted, or matched to an FMCSA code, which is the whole reason the catalog exists.
  const [civilFineTypeId, setCivilFineTypeId] = useState<string | null>(null);
  const [violationDescription, setViolationDescription] = useState("");
  const [issuedDate, setIssuedDate] = useState(companyToday());
  const [amountUsd, setAmountUsd] = useState("");
  const [notes, setNotes] = useState("");
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);
  const [sourceDocFile, setSourceDocFile] = useState<File | null>(null);
  // SAF-B29: every picker below fetched limit:200 with NO server-side search, so past 200 drivers,
  // units or loads the rest were unselectable and nothing said so — a silent truncation on a record
  // that becomes a payable. The term goes to the server, which already supports `search`.
  const [driverSearch, setDriverSearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [loadSearch, setLoadSearch] = useState("");
  // SAF-F19: safety.civil_fines has carried related_load_id / related_unit_id / source_doc_id since
  // migration 0050, and the CREATE ROUTE already accepts all three — the creator simply never asked
  // for them, so every fine landed with those FKs null. An overweight ticket that belongs to a
  // specific load and truck was stored as if it belonged to nothing.
  const [relatedLoadId, setRelatedLoadId] = useState<string | null>(null);
  const [relatedUnitId, setRelatedUnitId] = useState<string | null>(null);

  const driversQuery = useQuery({
    queryKey: ["safety", "fine-create", "drivers", operatingCompanyId, driverSearch],
    queryFn: () =>
      listDrivers({
        operating_company_id: operatingCompanyId,
        status: "Active",
        limit: 200,
        search: driverSearch || undefined,
      }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const unitsQuery = useQuery({
    queryKey: ["safety", "fine-create", "units", operatingCompanyId, unitSearch],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, limit: 200, search: unitSearch || undefined }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const loadsQuery = useQuery({
    queryKey: ["safety", "fine-create", "loads", operatingCompanyId, loadSearch],
    queryFn: () =>
      listDispatchLoads({
        operating_company_id: operatingCompanyId,
        view: "loads",
        status: [],
        limit: 200,
        offset: 0,
        search: loadSearch || undefined,
      }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const unitOptions = useMemo(
    () =>
      ((unitsQuery.data?.units ?? []) as Array<Record<string, unknown>>).map((u) => ({
        value: String(u.id ?? ""),
        label: String(u.unit_number ?? u.id ?? ""),
      })),
    [unitsQuery.data]
  );

  const loadOptions = useMemo(
    () =>
      ((loadsQuery.data?.loads ?? []) as Array<Record<string, unknown>>).map((l) => ({
        value: String(l.id ?? ""),
        label: String(l.load_number ?? l.reference ?? l.id ?? ""),
      })),
    [loadsQuery.data]
  );

  const civilFineTypesQuery = useQuery({
    queryKey: ["safety", "fine-create", "civil-fine-types", operatingCompanyId],
    queryFn: () => listCivilFineTypes(operatingCompanyId, { limit: 200, is_active: "true" }),
    enabled: open && Boolean(operatingCompanyId),
  });

  const civilFineTypeRows = civilFineTypesQuery.data?.rows ?? [];

  const civilFineTypeOptions = useMemo(
    () =>
      civilFineTypeRows.map((row) => ({
        value: row.id,
        label: row.display_name,
        sublabel: row.code,
      })),
    [civilFineTypeRows]
  );

  function applyFineType(id: string | null, displayNameOverride?: string) {
    setCivilFineTypeId(id);
    if (!id) return;
    const label = displayNameOverride ?? civilFineTypeRows.find((row) => row.id === id)?.display_name;
    // The catalog seeds the description; it stays editable so the officer can add the specifics of
    // THIS ticket (mile marker, axle, reading) without losing the coded type.
    if (label && !violationDescription.trim()) setViolationDescription(label);
  }

  const driverOptions = useMemo(
    () =>
      (driversQuery.data?.drivers ?? []).map((d) => ({
        value: d.id,
        label: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || d.id,
      })),
    [driversQuery.data]
  );

  // SAF-B18: `safety.civil_fines.source_doc_id` FKs docs.files and has been accepted by the create
  // route since it was written (fines.routes.ts:37,205,224) — and NO UI ever collected it, so every
  // fine was filed with no citation image. That is not a cosmetic gap: the same column is carried
  // onto the LIABILITY the fine spawns (fines.routes.ts:391), so the payable an auditor, insurer or
  // attorney reads had no supporting document behind it. The evidence is uploaded FIRST so the fine
  // is never created pointing at a file that failed to land.
  const uploadSourceDoc = async (): Promise<string | null> => {
    if (!sourceDocFile) return null;
    const { file_id, presigned_url } = await requestUploadUrl({
      original_filename: sourceDocFile.name,
      mime_type: sourceDocFile.type || "application/octet-stream",
      size_bytes: sourceDocFile.size,
      // File under the VIEWED company, not the uploader's default (backend fallback files it under
      // the lowest-UUID company the user can access, and the scoped read then 404s).
      operating_company_id: operatingCompanyId || undefined,
      // docs.file_links has no "fine" entity type, so the citation is filed under the entities it
      // concerns — that is what makes it reachable FROM the driver/unit/load document lists. The
      // fine->document direction is the source_doc_id FK below.
      entity_links: [
        ...(subjectType === "driver" && subjectDriverId
          ? [{ entity_type: "driver" as const, entity_id: subjectDriverId }]
          : []),
        ...(relatedUnitId ? [{ entity_type: "unit" as const, entity_id: relatedUnitId }] : []),
        ...(relatedLoadId ? [{ entity_type: "load" as const, entity_id: relatedLoadId }] : []),
      ],
    });
    const put = await fetch(presigned_url, {
      method: "PUT",
      headers: { "Content-Type": sourceDocFile.type || "application/octet-stream" },
      body: sourceDocFile,
    });
    if (!put.ok) throw new Error(`Citation upload failed (${put.status}). The fine was not created.`);
    await confirmUpload(file_id);
    return file_id;
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const sourceDocId = await uploadSourceDoc();
      return createSafetyFine(operatingCompanyId, {
        subject_type: subjectType,
        subject_driver_id: subjectType === "driver" ? subjectDriverId || null : null,
        issued_by_authority: issuedByAuthority,
        jurisdiction: jurisdiction || null,
        // SAF-B14: the coded type, not just the prose. `violation_code` has been in the create route's
        // schema since it was written and arrived NULL on every fine because nothing sent it.
        violation_code: civilFineTypeRows.find((row) => row.id === civilFineTypeId)?.code ?? null,
        // LST-LINK-02: the FK itself, not just the code. catalogs.civil_fine_types had ZERO inbound
        // foreign keys, so the category was a copied string nothing could join or rename safely.
        civil_fine_type_id: civilFineTypeId,
        violation_description: violationDescription,
        issued_date: issuedDate,
        amount_cents: Math.round(Number(amountUsd || 0) * 100),
        // SAF-F19: the route has always accepted these; nothing was collecting them.
        related_load_id: relatedLoadId || null,
        related_unit_id: relatedUnitId || null,
        source_doc_id: sourceDocId,
        notes: notes || null,
      });
    },
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
                  onSearch={setDriverSearch}
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
              <label className="text-xs font-semibold text-gray-600">Violation type</label>
              {/*
                LST-PICKER-01: Combobox allowAddNew with a side-channel mutate is not VERIFY-2 —
                inline create must be the FIRST ROW via ReferenceSelect → CatalogQuickCreateDrawer,
                POST catalogs.civil_fine_types (same table listCivilFineTypes reads).
              */}
              <ReferenceSelect
                value={civilFineTypeId}
                onChange={(value) => applyFineType(value)}
                options={civilFineTypeOptions.map((o) => ({ value: o.value, label: o.label, type: o.sublabel }))}
                createKind="civil_fine_type"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select a violation type"
                loading={civilFineTypesQuery.isLoading}
                onOptionCreated={(opt) => {
                  applyFineType(opt.value, opt.label);
                  void civilFineTypesQuery.refetch();
                }}
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
              <label className="text-xs font-semibold text-gray-600">Related unit</label>
              <Combobox
                options={unitOptions}
                value={relatedUnitId}
                onChange={setRelatedUnitId}
                onSearch={setUnitSearch}
                placeholder="Select unit"
                loading={unitsQuery.isLoading}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Related load</label>
              <Combobox
                options={loadOptions}
                value={relatedLoadId}
                onChange={setRelatedLoadId}
                onSearch={setLoadSearch}
                placeholder="Select load"
                loading={loadsQuery.isLoading}
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
            {/* SAF-B18: the citation image. Optional to attach, but when one IS attached the fine
                refuses to be created if the upload fails — a payable whose supporting document
                silently went missing is worse than one an operator knows to re-attach. */}
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-semibold text-gray-600" htmlFor="fine-source-doc">
                Citation / ticket document
              </label>
              <input
                id="fine-source-doc"
                type="file"
                data-testid="fine-source-doc-input"
                className="rounded-sm border border-gray-300 px-2 py-1 text-[13px]"
                onChange={(event) => setSourceDocFile(event.target.files?.[0] ?? null)}
              />
              {sourceDocFile ? (
                <span className="text-[11px] text-slate-500" data-testid="fine-source-doc-name">
                  {sourceDocFile.name} — filed under the driver, unit and load selected above.
                </span>
              ) : null}
              {createMutation.isError ? (
                <span className="text-[11px] text-[#dc2626]" data-testid="fine-create-error">
                  {createMutation.error instanceof Error ? createMutation.error.message : "Could not create the fine."}
                </span>
              ) : null}
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

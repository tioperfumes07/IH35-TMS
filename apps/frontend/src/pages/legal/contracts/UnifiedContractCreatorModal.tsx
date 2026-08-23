import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { Button } from "../../../components/Button";
import { Combobox } from "../../../components/Combobox";
import { DatePicker } from "../../../components/forms/DatePicker";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";
import { legalContractsApi, type LegalContractLanguage, type LegalSignerType } from "../../../api/legal-contracts";
import { legalTemplatesApi, type LegalTemplateSummary } from "../../../api/legal-templates";
import { getDriver, getVendor, getCustomerDetail } from "../../../api/mdata";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { useListState } from "../../../components/list-state";
import { userFacingApiError } from "../../../lib/api-error-message";
import { entityLabel } from "../../../lib/entity-label";
import { normalizePickedEntityPhoneToE164 } from "../../../lib/phone-format";
import { LegalTemplateNewModal } from "../templates/LegalTemplateNewModal";

// Unified bilingual contract creator (Lease / NDA / Policy / any active category).
// Flow: doc category -> template+version (active) -> EN/ES -> fill from variable_schema
// -> party picker (driver/employee/customer/unit) -> Preview DRAFT (no instance) or
// Create & send for e-signature. Reuses the existing create/send + draft-preview API.

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: (contractId: string) => void | Promise<void>;
};

const SIGNER_TYPES: Array<{ value: LegalSignerType; label: string }> = [
  { value: "driver", label: "Driver" },
  { value: "employee", label: "Employee (user)" },
  { value: "customer", label: "Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other / manual" },
];

export function UnifiedContractCreatorModal({ open, operatingCompanyId, onClose, onSaved }: Props) {
  const { pushToast } = useToast();
  const [step, setStep] = useState(1);
  const [category, setCategory] = useState("");
  const [templateCode, setTemplateCode] = useState("");
  const [language, setLanguage] = useState<LegalContractLanguage>("en");
  const [filled, setFilled] = useState<Record<string, string>>({});
  const [signerType, setSignerType] = useState<LegalSignerType>("driver");
  const [signerEntityId, setSignerEntityId] = useState<string>("");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [leaseUnitIds, setLeaseUnitIds] = useState<string[]>([]);
  const [leaseElection, setLeaseElection] = useState<"option_a_fmv" | "option_b_payoff" | "">("");
  // LV-LEGAL-CONTRACT-CREATE-TEMPLATE-PICKER-NO-ADD-FIRST — nested create via canonical LegalTemplateNewModal.
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      setStep(1);
      setCategory("");
      setTemplateCode("");
      setLanguage("en");
      setFilled({});
      setSignerType("driver");
      setSignerEntityId("");
      setSignerName("");
      setSignerEmail("");
      setSignerPhone("");
      setLeaseUnitIds([]);
      setLeaseElection("");
      setCreateTemplateOpen(false);
    }
  }, [open]);

  const templatesQuery = useQuery({
    queryKey: ["legal", "templates", "active", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => legalTemplatesApi.list({ operating_company_id: operatingCompanyId, status: "active" }),
  });
  const activeTemplates: LegalTemplateSummary[] = Array.isArray(templatesQuery.data?.templates)
    ? templatesQuery.data.templates
    : [];

  // Safety net: when this entity has zero active templates (library never provisioned), offer a
  // one-click seed reusing the existing ensure-library mutation, instead of a silent empty picker.
  const seedLibraryMutation = useMutation({
    mutationFn: () => legalContractsApi.ensureLibrary(operatingCompanyId),
    onSuccess: async (res) => {
      pushToast(`Standard library ready — ${res.inserted} added, ${res.already_present} already present.`, "success");
      await templatesQuery.refetch();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Seed failed"), "error"),
  });
  const noActiveTemplates =
    Boolean(operatingCompanyId) && !templatesQuery.isLoading && !templatesQuery.isError && activeTemplates.length === 0;

  const categories = useMemo(
    () => Array.from(new Set(activeTemplates.map((t) => t.category))).sort(),
    [activeTemplates]
  );
  const templatesInCategory = useMemo(
    () => activeTemplates.filter((t) => !category || t.category === category),
    [activeTemplates, category]
  );
  const selectedTemplate = useMemo(
    () => activeTemplates.find((t) => t.template_code === templateCode) ?? null,
    [activeTemplates, templateCode]
  );

  // Variable schema for the chosen template (full detail).
  const detailQuery = useQuery({
    queryKey: ["legal", "template", "detail", operatingCompanyId, selectedTemplate?.id],
    enabled: open && Boolean(operatingCompanyId && selectedTemplate?.id),
    queryFn: () => legalTemplatesApi.get(String(selectedTemplate?.id), operatingCompanyId),
  });
  const fields = detailQuery.data?.variable_schema?.fields ?? {};

  const unitsQuery = useQuery({
    queryKey: ["legal", "party", "units", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId) && selectedTemplate?.category === "lease",
    queryFn: () => legalContractsApi.leaseToOwnFleet({ operating_company_id: operatingCompanyId }),
  });

  const isLease = selectedTemplate?.category === "lease";
  const leaseUnits = unitsQuery.data?.units ?? [];
  // Eligible-units empty message renders only once the units query settles (no first-fetch flash).
  const leaseUnitsListState = useListState(unitsQuery, leaseUnits.length === 0);

  // Merge schema fields with lease-only handoff payload (Exhibit-A units + ASC 842
  // election) that FIN-22 reads off filled_variables. Legal stores it; Finance classifies.
  const buildFilledVariables = (): Record<string, unknown> => ({
    ...filled,
    ...(isLease ? { exhibit_a_unit_ids: leaseUnitIds, asc842_election: leaseElection || "unspecified" } : {}),
  });

  const ndaSuggestion = signerType === "driver" ? "nda_ebt_confidentiality" : null;

  const missingRequired = useMemo(
    () =>
      Object.entries(fields)
        .filter(([, def]) => def.required)
        .filter(([name]) => !String(filled[name] ?? "").trim())
        .map(([name]) => name),
    [fields, filled]
  );

  const previewMutation = useMutation({
    mutationFn: () =>
      legalContractsApi.draftPreview(operatingCompanyId, {
        template_code: templateCode,
        language,
        filled_variables: buildFilledVariables(),
      }),
    onSuccess: (res) => {
      const win = window.open("", "_blank", "noopener,noreferrer,width=900,height=1100");
      if (win) {
        win.document.open();
        win.document.write(res.html);
        win.document.close();
      } else {
        pushToast("Allow pop-ups to preview the draft.", "info");
      }
    },
    onError: (error) => pushToast(userFacingApiError(error, "Preview failed"), "error"),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const created = await legalContractsApi.create(operatingCompanyId, {
        template_code: templateCode,
        signer_type: signerType,
        signer_entity_id: signerEntityId || undefined,
        signer_name: signerName.trim(),
        signer_email: signerEmail.trim() || undefined,
        signer_phone: signerPhone.trim() || undefined,
        language,
        filled_variables: buildFilledVariables(),
      });
      const deliveryChannel = signerEmail.trim() ? "email" : signerPhone.trim() ? "sms" : null;
      if (deliveryChannel) {
        await legalContractsApi.send(created.id, operatingCompanyId, {
          verification_channel: deliveryChannel === "sms" ? "sms" : "email",
          delivery_channel: deliveryChannel,
        });
      }
      return { created, sent: Boolean(deliveryChannel) };
    },
    onSuccess: async ({ created, sent }) => {
      pushToast(sent ? "Contract created and sent for signature" : "Contract draft created", "success");
      await onSaved(created.id);
      onClose();
    },
    onError: (error) => pushToast(userFacingApiError(error, "Create failed"), "error"),
  });

  if (!open) return null;

  const canGoStep2 = Boolean(templateCode);
  const canGoStep3 = canGoStep2 && missingRequired.length === 0;
  const canSubmit = canGoStep3 && signerName.trim().length >= 2 && (signerType === "other" || Boolean(signerEntityId));

  return (
    <>
    <ParityDrawer open={open} onClose={onClose} title="Create contract" size="wide">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1 text-xs">
          {["Template", "Fill", "Party & sign"].map((label, i) => (
            <span
              key={label}
              className={`rounded-sm px-2 py-1 ${step === i + 1 ? "bg-[#1f2a44] text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            {noActiveTemplates ? (
              <div className="rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <div className="font-semibold text-slate-800">No active templates for this entity yet.</div>
                <p className="mt-0.5 text-xs text-slate-600">
                  The standard contract library (lease &amp; NDA templates) has not been provisioned for this
                  operating company. Seed it once to enable the template picker below.
                </p>
                <div className="mt-2">
                  <Button
                    size="sm"
                    loading={seedLibraryMutation.isPending}
                    onClick={() => seedLibraryMutation.mutate()}
                  >
                    Seed standard library
                  </Button>
                </div>
              </div>
            ) : null}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Document category</span>
              <SelectCombobox
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setTemplateCode("");
                }}
                className="w-full"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectCombobox>
            </label>

            <label className="flex flex-col gap-1 text-sm" data-testid="legal-contract-create-template-picker">
              <span className="font-semibold text-slate-700">Template (active versions)</span>
              <Combobox
                value={templateCode || null}
                onChange={(next) => setTemplateCode(next ?? "")}
                options={templatesInCategory.map((t) => ({
                  value: t.template_code,
                  label: `${t.display_name_en} (v${t.version}${t.requires_witness ? " · witness" : ""})`,
                }))}
                placeholder="Select a template…"
                loading={templatesQuery.isLoading}
                allowAddNew={{
                  label: "+ Add new template",
                  onAdd: () => setCreateTemplateOpen(true),
                }}
              />
            </label>

            {ndaSuggestion && category === "employment" ? (
              <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                Suggested for drivers: confidentiality-only NDA (<code>nda_ebt_confidentiality</code>). Office roles
                are eligible for a full non-compete version. Suggestion only.
              </div>
            ) : null}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Language</span>
              <SelectCombobox
                value={language}
                onChange={(e) => setLanguage(e.target.value as LegalContractLanguage)}
                className="w-full"
              >
                <option value="en">English (controls)</option>
                <option value="es">Español (traducción certificada pendiente)</option>
              </SelectCombobox>
            </label>
            {language === "es" ? (
              <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                Spanish body is a pending-translation placeholder; English controls until a certified translation is
                recorded. Do not execute a driver-facing Spanish contract before then.
              </div>
            ) : null}

            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button disabled={!canGoStep2} onClick={() => setStep(2)}>
                Next
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="text-xs text-slate-500">
              {selectedTemplate?.display_name_en} · v{selectedTemplate?.version}
            </div>
            {Object.keys(fields).length === 0 ? (
              <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1.5 text-[13px] text-slate-600">
                This template has no fill-in fields. Continue to the party step.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(fields).map(([name, def]) => (
                  <label key={name} className="flex flex-col gap-1 text-sm">
                    <span className="font-semibold text-slate-700">
                      {name.replace(/_/g, " ")}
                      {def.required ? <span className="text-crit"> *</span> : null}
                    </span>
                    {def.type === "date" ? (
                      <DatePicker
                        value={filled[name] ?? ""}
                        onChange={(value) => setFilled((prev) => ({ ...prev, [name]: value }))}
                        className=""
                        placeholder={def.description ?? ""}
                      />
                    ) : (
                      <input
                        type={def.type === "number" ? "number" : "text"}
                        value={filled[name] ?? ""}
                        onChange={(e) => setFilled((prev) => ({ ...prev, [name]: e.target.value }))}
                        className="rounded-sm border border-slate-300 px-2 py-1"
                        placeholder={def.description ?? ""}
                      />
                    )}
                  </label>
                ))}
              </div>
            )}
            {isLease ? (
              <div className="space-y-2 rounded-sm border border-slate-200 bg-slate-50 p-2">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Exhibit A — units & ASC 842 election (handed to Finance / FIN-22)
                </div>
                <div className="text-xs text-slate-600">
                  Lessor is IH 35 Trucking, LLC. Select the units this lease covers. Legal links the units and the
                  election to the signed lease; the Finance lease subledger (FIN-22) computes classification, schedule,
                  and any GL — Legal posts nothing.
                </div>
                <div className="max-h-36 space-y-1 overflow-auto rounded-sm border border-slate-200 bg-white p-2">
                  {leaseUnitsListState.isEmpty ? (
                    <div className="text-xs text-slate-500">No eligible units found for this entity.</div>
                  ) : (
                    leaseUnits.map((u) => (
                      <label key={u.id} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={leaseUnitIds.includes(u.id)}
                          onChange={(e) =>
                            setLeaseUnitIds((prev) =>
                              e.target.checked ? [...prev, u.id] : prev.filter((x) => x !== u.id)
                            )
                          }
                        />
                        <span>
                          {u.unit_number} · {u.year ?? ""} {u.make ?? ""} {u.model ?? ""}
                          <span className="ml-1 font-mono text-[10px] text-slate-400">{u.vin}</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap gap-3 text-xs">
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="asc842"
                      checked={leaseElection === "option_a_fmv"}
                      onChange={() => setLeaseElection("option_a_fmv")}
                    />
                    Option A — FMV purchase (operating)
                  </label>
                  <label className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="asc842"
                      checked={leaseElection === "option_b_payoff"}
                      onChange={() => setLeaseElection("option_b_payoff")}
                    />
                    Option B — fixed payoff (sales-type)
                  </label>
                </div>
                <div className="text-[11px] text-slate-500">
                  The election guides the CPA's ASC 842 classification per deal; FIN-22 confirms and posts.
                </div>
              </div>
            ) : null}
            {missingRequired.length > 0 ? (
              <div className="text-xs text-crit">Required: {missingRequired.join(", ")}</div>
            ) : null}
            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep(1)}>
                Back
              </Button>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  loading={previewMutation.isPending}
                  onClick={() => previewMutation.mutate()}
                >
                  Preview DRAFT
                </Button>
                <Button disabled={!canGoStep3} onClick={() => setStep(3)}>
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Signer type</span>
              <SelectCombobox
                value={signerType}
                onChange={(e) => {
                  setSignerType(e.target.value as LegalSignerType);
                  setSignerEntityId("");
                }}
                className="w-full"
              >
                {SIGNER_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </SelectCombobox>
            </label>

            {(signerType === "driver" || signerType === "customer" || signerType === "vendor") && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">
                  Select {signerType}
                  <span className="text-crit"> *</span>
                </span>
                {signerType === "driver" ? (
                  <DriverPickerWithCreate
                    operatingCompanyId={operatingCompanyId}
                    value={signerEntityId || null}
                    open={open}
                    shell="drawer"
                    placeholder="Select driver…"
                    onChange={(id) => {
                      setSignerEntityId(id ?? "");
                      if (!id) {
                        setSignerName("");
                        setSignerEmail("");
                        setSignerPhone("");
                        return;
                      }
                      // SAF-B29 / CLS-SILENT-CAP: hydrate signer fields via getDriver — never a silent
                      // listDrivers(limit:200) roster that hides drivers past page 1 (DriverPickerWithCreate
                      // already server-searches the picker; this lookup must not reintroduce the cap).
                      void getDriver(id, operatingCompanyId)
                        .then((d) => {
                          setSignerName(`${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || id);
                          setSignerEmail(d.email ?? "");
                          // LEGAL-F5988 — mdata.drivers.phone is not uniformly E.164 (bulk CSV import
                          // bypasses that invariant); normalize so an auto-filled value can't fail the
                          // backend's strict E.164 signer_phone check the operator never typed.
                          setSignerPhone(normalizePickedEntityPhoneToE164(d.phone));
                        })
                        .catch(() => {
                          /* Picker validated the id; leave contact fields for manual entry if fetch fails. */
                        });
                    }}
                  />
                ) : signerType === "customer" ? (
                  /* CLS-SILENT-CAP: EntityPicker server-search — no capped listCustomers roster. */
                  <EntityPicker
                    kind="customer"
                    allowCreate
                    nestedInDrawer
                    operatingCompanyId={operatingCompanyId}
                    value={signerEntityId || null}
                    onChange={(id, option) => {
                      setSignerEntityId(id ?? "");
                      if (!id) {
                        setSignerName("");
                        setSignerEmail("");
                        setSignerPhone("");
                        return;
                      }
                      if (option?.label) setSignerName(option.label);
                      void getCustomerDetail(id, operatingCompanyId).then(({ customer }) => {
                        setSignerName(entityLabel(customer.name, customer.id, "Customer"));
                        setSignerEmail(customer.email ?? customer.ar_email ?? "");
                        // LEGAL-F5988 — see driver picker above; customer phone/office_phone are equally
                        // not guaranteed E.164.
                        setSignerPhone(normalizePickedEntityPhoneToE164(customer.phone ?? customer.office_phone));
                      });
                    }}
                    enabled={open}
                    placeholder="Search customer…"
                    dataField="unified-contract-customer-signer"
                    className="w-full"
                  />
                ) : (
                  /* CLS-SILENT-CAP: EntityPicker server-search — no capped listVendors roster. */
                  <EntityPicker
                    kind="vendor"
                    allowCreate
                    nestedInDrawer
                    operatingCompanyId={operatingCompanyId}
                    value={signerEntityId || null}
                    onChange={(id, option) => {
                      setSignerEntityId(id ?? "");
                      if (!id) {
                        setSignerName("");
                        setSignerEmail("");
                        setSignerPhone("");
                        return;
                      }
                      if (option?.label) setSignerName(option.label);
                      void getVendor(id, operatingCompanyId).then((vendor) => {
                        setSignerName(vendor.name);
                        setSignerEmail(vendor.email ?? "");
                        // LEGAL-F5988 — see driver picker above; vendor phone is equally not guaranteed
                        // E.164.
                        setSignerPhone(normalizePickedEntityPhoneToE164(vendor.phone));
                      });
                    }}
                    enabled={open}
                    placeholder="Search vendor…"
                    dataField="unified-contract-vendor-signer"
                    className="w-full"
                  />
                )}
              </label>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Signer name *</span>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="rounded-sm border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Signer email</span>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  className="rounded-sm border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Signer phone (+E.164)</span>
                <input
                  value={signerPhone}
                  onChange={(e) => setSignerPhone(e.target.value)}
                  className="rounded-sm border border-slate-300 px-2 py-1"
                  placeholder="+15551234567"
                />
              </label>
            </div>

            {selectedTemplate?.category === "lease" && (unitsQuery.data?.units?.length ?? 0) === 0 ? (
              <div className="rounded-sm border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-700">
                A Trucking-seller lease requires the units titled to IH 35 Trucking, LLC first. Exhibit A units are
                linked to the lease after signature (handed to the Finance lease subledger).
              </div>
            ) : null}

            <div className="text-xs text-slate-500">
              Email/phone present → the contract is sent for e-signature on create; otherwise it is saved as a draft.
            </div>

            <div className="flex justify-between gap-2">
              <Button variant="secondary" onClick={() => setStep(2)}>
                Back
              </Button>
              <Button disabled={!canSubmit} loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
                {signerEmail.trim() || signerPhone.trim() ? "Create & send" : "Create draft"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </ParityDrawer>
    <LegalTemplateNewModal
      open={createTemplateOpen}
      onClose={() => setCreateTemplateOpen(false)}
      onCreate={async (draft) => {
        const created = await legalTemplatesApi.create(operatingCompanyId, draft);
        await templatesQuery.refetch();
        setTemplateCode(created.template_code);
        if (created.category) setCategory(created.category);
        pushToast(`Template ${created.template_code} created`, "success");
      }}
    />
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Modal } from "../../../components/Modal";
import { Button } from "../../../components/Button";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useToast } from "../../../components/Toast";
import { legalContractsApi, type LegalContractLanguage, type LegalSignerType } from "../../../api/legal-contracts";
import { legalTemplatesApi, type LegalTemplateSummary } from "../../../api/legal-templates";
import { listDrivers, listCustomers } from "../../../api/mdata";

// Unified bilingual contract creator (Lease / NDA / Policy / any active category).
// Flow: doc category -> template+version (active) -> EN/ES -> fill from variable_schema
// -> party picker (driver/employee/customer/unit) -> Preview DRAFT (no instance) or
// Create & send for e-signature. Reuses the existing create/send + draft-preview API.

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
};

type Party = { id: string; label: string; email?: string | null; phone?: string | null };

const SIGNER_TYPES: Array<{ value: LegalSignerType; label: string }> = [
  { value: "driver", label: "Driver" },
  { value: "employee", label: "Employee (user)" },
  { value: "customer", label: "Customer" },
  { value: "vendor", label: "Vendor" },
  { value: "other", label: "Other / manual" },
];

// Role-driven NDA suggestion (suggestion only, never a hard lock).
function suggestedNdaForRole(role: string): string | null {
  const r = role.toLowerCase();
  if (r === "driver") return "nda_ebt_confidentiality";
  if (["dispatcher", "safety", "administrator", "accountant", "sales", "manager", "owner"].includes(r)) {
    return "nda_polished_full";
  }
  return null;
}

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
    }
  }, [open]);

  const templatesQuery = useQuery({
    queryKey: ["legal", "templates", "active", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () => legalTemplatesApi.list({ operating_company_id: operatingCompanyId, status: "active" }),
  });
  const activeTemplates: LegalTemplateSummary[] = templatesQuery.data?.templates ?? [];

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

  // Party source per signer type.
  const driversQuery = useQuery({
    queryKey: ["legal", "party", "drivers", operatingCompanyId],
    enabled: open && signerType === "driver" && Boolean(operatingCompanyId),
    // limit:200 — the driver list defaults to 50 (newest-first) and silently drops the rest.
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId, limit: 200 }),
  });
  const customersQuery = useQuery({
    queryKey: ["legal", "party", "customers", operatingCompanyId],
    enabled: open && signerType === "customer" && Boolean(operatingCompanyId),
    queryFn: () => listCustomers({ operating_company_id: operatingCompanyId }),
  });
  const unitsQuery = useQuery({
    queryKey: ["legal", "party", "units", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId) && selectedTemplate?.category === "lease",
    queryFn: () => legalContractsApi.leaseToOwnFleet({ operating_company_id: operatingCompanyId }),
  });

  const partyOptions: Party[] = useMemo(() => {
    if (signerType === "driver") {
      return (driversQuery.data?.drivers ?? []).map((d) => ({
        id: String(d.id),
        label: `${d.first_name ?? ""} ${d.last_name ?? ""}`.trim() || String(d.id),
        email: (d as { email?: string | null }).email ?? null,
        phone: (d as { phone?: string | null }).phone ?? null,
      }));
    }
    if (signerType === "customer") {
      return (customersQuery.data?.customers ?? []).map((c) => ({
        id: String(c.id),
        label: (c as { customer_name?: string }).customer_name ?? String(c.id),
        email: (c as { email?: string | null }).email ?? null,
        phone: (c as { phone?: string | null }).phone ?? null,
      }));
    }
    return [];
  }, [signerType, driversQuery.data, customersQuery.data]);

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
        filled_variables: filled,
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
    onError: (error) => pushToast(String((error as Error).message || "Preview failed"), "error"),
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
        filled_variables: filled,
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
    onSuccess: async ({ sent }) => {
      pushToast(sent ? "Contract created and sent for signature" : "Contract draft created", "success");
      await onSaved();
      onClose();
    },
    onError: (error) => pushToast(String((error as Error).message || "Create failed"), "error"),
  });

  if (!open) return null;

  const canGoStep2 = Boolean(templateCode);
  const canGoStep3 = canGoStep2 && missingRequired.length === 0;
  const canSubmit = canGoStep3 && signerName.trim().length >= 2 && (signerType === "other" || signerEntityId || signerType === "vendor");

  return (
    <Modal open={open} onClose={onClose} title="Create contract">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-1 text-xs">
          {["Template", "Fill", "Party & sign"].map((label, i) => (
            <span
              key={label}
              className={`rounded px-2 py-1 ${step === i + 1 ? "bg-[#1f2a44] text-white" : "bg-slate-100 text-slate-600"}`}
            >
              {i + 1}. {label}
            </span>
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Document category</span>
              <SelectCombobox
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setTemplateCode("");
                }}
                className="h-9 rounded border border-slate-300 px-2 text-sm"
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </SelectCombobox>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Template (active versions)</span>
              <SelectCombobox
                value={templateCode}
                onChange={(e) => setTemplateCode(e.target.value)}
                className="h-9 rounded border border-slate-300 px-2 text-sm"
              >
                <option value="">Select a template…</option>
                {templatesInCategory.map((t) => (
                  <option key={t.id} value={t.template_code}>
                    {t.display_name_en} (v{t.version}{t.requires_witness ? " · witness" : ""})
                  </option>
                ))}
              </SelectCombobox>
            </label>

            {ndaSuggestion && category === "employment" ? (
              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                Suggested for drivers: confidentiality-only NDA (<code>nda_ebt_confidentiality</code>). Office roles
                are eligible for a full non-compete version. Suggestion only.
              </div>
            ) : null}

            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-slate-700">Language</span>
              <SelectCombobox
                value={language}
                onChange={(e) => setLanguage(e.target.value as LegalContractLanguage)}
                className="h-9 rounded border border-slate-300 px-2 text-sm"
              >
                <option value="en">English (controls)</option>
                <option value="es">Español (traducción certificada pendiente)</option>
              </SelectCombobox>
            </label>
            {language === "es" ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
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
              <div className="rounded border border-slate-200 bg-slate-50 px-2 py-2 text-sm text-slate-600">
                This template has no fill-in fields. Continue to the party step.
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2">
                {Object.entries(fields).map(([name, def]) => (
                  <label key={name} className="flex flex-col gap-1 text-sm">
                    <span className="font-semibold text-slate-700">
                      {name.replace(/_/g, " ")}
                      {def.required ? <span className="text-[#dc2626]"> *</span> : null}
                    </span>
                    <input
                      type={def.type === "date" ? "date" : def.type === "number" ? "number" : "text"}
                      value={filled[name] ?? ""}
                      onChange={(e) => setFilled((prev) => ({ ...prev, [name]: e.target.value }))}
                      className="rounded border border-slate-300 px-2 py-1"
                      placeholder={def.description ?? ""}
                    />
                  </label>
                ))}
              </div>
            )}
            {missingRequired.length > 0 ? (
              <div className="text-xs text-[#dc2626]">Required: {missingRequired.join(", ")}</div>
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
                className="h-9 rounded border border-slate-300 px-2 text-sm"
              >
                {SIGNER_TYPES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </SelectCombobox>
            </label>

            {(signerType === "driver" || signerType === "customer") && (
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">
                  Select {signerType}
                  <span className="text-[#dc2626]"> *</span>
                </span>
                <SelectCombobox
                  value={signerEntityId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setSignerEntityId(id);
                    const p = partyOptions.find((x) => x.id === id);
                    if (p) {
                      setSignerName(p.label);
                      setSignerEmail(p.email ?? "");
                      setSignerPhone(p.phone ?? "");
                    }
                  }}
                  className="h-9 rounded border border-slate-300 px-2 text-sm"
                >
                  <option value="">Select…</option>
                  {partyOptions.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </SelectCombobox>
              </label>
            )}

            <div className="grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Signer name *</span>
                <input
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Signer email</span>
                <input
                  type="email"
                  value={signerEmail}
                  onChange={(e) => setSignerEmail(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-semibold text-slate-700">Signer phone (+E.164)</span>
                <input
                  value={signerPhone}
                  onChange={(e) => setSignerPhone(e.target.value)}
                  className="rounded border border-slate-300 px-2 py-1"
                  placeholder="+15551234567"
                />
              </label>
            </div>

            {selectedTemplate?.category === "lease" && (unitsQuery.data?.units?.length ?? 0) === 0 ? (
              <div className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
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
    </Modal>
  );
}

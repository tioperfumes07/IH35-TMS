import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { legalContractsApi } from "../../../api/legal-contracts";
import { legalTemplatesApi, type LegalTemplateSummary } from "../../../api/legal-templates";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onSent: () => Promise<void> | void;
};

type VariableRow = {
  key: string;
  value: string;
};

const STEPS = [
  "Pick template",
  "Pick signer",
  "Fill variables",
  "Review draft",
  "Send channels",
] as const;

export function SendContractModal({ open, operatingCompanyId, onClose, onSent }: Props) {
  const { pushToast } = useToast();
  const [stepIdx, setStepIdx] = useState(0);
  const [templateId, setTemplateId] = useState("");
  const [signerType, setSignerType] = useState<"driver" | "employee" | "customer" | "vendor" | "other">("driver");
  const [signerName, setSignerName] = useState("");
  const [signerEmail, setSignerEmail] = useState("");
  const [signerPhone, setSignerPhone] = useState("");
  const [language, setLanguage] = useState<"en" | "es" | "bilingual">("en");
  const [variableRows, setVariableRows] = useState<VariableRow[]>([]);
  const [verifyChannel, setVerifyChannel] = useState<"none" | "sms" | "email">("none");
  const [sendEmail, setSendEmail] = useState(true);
  const [sendSms, setSendSms] = useState(false);
  const [sendWhatsapp, setSendWhatsapp] = useState(false);
  const [customMessage, setCustomMessage] = useState("");

  const templatesQuery = useQuery({
    queryKey: ["legal", "send-modal", "templates", operatingCompanyId],
    enabled: open && Boolean(operatingCompanyId),
    queryFn: () =>
      legalTemplatesApi.list({
        operating_company_id: operatingCompanyId,
        status: "active",
      }),
  });

  const templates = templatesQuery.data?.templates ?? [];
  const selectedTemplate = useMemo(
    () => templates.find((row) => row.id === templateId) ?? null,
    [templateId, templates]
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!templateId) throw new Error("Template is required");
      if (!signerName.trim()) throw new Error("Signer name is required");
      if (!sendEmail && !sendSms && !sendWhatsapp) throw new Error("Select at least one delivery channel");

      const filledVariables = variableRows.reduce<Record<string, unknown>>((acc, row) => {
        const key = row.key.trim();
        if (!key) return acc;
        acc[key] = row.value;
        return acc;
      }, {});

      const created = await legalContractsApi.create(operatingCompanyId, {
        template_id: templateId,
        signer_type: signerType,
        signer_name: signerName.trim(),
        signer_email: signerEmail.trim() || undefined,
        signer_phone: signerPhone.trim() || undefined,
        language,
        filled_variables: filledVariables,
      });

      const channels: Array<"email" | "sms" | "whatsapp"> = [];
      if (sendEmail) channels.push("email");
      if (sendSms) channels.push("sms");
      if (sendWhatsapp) channels.push("whatsapp");
      for (const delivery of channels) {
        await legalContractsApi.send(created.id, operatingCompanyId, {
          verification_channel: verifyChannel,
          delivery_channel: delivery,
          custom_message: customMessage.trim() || undefined,
        });
      }
      return created;
    },
    onSuccess: async () => {
      pushToast("Contract created and sent", "success");
      await onSent();
      onClose();
      setStepIdx(0);
      setTemplateId("");
      setSignerName("");
      setSignerEmail("");
      setSignerPhone("");
      setVariableRows([]);
      setCustomMessage("");
      setSendEmail(true);
      setSendSms(false);
      setSendWhatsapp(false);
      setVerifyChannel("none");
    },
    onError: (error) => {
      pushToast(String((error as Error).message || "Failed to send contract"), "error");
    },
  });

  const canGoNext = (() => {
    if (stepIdx === 0) return Boolean(templateId);
    if (stepIdx === 1) return Boolean(signerName.trim()) && (Boolean(signerEmail.trim()) || Boolean(signerPhone.trim()));
    return true;
  })();

  const templateLabel = (row: LegalTemplateSummary) => `${row.display_name_en} (v${row.version})`;

  return (
    <Modal open={open} onClose={onClose} title="Send Contract">
      <div className="space-y-3">
        <div className="flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, idx) => (
            <span
              key={label}
              className={`rounded px-2 py-1 ${idx === stepIdx ? "bg-[#1f2a44] text-white" : "bg-gray-100 text-gray-600"}`}
            >
              {idx + 1}. {label}
            </span>
          ))}
        </div>

        {stepIdx === 0 ? (
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-600">Active template</label>
            <SelectCombobox
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
            >
              <option value="">Select template</option>
              {templates.map((row) => (
                <option key={row.id} value={row.id}>
                  {templateLabel(row)}
                </option>
              ))}
            </SelectCombobox>
          </div>
        ) : null}

        {stepIdx === 1 ? (
          <div className="grid gap-2 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Signer type</label>
              <SelectCombobox
                value={signerType}
                onChange={(event) => setSignerType(event.target.value as typeof signerType)}
                className="h-9 rounded border border-gray-300 px-2 text-sm"
              >
                <option value="driver">Driver</option>
                <option value="employee">Employee</option>
                <option value="customer">Customer</option>
                <option value="vendor">Vendor</option>
                <option value="other">Other</option>
              </SelectCombobox>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Language</label>
              <SelectCombobox
                value={language}
                onChange={(event) => setLanguage(event.target.value as typeof language)}
                className="h-9 rounded border border-gray-300 px-2 text-sm"
              >
                <option value="en">English</option>
                <option value="es">Spanish</option>
                <option value="bilingual">Bilingual</option>
              </SelectCombobox>
            </div>
            <div className="flex flex-col gap-1 md:col-span-2">
              <label className="text-xs font-semibold text-gray-600">Signer name</label>
              <input
                value={signerName}
                onChange={(event) => setSignerName(event.target.value)}
                className="h-9 rounded border border-gray-300 px-2 text-sm"
                placeholder="Full legal name"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Email</label>
              <input
                value={signerEmail}
                onChange={(event) => setSignerEmail(event.target.value)}
                className="h-9 rounded border border-gray-300 px-2 text-sm"
                placeholder="name@example.com"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-semibold text-gray-600">Phone</label>
              <input
                value={signerPhone}
                onChange={(event) => setSignerPhone(event.target.value)}
                className="h-9 rounded border border-gray-300 px-2 text-sm"
                placeholder="+19565550000"
              />
            </div>
          </div>
        ) : null}

        {stepIdx === 2 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600">Variable values</div>
            {variableRows.map((row, index) => (
              <div key={`${row.key}-${index}`} className="grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                <input
                  value={row.key}
                  onChange={(event) =>
                    setVariableRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, key: event.target.value } : item)))
                  }
                  className="h-9 rounded border border-gray-300 px-2 text-sm"
                  placeholder="variable_name"
                />
                <input
                  value={row.value}
                  onChange={(event) =>
                    setVariableRows((prev) => prev.map((item, idx) => (idx === index ? { ...item, value: event.target.value } : item)))
                  }
                  className="h-9 rounded border border-gray-300 px-2 text-sm"
                  placeholder="Value"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => setVariableRows((prev) => prev.filter((_, idx) => idx !== index))}
                >
                  Remove
                </Button>
              </div>
            ))}
            <Button size="sm" variant="secondary" onClick={() => setVariableRows((prev) => [...prev, { key: "", value: "" }])}>
              + Create Variable
            </Button>
          </div>
        ) : null}

        {stepIdx === 3 ? (
          <div className="space-y-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
            <div><span className="font-semibold">Template:</span> {selectedTemplate ? templateLabel(selectedTemplate) : "—"}</div>
            <div><span className="font-semibold">Signer:</span> {signerName || "—"} ({signerType})</div>
            <div><span className="font-semibold">Language:</span> {language}</div>
            <div className="font-semibold">Filled variables preview:</div>
            <pre className="overflow-x-auto rounded bg-white p-2 text-xs">
              {JSON.stringify(
                variableRows.reduce<Record<string, string>>((acc, row) => {
                  if (row.key.trim()) acc[row.key.trim()] = row.value;
                  return acc;
                }, {}),
                null,
                2
              )}
            </pre>
          </div>
        ) : null}

        {stepIdx === 4 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold text-gray-600">Verification channel</div>
            <SelectCombobox
              value={verifyChannel}
              onChange={(event) => setVerifyChannel(event.target.value as typeof verifyChannel)}
              className="h-9 w-full rounded border border-gray-300 px-2 text-sm"
            >
              <option value="none">None</option>
              <option value="sms">SMS code</option>
              <option value="email">Email code</option>
            </SelectCombobox>
            <div className="text-xs font-semibold text-gray-600">Delivery channels</div>
            <div className="grid gap-1 text-sm">
              <label><input type="checkbox" checked={sendEmail} onChange={(event) => setSendEmail(event.target.checked)} /> Email</label>
              <label><input type="checkbox" checked={sendSms} onChange={(event) => setSendSms(event.target.checked)} /> SMS</label>
              <label><input type="checkbox" checked={sendWhatsapp} onChange={(event) => setSendWhatsapp(event.target.checked)} /> WhatsApp</label>
            </div>
            <textarea
              value={customMessage}
              onChange={(event) => setCustomMessage(event.target.value)}
              className="min-h-[84px] w-full rounded border border-gray-300 px-2 py-1.5 text-[13px]"
              placeholder="Optional custom message"
            />
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-gray-200 pt-3">
          <Button
            variant="secondary"
            onClick={() => {
              if (stepIdx === 0) {
                onClose();
                return;
              }
              setStepIdx((prev) => Math.max(0, prev - 1));
            }}
          >
            {stepIdx === 0 ? "Cancel" : "Back"}
          </Button>
          {stepIdx < STEPS.length - 1 ? (
            <Button disabled={!canGoNext} onClick={() => setStepIdx((prev) => Math.min(STEPS.length - 1, prev + 1))}>
              Next
            </Button>
          ) : (
            <Button loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Send Contract
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}

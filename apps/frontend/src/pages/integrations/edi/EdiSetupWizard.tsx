import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { resolveApiUrl } from "../../../api/client";
import { useState } from "react";
import { PageHeader } from "../../../components/layout/PageHeader";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";

type EdiPartner = {
  uuid: string;
  partner_name: string;
  connection_type: string;
  isa_id: string;
  gs_id: string;
};

async function fetchPartners(companyId: string): Promise<EdiPartner[]> {
  const res = await fetch(resolveApiUrl(`/api/integrations/edi/partners?operating_company_id=${companyId}`), {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to load EDI partners");
  const data = (await res.json()) as { partners: EdiPartner[] };
  return data.partners ?? [];
}

async function createPartner(body: Record<string, unknown>) {
  const res = await fetch(resolveApiUrl("/api/integrations/edi/partners"), {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error("Failed to create EDI partner");
  return res.json();
}

async function testPartnerConnection(companyId: string, partnerUuid: string) {
  const res = await fetch(
    `/api/integrations/edi/partners/${partnerUuid}/test-connection?operating_company_id=${companyId}`,
    { method: "POST", credentials: "include" }
  );
  if (!res.ok) throw new Error("Connection test failed");
  return res.json() as Promise<{ ok: boolean; message: string }>;
}

export function EdiSetupWizard() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [partnerName, setPartnerName] = useState("");
  const [isaId, setIsaId] = useState("");
  const [gsId, setGsId] = useState("");
  const [connectionType, setConnectionType] = useState<"api" | "as2" | "ftp" | "sftp">("api");
  const [endpoint, setEndpoint] = useState("");

  const partnersQuery = useQuery({
    queryKey: ["integrations", "edi", "partners", companyId],
    queryFn: () => fetchPartners(companyId),
    enabled: Boolean(companyId),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      createPartner({
        operating_company_id: companyId,
        partner_name: partnerName,
        isa_qualifier: "ZZ",
        isa_id: isaId,
        gs_qualifier: "ZZ",
        gs_id: gsId,
        connection_type: connectionType,
        connection_config: connectionType === "api" ? { endpoint } : { host: endpoint },
      }),
    onSuccess: async () => {
      pushToast("EDI partner saved", "success");
      setStep(3);
      await queryClient.invalidateQueries({ queryKey: ["integrations", "edi"] });
    },
    onError: (e: unknown) => pushToast(e instanceof Error ? e.message : "Save failed", "error"),
  });

  const testMutation = useMutation({
    mutationFn: (partnerUuid: string) => testPartnerConnection(companyId, partnerUuid),
    onSuccess: (result) => {
      pushToast(result.message, result.ok ? "success" : "error");
    },
    onError: () => pushToast("Connection test failed", "error"),
  });

  return (
    <div data-testid="edi-setup-wizard">
      <PageHeader title="EDI Partner Setup" subtitle="Configure broker EDI exchange (204/214/210/990)" />
      <div className="max-w-2xl space-y-4 p-4">
        <p className="text-sm text-gray-600">Step {step} of 3</p>

        {step === 1 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">Partner name</label>
            <input
              className="w-full rounded border px-3 py-2"
              value={partnerName}
              onChange={(e) => setPartnerName(e.target.value)}
              placeholder="CH Robinson, JB Hunt, TQL…"
            />
            <button
              type="button"
              className="rounded bg-[#1F2A44] px-4 py-2 text-white disabled:opacity-50"
              disabled={!partnerName.trim()}
              onClick={() => setStep(2)}
            >
              Next
            </button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <label className="block text-sm font-medium">ISA / GS IDs</label>
            <input className="w-full rounded border px-3 py-2" value={isaId} onChange={(e) => setIsaId(e.target.value)} placeholder="ISA ID" />
            <input className="w-full rounded border px-3 py-2" value={gsId} onChange={(e) => setGsId(e.target.value)} placeholder="GS ID" />
            <label className="block text-sm font-medium">Connection type</label>
            <select
              className="w-full rounded border px-3 py-2"
              value={connectionType}
              onChange={(e) => setConnectionType(e.target.value as typeof connectionType)}
            >
              <option value="api">API</option>
              <option value="as2">AS2</option>
              <option value="ftp">FTP</option>
              <option value="sftp">SFTP</option>
            </select>
            <input
              className="w-full rounded border px-3 py-2"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder={connectionType === "api" ? "API endpoint URL" : "Host"}
            />
            <div className="flex gap-2">
              <button type="button" className="rounded border px-4 py-2" onClick={() => setStep(1)}>
                Back
              </button>
              <button
                type="button"
                className="rounded bg-[#1F2A44] px-4 py-2 text-white disabled:opacity-50"
                disabled={!isaId.trim() || !gsId.trim() || !endpoint.trim() || saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
              >
                Save partner
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="text-sm text-green-700">Partner configured. Test connectivity or add another broker.</p>
            <ul className="divide-y rounded border">
              {(partnersQuery.data ?? []).map((p) => (
                <li key={p.uuid} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>
                    {p.partner_name} · {p.connection_type.toUpperCase()}
                  </span>
                  <button
                    type="button"
                    className="text-slate-700 underline"
                    onClick={() => testMutation.mutate(p.uuid)}
                  >
                    Test connection
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" className="rounded border px-4 py-2" onClick={() => setStep(1)}>
              Add another partner
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

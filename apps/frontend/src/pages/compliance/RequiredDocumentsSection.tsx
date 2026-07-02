import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "../../auth/useAuth";
import {
  listRequiredDocumentTypes,
  createRequiredDocumentType,
  updateRequiredDocumentType,
  type RequiredDocEntityKind,
  type RequiredDocEnforcement,
  type RequiredDocumentType,
} from "../../api/requiredDocuments";

// DOC-REQ-2 — per-carrier "Required Documents" config (decision #6). Additive section in the Compliance
// dashboard; no sidebar change. Read for everyone in the company; warn⇄hard-block / add / deactivate are
// Owner/Administrator only (matches the backend gate + write RLS policy). Void-not-delete (deactivate).

const ENTITY_KINDS: { id: RequiredDocEntityKind; label: string }[] = [
  { id: "driver", label: "Drivers" },
  { id: "unit", label: "Units" },
  { id: "customer", label: "Customers" },
  { id: "vendor", label: "Vendors" },
];

export function RequiredDocumentsSection({ operatingCompanyId }: { operatingCompanyId: string }) {
  const auth = useAuth();
  const canManage = ["Owner", "Administrator"].includes(auth.user?.role ?? "");
  const queryClient = useQueryClient();
  const [entityKind, setEntityKind] = useState<RequiredDocEntityKind>("driver");
  const [showCreate, setShowCreate] = useState(false);

  const key = ["required-doc-types", operatingCompanyId, entityKind];
  const listQ = useQuery({
    queryKey: key,
    queryFn: () => listRequiredDocumentTypes(operatingCompanyId, entityKind),
    enabled: Boolean(operatingCompanyId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["required-doc-types", operatingCompanyId] });

  const patch = useMutation({
    mutationFn: (v: { id: string; input: Parameters<typeof updateRequiredDocumentType>[1] }) =>
      updateRequiredDocumentType(v.id, v.input),
    onSuccess: invalidate,
  });

  const create = useMutation({
    mutationFn: createRequiredDocumentType,
    onSuccess: () => {
      setShowCreate(false);
      invalidate();
    },
  });

  const rows = useMemo(() => listQ.data ?? [], [listQ.data]);

  return (
    <section data-testid="compliance-section-required-documents" className="mt-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-[13px] font-semibold text-[#1f2a44]">Required Documents</h2>
          <p className="text-[11px] text-slate-500">
            Which documents are required per record. Warn-first; promote any to a hard block. Seeded from FMCSA/IRS defaults.
          </p>
        </div>
        {canManage ? (
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="rounded border border-[#1f2a44] px-3 py-1 text-[12px] font-semibold text-[#1f2a44] hover:bg-slate-50"
          >
            {showCreate ? "Cancel" : "+ Create required type"}
          </button>
        ) : null}
      </div>

      {/* Entity-kind selector */}
      <div className="mb-3 flex gap-0 border-b border-slate-200" role="tablist">
        {ENTITY_KINDS.map((k) => (
          <button
            key={k.id}
            type="button"
            role="tab"
            aria-selected={entityKind === k.id}
            onClick={() => setEntityKind(k.id)}
            className={`px-3 py-1.5 text-[12px] font-semibold ${
              entityKind === k.id ? "border-b-2 border-[#1f2a44] text-[#1f2a44]" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {showCreate && canManage ? (
        <CreateRow
          entityKind={entityKind}
          pending={create.isPending}
          error={create.isError ? "Could not create (may already exist)." : null}
          onSubmit={(input) => create.mutate({ operating_company_id: operatingCompanyId, entity_kind: entityKind, ...input })}
        />
      ) : null}

      {listQ.isLoading ? (
        <p className="text-[12px] text-slate-500">Loading…</p>
      ) : listQ.isError ? (
        <p className="text-[12px] text-red-600">Could not load required document types.</p>
      ) : rows.length === 0 ? (
        <p className="text-[12px] text-slate-500">No required document types for this record type.</p>
      ) : (
        <div className="overflow-x-auto rounded border border-slate-200">
          <table className="min-w-full text-[12px]">
            <thead className="bg-slate-50 text-left text-slate-600">
              <tr>
                <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Document</th>
                <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Authority</th>
                <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Expiry</th>
                <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Enforcement</th>
                <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Source</th>
                {canManage ? <th className="px-3 py-1.5 font-semibold uppercase tracking-wide">Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <RowView
                  key={r.id}
                  row={r}
                  canManage={canManage}
                  pending={patch.isPending}
                  onToggleEnforcement={() =>
                    patch.mutate({
                      id: r.id,
                      input: {
                        operating_company_id: operatingCompanyId,
                        enforcement: r.enforcement === "warn" ? "hard_block" : "warn",
                      },
                    })
                  }
                  onDeactivate={() =>
                    patch.mutate({ id: r.id, input: { operating_company_id: operatingCompanyId, is_active: false } })
                  }
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function RowView({
  row,
  canManage,
  pending,
  onToggleEnforcement,
  onDeactivate,
}: {
  row: RequiredDocumentType;
  canManage: boolean;
  pending: boolean;
  onToggleEnforcement: () => void;
  onDeactivate: () => void;
}) {
  return (
    <tr className="border-t border-slate-100">
      <td className="px-3 py-1.5">
        <div className="font-medium text-slate-900">{row.label}</div>
        <div className="text-[10px] text-slate-400">{row.code}</div>
      </td>
      <td className="px-3 py-1.5 text-slate-600">{row.authority ?? "—"}</td>
      <td className="px-3 py-1.5 text-slate-600">{row.has_expiry ? "Tracked" : "—"}</td>
      <td className="px-3 py-1.5">
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
            row.enforcement === "hard_block" ? "bg-slate-200 text-slate-800" : "bg-slate-100 text-slate-600"
          }`}
        >
          {row.enforcement === "hard_block" ? "Hard block" : "Warn"}
        </span>
      </td>
      <td className="px-3 py-1.5 text-slate-500">{row.is_seed ? "Regulatory default" : "Carrier"}</td>
      {canManage ? (
        <td className="px-3 py-1.5">
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={onToggleEnforcement}
              className="rounded border border-slate-300 px-2 py-0.5 text-[11px] hover:bg-slate-50 disabled:opacity-50"
            >
              {row.enforcement === "warn" ? "Make hard block" : "Make warn"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onDeactivate}
              className="rounded border border-slate-300 px-2 py-0.5 text-[11px] text-red-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Deactivate
            </button>
          </div>
        </td>
      ) : null}
    </tr>
  );
}

function CreateRow({
  entityKind,
  pending,
  error,
  onSubmit,
}: {
  entityKind: RequiredDocEntityKind;
  pending: boolean;
  error: string | null;
  onSubmit: (input: { code: string; label: string; enforcement: RequiredDocEnforcement; has_expiry: boolean }) => void;
}) {
  const [code, setCode] = useState("");
  const [label, setLabel] = useState("");
  const [enforcement, setEnforcement] = useState<RequiredDocEnforcement>("warn");
  const [hasExpiry, setHasExpiry] = useState(false);
  const valid = /^[a-z0-9_]+$/.test(code) && label.trim().length > 0;

  return (
    <div className="mb-3 rounded border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 text-[11px] font-semibold text-slate-600">New required document for {entityKind}s</div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-[11px] text-slate-500">
          Code (lower_snake_case)
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. hazmat_cert"
            className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-[12px]"
          />
        </label>
        <label className="flex flex-col text-[11px] text-slate-500">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Hazmat Certificate"
            className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-[12px]"
          />
        </label>
        <label className="flex flex-col text-[11px] text-slate-500">
          Enforcement
          <select
            value={enforcement}
            onChange={(e) => setEnforcement(e.target.value as RequiredDocEnforcement)}
            className="mt-0.5 rounded border border-slate-300 px-2 py-1 text-[12px]"
          >
            <option value="warn">Warn</option>
            <option value="hard_block">Hard block</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-[11px] text-slate-600">
          <input type="checkbox" checked={hasExpiry} onChange={(e) => setHasExpiry(e.target.checked)} />
          Has expiry
        </label>
        <button
          type="button"
          disabled={!valid || pending}
          onClick={() => onSubmit({ code, label, enforcement, has_expiry: hasExpiry })}
          className="rounded bg-[#1f2a44] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? "Creating…" : "+ Create"}
        </button>
      </div>
      {error ? <p className="mt-1 text-[11px] text-red-600">{error}</p> : null}
    </div>
  );
}

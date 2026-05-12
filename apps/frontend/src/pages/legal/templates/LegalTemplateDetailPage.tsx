import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { legalTemplatesApi } from "../../../api/legal-templates";
import { Button } from "../../../components/Button";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";

function parseError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = (error.data as Record<string, unknown>) ?? {};
    return String(payload.error ?? payload.message ?? error.message);
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export function LegalTemplateDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const [submitError, setSubmitError] = useState("");
  const [attorneyName, setAttorneyName] = useState("");
  const [attorneyBarNumber, setAttorneyBarNumber] = useState("");
  const [attorneyNotes, setAttorneyNotes] = useState("");

  const query = useQuery({
    queryKey: ["legal", "template", id, operatingCompanyId],
    enabled: Boolean(id && operatingCompanyId),
    queryFn: () => legalTemplatesApi.get(String(id), operatingCompanyId),
  });

  const template = query.data;
  const isDraft = template?.status === "draft";

  const [editable, setEditable] = useState({
    display_name_en: "",
    display_name_es: "",
    category: "",
    content_html_en: "",
    content_html_es: "",
    variable_schema_json: "",
    requires_witness: false,
  });

  useEffect(() => {
    if (!template) return;
    setEditable({
      display_name_en: template.display_name_en,
      display_name_es: template.display_name_es,
      category: template.category,
      content_html_en: template.content_html_en,
      content_html_es: template.content_html_es,
      variable_schema_json: JSON.stringify(template.variable_schema, null, 2),
      requires_witness: template.requires_witness,
    });
  }, [template]);

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!template) return;
      await legalTemplatesApi.update(template.id, operatingCompanyId, {
        display_name_en: editable.display_name_en,
        display_name_es: editable.display_name_es,
        category: editable.category,
        content_html_en: editable.content_html_en,
        content_html_es: editable.content_html_es,
        variable_schema: JSON.parse(editable.variable_schema_json),
        requires_witness: editable.requires_witness,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["legal", "template", id, operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["legal", "templates"] });
      setSubmitError("");
    },
    onError: (error) => setSubmitError(parseError(error, "Failed to save template changes.")),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      if (!template) return;
      await legalTemplatesApi.submit(template.id, operatingCompanyId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["legal", "template", id, operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["legal", "templates"] });
    },
    onError: (error) => setSubmitError(parseError(error, "Failed to submit template.")),
  });

  const approveMutation = useMutation({
    mutationFn: async () => {
      if (!template) return;
      await legalTemplatesApi.approve(template.id, operatingCompanyId, {
        attorney_name: attorneyName,
        bar_number: attorneyBarNumber,
        notes: attorneyNotes || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["legal", "template", id, operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["legal", "templates"] });
    },
    onError: (error) => setSubmitError(parseError(error, "Failed to approve template.")),
  });

  const activateMutation = useMutation({
    mutationFn: async () => {
      if (!template) return;
      await legalTemplatesApi.activate(template.id, operatingCompanyId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["legal", "template", id, operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["legal", "templates"] });
    },
    onError: (error) => setSubmitError(parseError(error, "Failed to activate template.")),
  });

  const retireMutation = useMutation({
    mutationFn: async () => {
      if (!template) return;
      await legalTemplatesApi.retire(template.id, operatingCompanyId);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["legal", "template", id, operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["legal", "templates"] });
    },
    onError: (error) => setSubmitError(parseError(error, "Failed to retire template.")),
  });

  if (query.isLoading) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading template...</div>;
  }
  if (query.isError || !template) {
    return (
      <div className="space-y-3">
        <BackArrowHeader backTo="/legal/templates" breadcrumb={["Legal", "Templates"]} title="Template Detail" />
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-800">Failed to load template detail.</div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <BackArrowHeader
        backTo="/legal/templates"
        breadcrumb={["Legal", "Templates", template.template_code]}
        title={`${template.display_name_en} (v${template.version})`}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => navigate("/legal/templates")}>
              Back
            </Button>
            <Button onClick={() => void updateMutation.mutate()} disabled={!isDraft || updateMutation.isPending}>
              Save Draft
            </Button>
            <Button variant="secondary" onClick={() => void submitMutation.mutate()} disabled={!isDraft || submitMutation.isPending}>
              Submit for Review
            </Button>
            <Button variant="secondary" onClick={() => void activateMutation.mutate()} disabled={template.status !== "approved" || activateMutation.isPending}>
              Activate
            </Button>
            <Button variant="secondary" onClick={() => void retireMutation.mutate()} disabled={template.status === "retired" || retireMutation.isPending}>
              Retire
            </Button>
          </div>
        }
      />
      <LegalModuleTabs activeTabId="templates" />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase text-gray-500">Template metadata</div>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-xs font-semibold text-gray-600">
              Display Name (EN)
              <input
                value={editable.display_name_en}
                onChange={(event) => setEditable((prev) => ({ ...prev, display_name_en: event.target.value }))}
                disabled={!isDraft}
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Display Name (ES)
              <input
                value={editable.display_name_es}
                onChange={(event) => setEditable((prev) => ({ ...prev, display_name_es: event.target.value }))}
                disabled={!isDraft}
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              />
            </label>
            <label className="text-xs font-semibold text-gray-600">
              Category
              <input
                value={editable.category}
                onChange={(event) => setEditable((prev) => ({ ...prev, category: event.target.value }))}
                disabled={!isDraft}
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={editable.requires_witness}
                disabled={!isDraft}
                onChange={(event) => setEditable((prev) => ({ ...prev, requires_witness: event.target.checked }))}
              />
              Requires witness
            </label>
          </div>

          <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
            <div><span className="font-semibold">Status:</span> {template.status}</div>
            <div><span className="font-semibold">Attorney approval:</span> {template.attorney_approved_by ?? "pending"}</div>
            <div><span className="font-semibold">Approved at:</span> {template.attorney_approved_at ?? "pending"}</div>
          </div>

          <div className="space-y-2 rounded border border-gray-200 p-2">
            <div className="text-xs font-semibold uppercase text-gray-500">Attorney approval input</div>
            <label className="block text-xs font-semibold text-gray-600">
              Attorney Name
              <input
                value={attorneyName}
                onChange={(event) => setAttorneyName(event.target.value)}
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Bar Number
              <input
                value={attorneyBarNumber}
                onChange={(event) => setAttorneyBarNumber(event.target.value)}
                className="mt-1 h-9 w-full rounded border border-gray-300 px-2 text-sm"
              />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Notes
              <textarea
                value={attorneyNotes}
                onChange={(event) => setAttorneyNotes(event.target.value)}
                rows={3}
                className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-sm"
              />
            </label>
            <Button
              variant="secondary"
              onClick={() => void approveMutation.mutate()}
              disabled={template.status !== "pending_review" || approveMutation.isPending}
            >
              Record Approval
            </Button>
          </div>
        </div>

        <div className="space-y-3 rounded border border-gray-200 bg-white p-3">
          <div className="text-xs font-semibold uppercase text-gray-500">Version history</div>
          <div className="max-h-44 overflow-auto rounded border border-gray-200">
            <table className="min-w-full text-xs">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="px-2 py-1 text-left">Version</th>
                  <th className="px-2 py-1 text-left">Status</th>
                  <th className="px-2 py-1 text-left">Updated</th>
                </tr>
              </thead>
              <tbody>
                {(template.versions ?? []).map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-2 py-1">{row.version}</td>
                    <td className="px-2 py-1">{row.status}</td>
                    <td className="px-2 py-1">{new Date(row.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <label className="block text-xs font-semibold text-gray-600">
            Variable schema (JSON)
            <textarea
              rows={8}
              value={editable.variable_schema_json}
              disabled={!isDraft}
              onChange={(event) => setEditable((prev) => ({ ...prev, variable_schema_json: event.target.value }))}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
            />
          </label>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <label className="block rounded border border-gray-200 bg-white p-3 text-xs font-semibold text-gray-600">
          English HTML
          <textarea
            rows={12}
            value={editable.content_html_en}
            disabled={!isDraft}
            onChange={(event) => setEditable((prev) => ({ ...prev, content_html_en: event.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
          />
        </label>
        <label className="block rounded border border-gray-200 bg-white p-3 text-xs font-semibold text-gray-600">
          Spanish HTML
          <textarea
            rows={12}
            value={editable.content_html_es}
            disabled={!isDraft}
            onChange={(event) => setEditable((prev) => ({ ...prev, content_html_es: event.target.value }))}
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 font-mono text-xs"
          />
        </label>
      </div>

      <div className="rounded border border-gray-200 bg-white p-3">
        <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Audit log</div>
        <div className="max-h-56 overflow-auto rounded border border-gray-200">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="px-2 py-1 text-left">When</th>
                <th className="px-2 py-1 text-left">Event</th>
                <th className="px-2 py-1 text-left">Actor</th>
              </tr>
            </thead>
            <tbody>
              {(template.audit_log ?? []).map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="px-2 py-1">{new Date(row.created_at).toLocaleString()}</td>
                  <td className="px-2 py-1">{row.event_type}</td>
                  <td className="px-2 py-1">{row.actor_name ?? row.actor_user_id ?? "system"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {submitError ? <div className="rounded border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div> : null}
    </div>
  );
}

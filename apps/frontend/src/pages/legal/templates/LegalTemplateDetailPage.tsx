import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../../../api/client";
import { legalTemplatesApi, type LegalTemplateDetail } from "../../../api/legal-templates";
import { Button } from "../../../components/Button";
import { ListErrorState } from "../../../components/ListErrorState";
import { BackArrowHeader } from "../../../components/layout/BackArrowHeader";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { LegalModuleTabs } from "../LegalModuleTabs";
import { formatDateTimeUS } from "../../../lib/formatDate";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLinkOrTombstone } from "../../../components/shared/EntityLinkOrTombstone";

function auditActorLabel(row: TemplateAuditEvent): string {
  if (row.actor_user_id) return entityLabel(row.actor_name, row.actor_user_id, "User");
  const name = row.actor_name != null ? String(row.actor_name).trim() : "";
  return name !== "" ? name : "system";
}

function auditActorCell(row: TemplateAuditEvent) {
  if (row.actor_user_id) {
    return <EntityLinkOrTombstone kind="user" id={row.actor_user_id} name={row.actor_name} noun="User" />;
  }
  return auditActorLabel(row);
}

type TemplateVersion = NonNullable<LegalTemplateDetail["versions"]>[number];
type TemplateAuditEvent = NonNullable<LegalTemplateDetail["audit_log"]>[number];

function parseError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const payload = (error.data as Record<string, unknown>) ?? {};
    return String(payload.error ?? payload.message ?? error.message);
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

const VERSION_COLUMNS: Array<ParityColumn<TemplateVersion>> = [
  { key: "version", label: "Version", sortable: true },
  { key: "status", label: "Status", sortable: true },
  {
    key: "updated_at",
    label: "Updated",
    sortable: true,
    sortValue: (row) => new Date(row.updated_at).getTime(),
    render: (row) => formatDateTimeUS(row.updated_at),
  },
];

const AUDIT_LOG_COLUMNS: Array<ParityColumn<TemplateAuditEvent>> = [
  {
    key: "created_at",
    label: "When",
    sortable: true,
    sortValue: (row) => new Date(row.created_at).getTime(),
    render: (row) => formatDateTimeUS(row.created_at),
  },
  { key: "event_type", label: "Event", sortable: true },
  {
    key: "actor_name",
    label: "Actor",
    sortable: true,
    sortValue: (row) => auditActorLabel(row),
    render: (row) => auditActorCell(row),
  },
];

export function LegalTemplateDetailPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { id } = useParams<{ id: string }>();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";

  const [submitError, setSubmitError] = useState("");
  const [attorneyReviewUrl, setAttorneyReviewUrl] = useState("");
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
    if (template.status !== "pending_review") setAttorneyReviewUrl("");
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
      if (!template) return null;
      return legalTemplatesApi.submit(template.id, operatingCompanyId);
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["legal", "template", id, operatingCompanyId] });
      await queryClient.invalidateQueries({ queryKey: ["legal", "templates"] });
      if (data?.attorney_review_url) setAttorneyReviewUrl(data.attorney_review_url);
    },
    onError: (error) => setSubmitError(parseError(error, "Failed to submit template.")),
  });

  const remintReviewLinkMutation = useMutation({
    mutationFn: async () => {
      if (!template) return null;
      return legalTemplatesApi.remintAttorneyReviewLink(template.id, operatingCompanyId);
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ["legal", "template", id, operatingCompanyId] });
      if (data?.attorney_review_url) setAttorneyReviewUrl(data.attorney_review_url);
    },
    onError: (error) => setSubmitError(parseError(error, "Failed to regenerate review link.")),
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

  const newVersionMutation = useMutation({
    mutationFn: async () => {
      if (!template) return null;
      return legalTemplatesApi.newVersion(template.id, operatingCompanyId);
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ["legal", "templates"] });
      if (created?.id) navigate(`/legal/templates/${created.id}`);
    },
    onError: (error) => setSubmitError(parseError(error, "Failed to create new version.")),
  });

  if (query.isLoading) {
    return <div className="rounded-sm border border-gray-200 bg-white p-4 text-sm text-gray-500">Loading template...</div>;
  }
  if (query.isError || !template) {
    return (
      <div className="space-y-3">
        <BackArrowHeader backTo="/legal/templates" breadcrumb={["Legal", "Templates"]} title="Template Detail" />
        <ListErrorState
          title="Couldn't load template detail"
          status={query.error instanceof ApiError ? query.error.status : 0}
          message={parseError(query.error, "Failed to load template detail.")}
          onRetry={() => void query.refetch()}
          className="rounded-sm border border-amber-200 bg-amber-50"
        />
      </div>
    );
  }

  const versionRows = template.versions ?? [];
  const auditLogRows = template.audit_log ?? [];

  return (
    <div className="space-y-3" data-testid="legal-template-detail-page">
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
            <Button variant="secondary" onClick={() => void newVersionMutation.mutate()} disabled={newVersionMutation.isPending}>
              New version
            </Button>
          </div>
        }
      />
      <LegalModuleTabs />

      <div className="grid gap-3 lg:grid-cols-2">
        <section
          className="overflow-hidden rounded-sm border border-slate-300 bg-white"
          data-testid="legal-template-metadata"
        >
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs font-semibold uppercase text-slate-600">Template metadata</div>
          </div>
          <div className="divide-y divide-slate-200 px-3 py-3">
            <div className="grid gap-2 pb-3 md:grid-cols-2">
              <label className="text-xs font-semibold text-slate-700">
                Display Name (EN)
                <input
                  value={editable.display_name_en}
                  onChange={(event) => setEditable((prev) => ({ ...prev, display_name_en: event.target.value }))}
                  disabled={!isDraft}
                  className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Display Name (ES)
                <input
                  value={editable.display_name_es}
                  onChange={(event) => setEditable((prev) => ({ ...prev, display_name_es: event.target.value }))}
                  disabled={!isDraft}
                  className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-slate-700">
                Category
                <input
                  value={editable.category}
                  onChange={(event) => setEditable((prev) => ({ ...prev, category: event.target.value }))}
                  disabled={!isDraft}
                  className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input
                  type="checkbox"
                  checked={editable.requires_witness}
                  disabled={!isDraft}
                  onChange={(event) => setEditable((prev) => ({ ...prev, requires_witness: event.target.checked }))}
                />
                Requires witness
              </label>
            </div>

            <div className="space-y-1 bg-slate-50 px-2 py-2 text-xs text-slate-700">
              <div><span className="font-semibold">Status:</span> {template.status}</div>
              <div><span className="font-semibold">Attorney approval:</span> {template.attorney_approved_by ?? "pending"}</div>
              <div><span className="font-semibold">Approved at:</span> {template.attorney_approved_at ? formatDateTimeUS(template.attorney_approved_at) : "pending"}</div>
            </div>

            {template.status === "pending_review" ? (
              <div className="space-y-2 py-3">
                <div className="text-xs font-semibold text-slate-700">Attorney review link</div>
                <p className="text-xs text-slate-700">
                  Share this URL with outside counsel. It is single-use and expires in 30 days. Regenerate invalidates prior links.
                </p>
                {attorneyReviewUrl ? (
                  <div className="break-all bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-800">
                    {attorneyReviewUrl}
                  </div>
                ) : (
                  <p className="text-xs text-slate-700">Submit for review creates a link. If you lost it, regenerate below.</p>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={!attorneyReviewUrl}
                    onClick={() => attorneyReviewUrl && void navigator.clipboard.writeText(attorneyReviewUrl)}
                  >
                    Copy link
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={remintReviewLinkMutation.isPending}
                    onClick={() => void remintReviewLinkMutation.mutate()}
                  >
                    Regenerate link
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="space-y-2 pt-3">
              <div className="text-xs font-semibold uppercase text-slate-600">Attorney approval input</div>
              <label className="block text-xs font-semibold text-slate-700">
                Attorney Name
                <input
                  value={attorneyName}
                  onChange={(event) => setAttorneyName(event.target.value)}
                  className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Bar Number
                <input
                  value={attorneyBarNumber}
                  onChange={(event) => setAttorneyBarNumber(event.target.value)}
                  className="mt-1 h-9 w-full rounded-sm border border-slate-300 px-2 text-sm"
                />
              </label>
              <label className="block text-xs font-semibold text-slate-700">
                Notes
                <textarea
                  value={attorneyNotes}
                  onChange={(event) => setAttorneyNotes(event.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 text-sm"
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
        </section>

        <section className="overflow-hidden rounded-sm border border-slate-300 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-xs font-semibold uppercase text-slate-600">Version history</div>
          </div>
          <div className="divide-y divide-slate-200 px-3 py-3">
            <ParityTable
              rows={versionRows}
              columns={VERSION_COLUMNS}
              rowKey={(row) => row.id}
              storageKey="legal-template-version-history"
              loading={query.isLoading}
              emptyText="No prior versions."
              initialPageSize={15}
            />

            <label className="block pt-3 text-xs font-semibold text-slate-700">
              Variable schema (JSON)
              <textarea
                rows={8}
                value={editable.variable_schema_json}
                disabled={!isDraft}
                onChange={(event) => setEditable((prev) => ({ ...prev, variable_schema_json: event.target.value }))}
                className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 font-mono text-xs"
              />
            </label>
          </div>
        </section>
      </div>

      <section className="overflow-hidden rounded-sm border border-slate-300 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold uppercase text-slate-600">Template content</div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-slate-200 lg:grid-cols-2 lg:divide-x lg:divide-y-0">
          <div className="px-3 py-3">
            <label className="block text-xs font-semibold text-slate-700">
              English HTML
              <textarea
                rows={12}
                value={editable.content_html_en}
                disabled={!isDraft}
                onChange={(event) => setEditable((prev) => ({ ...prev, content_html_en: event.target.value }))}
                className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 font-mono text-xs"
              />
            </label>
          </div>
          <div className="px-3 py-3">
            <label className="block text-xs font-semibold text-slate-700">
              Spanish HTML
              <textarea
                rows={12}
                value={editable.content_html_es}
                disabled={!isDraft}
                onChange={(event) => setEditable((prev) => ({ ...prev, content_html_es: event.target.value }))}
                className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1 font-mono text-xs"
              />
            </label>
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-sm border border-slate-300 bg-white">
        <div className="border-b border-slate-200 bg-slate-50 px-3 py-2">
          <div className="text-xs font-semibold uppercase text-slate-600">Audit log</div>
        </div>
        <div className="px-3 py-3">
          <ParityTable
            rows={auditLogRows}
            columns={AUDIT_LOG_COLUMNS}
            rowKey={(row) => String(row.id)}
            storageKey="legal-template-audit-log"
            loading={query.isLoading}
            emptyText="No audit events recorded."
            initialPageSize={15}
            renderExpanded={(row) => (
              <pre className="overflow-auto bg-slate-50 p-3 text-xs text-slate-700">
                {JSON.stringify(row.event_payload, null, 2)}
              </pre>
            )}
          />
        </div>
      </section>

      {submitError ? <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">{submitError}</div> : null}
    </div>
  );
}

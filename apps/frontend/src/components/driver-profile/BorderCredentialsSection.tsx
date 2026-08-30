import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { updateDriver } from "../../api/mdata";
import { confirmUpload, listFileCategories, requestUploadUrlFromFile } from "../../api/docs";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { DatePicker } from "../forms/DatePicker";
import { userFacingApiError } from "../../lib/api-error-message";

function expClass(dateStr: string | null | undefined) {
  if (!dateStr) return "text-gray-600";
  const days = Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "text-red-700";
  if (days <= 30) return "text-yellow-700";
  return "text-green-700";
}

function fmt(value: unknown) {
  const s = String(value ?? "").trim();
  return s ? s : "—";
}

type CredentialKey = "fast_card" | "visa" | "passport" | "mexican_federal_license";
const CREDENTIAL_LABELS: Record<CredentialKey, string> = {
  fast_card: "FAST card",
  visa: "B1 visa",
  passport: "Passport",
  mexican_federal_license: "Mexican license",
};

type BorderFormState = {
  fastCardNumber: string;
  fastCardExpiration: string;
  sentriMember: boolean;
  sentriExpiration: string;
  twicNumber: string;
  twicExpiration: string;
  mexicanLicenseNumber: string;
  mexicanLicenseExpiration: string;
};

function borderToFormState(border: Record<string, unknown>): BorderFormState {
  const fast = border.fast_card as Record<string, unknown> | undefined;
  const sentri = border.sentri as Record<string, unknown> | undefined;
  const twic = border.twic as Record<string, unknown> | undefined;
  const mx = border.mexican_license as Record<string, unknown> | undefined;
  return {
    fastCardNumber: String(fast?.number ?? ""),
    fastCardExpiration: String(fast?.expiration ?? ""),
    sentriMember: Boolean(sentri?.member),
    sentriExpiration: String(sentri?.expiration ?? ""),
    twicNumber: String(twic?.number ?? ""),
    twicExpiration: String(twic?.expiration ?? ""),
    mexicanLicenseNumber: String(mx?.number ?? ""),
    mexicanLicenseExpiration: String(mx?.expiration ?? ""),
  };
}

export function borderFormStateToUpdatePayload(form: BorderFormState) {
  return {
    fast_card_number: form.fastCardNumber.trim() || null,
    fast_card_expiration: form.fastCardExpiration.trim() || null,
    sentri_member: form.sentriMember,
    sentri_expiration: form.sentriExpiration.trim() || null,
    twic_card_number: form.twicNumber.trim() || null,
    twic_expiration: form.twicExpiration.trim() || null,
    mexican_license_number: form.mexicanLicenseNumber.trim() || null,
    mexican_license_expiration: form.mexicanLicenseExpiration.trim() || null,
  };
}

export function BorderCredentialsSection({
  border,
  driverId,
  onSaved,
}: {
  border: Record<string, unknown>;
  driverId?: string;
  onSaved?: () => void | Promise<void>;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState<BorderFormState>(() => borderToFormState(border));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // DOC-01 remainder (GO-1405, owner packet IH35-FINISH-2026-08-29/CC-1): "MX license, visa,
  // passport, FAST" had no upload surface. Each credential files under entity_type="driver" (the
  // driver already has a document list elsewhere — no new entity type needed) with its own real
  // catalogs.file_categories code; fast_card was the one missing category (seeded alongside this).
  const [credentialFiles, setCredentialFiles] = useState<Record<CredentialKey, File | null>>({
    fast_card: null,
    visa: null,
    passport: null,
    mexican_federal_license: null,
  });

  const categoriesQuery = useQuery({
    queryKey: ["docs", "file-categories", "driver"],
    queryFn: () => listFileCategories("driver"),
    enabled: editOpen,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (!editOpen) {
      setForm(borderToFormState(border));
      setCredentialFiles({ fast_card: null, visa: null, passport: null, mexican_federal_license: null });
    }
  }, [border, editOpen]);

  const fast = border.fast_card as Record<string, unknown> | undefined;
  const sentri = border.sentri as Record<string, unknown> | undefined;
  const twic = border.twic as Record<string, unknown> | undefined;
  const passport = border.passport as Record<string, unknown> | undefined;
  const mx = border.mexican_license as Record<string, unknown> | undefined;
  const visa = border.visa_b1 as Record<string, unknown> | undefined;
  const cards = [
    ["FAST card", fast?.number, fast?.expiration],
    ["SENTRI", sentri?.member ? "Member" : "Not enrolled", sentri?.expiration],
    ["TWIC", twic?.number, twic?.expiration],
    ["Passport", passport?.number, passport?.expiration],
    ["Mexican license", mx?.number, mx?.expiration],
    ["B1 visa", visa?.status, null],
  ] as const;

  const canEdit = Boolean(driverId && onSaved);

  // Uploads one credential document (if the operator selected one), tagged under entity_type
  // "driver" with the matching real catalog category. Refuses to silently drop a selected file:
  // an upload failure aborts the whole save, same rule FineCreateModal/CreateFuelTransactionModal
  // use — a credential the operator believes was attached must never silently not exist.
  const uploadCredentialFile = async (key: CredentialKey, file: File | null): Promise<void> => {
    if (!file || !driverId) return;
    const category = categoriesQuery.data?.categories.find((c) => c.code === key);
    const { file_id, presigned_url } = await requestUploadUrlFromFile(file, {
      category_id: category?.id,
      entity_links: [{ entity_type: "driver", entity_id: driverId }],
    });
    const put = await fetch(presigned_url, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!put.ok) {
      throw new Error(`${CREDENTIAL_LABELS[key]} upload failed (${put.status}). Border credentials were not saved.`);
    }
    await confirmUpload(file_id);
  };

  const save = async () => {
    if (!driverId || !onSaved) return;
    setError("");
    setPending(true);
    try {
      for (const key of Object.keys(credentialFiles) as CredentialKey[]) {
        await uploadCredentialFile(key, credentialFiles[key]);
      }
      await updateDriver(driverId, borderFormStateToUpdatePayload(form));
      await onSaved();
      setEditOpen(false);
    } catch (err) {
      setError(userFacingApiError(err, "Could not save border credentials"));
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <section className="rounded-sm border border-gray-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Border ops credentials</h2>
          <button
            type="button"
            className="text-xs text-slate-700 underline disabled:cursor-not-allowed disabled:text-gray-400"
            data-testid="dp-edit-border-creds"
            onClick={() => setEditOpen(true)}
            disabled={!canEdit}
          >
            Edit
          </button>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(([title, primary, exp]) => (
            <div key={title} className="rounded-sm border border-gray-100 p-3">
              <div className="text-[10px] uppercase text-gray-500">{title}</div>
              <div className="text-sm font-medium text-gray-900">{fmt(primary)}</div>
              {exp ? <div className={`text-xs ${expClass(String(exp))}`}>Exp {String(exp)}</div> : null}
            </div>
          ))}
        </div>
      </section>

      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="Edit border credentials">
        <div className="space-y-4 text-sm">
          <FieldGroup label="FAST card number">
            <input
              className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm"
              data-testid="border-creds-fast-number"
              value={form.fastCardNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, fastCardNumber: e.target.value }))}
            />
          </FieldGroup>
          <FieldGroup label="FAST expiration">
            <DatePicker
              value={form.fastCardExpiration}
              onChange={(value) => setForm((prev) => ({ ...prev, fastCardExpiration: value }))}
              data-testid="border-creds-fast-expiration"
            />
          </FieldGroup>

          <FieldGroup label="SENTRI">
            <label className="flex items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                data-testid="border-creds-sentri-member"
                checked={form.sentriMember}
                onChange={(e) => setForm((prev) => ({ ...prev, sentriMember: e.target.checked }))}
              />
              Enrolled member
            </label>
          </FieldGroup>
          <FieldGroup label="SENTRI expiration">
            <DatePicker
              value={form.sentriExpiration}
              onChange={(value) => setForm((prev) => ({ ...prev, sentriExpiration: value }))}
              data-testid="border-creds-sentri-expiration"
            />
          </FieldGroup>

          <FieldGroup label="TWIC number">
            <input
              className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm"
              data-testid="border-creds-twic-number"
              value={form.twicNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, twicNumber: e.target.value }))}
            />
          </FieldGroup>
          <FieldGroup label="TWIC expiration">
            <DatePicker
              value={form.twicExpiration}
              onChange={(value) => setForm((prev) => ({ ...prev, twicExpiration: value }))}
              data-testid="border-creds-twic-expiration"
            />
          </FieldGroup>

          <FieldGroup label="Mexican license number">
            <input
              className="w-full rounded-sm border border-gray-300 px-2 py-1.5 text-sm"
              data-testid="border-creds-mx-number"
              value={form.mexicanLicenseNumber}
              onChange={(e) => setForm((prev) => ({ ...prev, mexicanLicenseNumber: e.target.value }))}
            />
          </FieldGroup>
          <FieldGroup label="Mexican license expiration">
            <DatePicker
              value={form.mexicanLicenseExpiration}
              onChange={(value) => setForm((prev) => ({ ...prev, mexicanLicenseExpiration: value }))}
              data-testid="border-creds-mx-expiration"
            />
          </FieldGroup>

          {/* DOC-01 remainder (GO-1405): the 4 credential documents the owner packet named. */}
          <div className="rounded-sm border border-gray-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase text-gray-500">Documents</div>
            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(CREDENTIAL_LABELS) as CredentialKey[]).map((key) => (
                <FieldGroup key={key} label={CREDENTIAL_LABELS[key]}>
                  <input
                    type="file"
                    data-testid={`border-creds-doc-${key.replace(/_/g, "-")}`}
                    className="w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px]"
                    onChange={(e) =>
                      setCredentialFiles((prev) => ({ ...prev, [key]: e.target.files?.[0] ?? null }))
                    }
                  />
                  {credentialFiles[key] ? (
                    <span className="mt-1 block text-[11px] text-slate-500">{credentialFiles[key]!.name}</span>
                  ) : null}
                </FieldGroup>
              ))}
            </div>
          </div>

          {error ? <p className="text-xs text-red-700">{error}</p> : null}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setEditOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" data-testid="border-creds-save" loading={pending} onClick={() => void save()}>
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function FieldGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-[10px] font-semibold uppercase text-gray-500">{label}</div>
      {children}
    </div>
  );
}

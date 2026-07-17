import { useEffect, useState, type ReactNode } from "react";
import { updateDriver } from "../../api/mdata";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { DatePicker } from "../forms/DatePicker";

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

  useEffect(() => {
    if (!editOpen) setForm(borderToFormState(border));
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

  const save = async () => {
    if (!driverId || !onSaved) return;
    setError("");
    setPending(true);
    try {
      await updateDriver(driverId, borderFormStateToUpdatePayload(form));
      await onSaved();
      setEditOpen(false);
    } catch (err) {
      setError(String((err as Error)?.message ?? "Could not save border credentials"));
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

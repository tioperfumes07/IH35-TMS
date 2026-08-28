/**
 * LST-F10 — Driver Teams create/edit modal.
 *
 * Follows the neighbouring Lists idiom (DriverCatalogModal): shared <Modal>, inline field errors,
 * a submit-error banner, Cancel + primary action in the footer.
 *
 * Membership rules mirror apps/backend/src/mdata/driver-teams.routes.ts exactly:
 *  - a team is always exactly one primary + one secondary driver (there is no free-form member list)
 *  - changing a member = POST :id/replace-driver (backend deactivates + re-creates, keeping history)
 *  - removing a team  = POST :id/deactivate (SOFT — is_active=false + effective_to). Never a delete.
 */
import { useEffect, useState } from "react";
import {
  createMdataDriverTeam,
  deactivateMdataDriverTeam,
  driverTeamErrorMessage,
  driverTeamMemberName,
  replaceMdataDriverTeamDriver,
  updateMdataDriverTeam,
  type MdataDriverTeam,
  type MdataDriverTeamSlot,
} from "../../../api/driver-teams";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { DatePicker } from "../../../components/forms/DatePicker";
import { addDaysIso, companyToday } from "../../../lib/businessDate";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  mode: "create" | "edit";
  team: MdataDriverTeam | null;
  onClose: () => void;
  onSaved: () => void;
};

type FormState = {
  team_name: string;
  primary_driver_id: string | null;
  secondary_driver_id: string | null;
  relationship: string;
  notes: string;
  effective_from: string;
};

const EMPTY_FORM: FormState = {
  team_name: "",
  primary_driver_id: null,
  secondary_driver_id: null,
  relationship: "",
  notes: "",
  effective_from: "",
};

function todayIso(): string {
  return companyToday();
}

/** Backend rejects effective_from more than 30 days out (ensureEffectiveFromWithinWindow). */
function maxEffectiveFromIso(): string {
  return addDaysIso(companyToday(), 30);
}

export function DriverTeamModal({ open, operatingCompanyId, mode, team, onClose, onSaved }: Props) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [replaceSlot, setReplaceSlot] = useState<MdataDriverTeamSlot | null>(null);
  const [replacementDriverId, setReplacementDriverId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setForm(
      mode === "edit" && team
        ? {
            team_name: team.team_name,
            primary_driver_id: team.primary_driver_id,
            secondary_driver_id: team.secondary_driver_id,
            relationship: team.relationship ?? "",
            notes: team.notes ?? "",
            effective_from: team.effective_from ?? "",
          }
        : { ...EMPTY_FORM, effective_from: todayIso() }
    );
    setErrors({});
    setSubmitError("");
    setReplaceSlot(null);
    setReplacementDriverId(null);
  }, [open, mode, team]);

  function validateCreate() {
    const next: Record<string, string> = {};
    if (!form.team_name.trim()) next.team_name = "Team Name is required.";
    if (form.team_name.trim().length > 200) next.team_name = "Team Name must be 200 characters or fewer.";
    if (!form.primary_driver_id) next.primary_driver = "Primary Driver is required.";
    if (!form.secondary_driver_id) next.secondary_driver = "Secondary Driver is required.";
    if (form.primary_driver_id && form.primary_driver_id === form.secondary_driver_id) {
      next.secondary_driver = "Primary and Secondary must be two different drivers.";
    }
    if (form.effective_from && form.effective_from > maxEffectiveFromIso()) {
      next.effective_from = "Effective From can't be more than 30 days in the future.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function validateEdit() {
    const next: Record<string, string> = {};
    if (!form.team_name.trim()) next.team_name = "Team Name is required.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function runAction(action: () => Promise<unknown>, fallback: string) {
    setIsSaving(true);
    setSubmitError("");
    try {
      await action();
      onSaved();
      return true;
    } catch (error) {
      setSubmitError(driverTeamErrorMessage(error, fallback));
      return false;
    } finally {
      setIsSaving(false);
    }
  }

  async function submit() {
    if (mode === "create") {
      if (!validateCreate()) return;
      const ok = await runAction(
        () =>
          createMdataDriverTeam({
            operating_company_id: operatingCompanyId,
            team_name: form.team_name.trim(),
            primary_driver_id: form.primary_driver_id!,
            secondary_driver_id: form.secondary_driver_id!,
            relationship: form.relationship.trim() || undefined,
            notes: form.notes.trim() || undefined,
            effective_from: form.effective_from || undefined,
          }),
        "Failed to create the driver team."
      );
      if (ok) onClose();
      return;
    }

    if (!team || !validateEdit()) return;
    const ok = await runAction(
      () =>
        updateMdataDriverTeam(team.id, {
          team_name: form.team_name.trim(),
          relationship: form.relationship.trim() || null,
          notes: form.notes.trim() || null,
        }),
      "Failed to save the driver team."
    );
    if (ok) onClose();
  }

  async function deactivate() {
    if (!team) return;
    const ok = await runAction(() => deactivateMdataDriverTeam(team.id), "Failed to deactivate the driver team.");
    if (ok) onClose();
  }

  async function replaceDriver() {
    if (!team || !replaceSlot) return;
    if (!replacementDriverId) {
      setSubmitError("Pick the replacement driver first.");
      return;
    }
    const ok = await runAction(
      () => replaceMdataDriverTeamDriver(team.id, { driver_slot: replaceSlot, new_driver_id: replacementDriverId }),
      "Failed to replace the driver."
    );
    if (ok) onClose();
  }

  const readOnlyMembership = mode === "edit" && team && !team.is_active;

  return (
    <Modal variant="drawer" open={open} onClose={onClose} title={mode === "create" ? "Create Driver Team" : "Edit Driver Team"}>
      <div className="space-y-3">
        <label className="block text-xs font-semibold text-gray-600">
          Team Name
          <input
            data-testid="driver-team-name"
            value={form.team_name}
            onChange={(event) => setForm((value) => ({ ...value, team_name: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            placeholder="e.g. Laredo Night Team"
          />
          {errors.team_name ? <div className="mt-1 text-[11px] text-red-700">{errors.team_name}</div> : null}
        </label>

        {mode === "create" ? (
          <>
            <div className="block text-xs font-semibold text-gray-600">
              Primary Driver
              <DriverPickerWithCreate
                dataField="primary_driver_id"
                className="mt-1"
                operatingCompanyId={operatingCompanyId}
                value={form.primary_driver_id}
                onChange={(driverId) => setForm((value) => ({ ...value, primary_driver_id: driverId }))}
                open={open}
                placeholder="Select primary driver"
              />
              {errors.primary_driver ? <div className="mt-1 text-[11px] text-red-700">{errors.primary_driver}</div> : null}
            </div>

            <div className="block text-xs font-semibold text-gray-600">
              Secondary Driver
              <DriverPickerWithCreate
                dataField="secondary_driver_id"
                className="mt-1"
                operatingCompanyId={operatingCompanyId}
                value={form.secondary_driver_id}
                onChange={(driverId) => setForm((value) => ({ ...value, secondary_driver_id: driverId }))}
                open={open}
                placeholder="Select secondary driver"
              />
              {errors.secondary_driver ? <div className="mt-1 text-[11px] text-red-700">{errors.secondary_driver}</div> : null}
            </div>

            <div className="block text-xs font-semibold text-gray-600">
              Effective From
              {/* Shared DatePicker only — a raw native date input is forbidden (verify:no-raw-date-input). */}
              <DatePicker
                data-testid="driver-team-effective-from"
                className="mt-1"
                value={form.effective_from}
                max={maxEffectiveFromIso()}
                onChange={(next) => setForm((value) => ({ ...value, effective_from: next }))}
              />
              {errors.effective_from ? <div className="mt-1 text-[11px] text-red-700">{errors.effective_from}</div> : null}
            </div>
          </>
        ) : null}

        <label className="block text-xs font-semibold text-gray-600">
          Relationship
          <input
            value={form.relationship}
            onChange={(event) => setForm((value) => ({ ...value, relationship: event.target.value }))}
            className="mt-1 h-9 w-full rounded-sm border border-gray-300 px-2 text-sm"
            placeholder="e.g. Spouse, Trainer/Trainee"
          />
        </label>

        <label className="block text-xs font-semibold text-gray-600">
          Notes
          <textarea
            value={form.notes}
            onChange={(event) => setForm((value) => ({ ...value, notes: event.target.value }))}
            rows={3}
            className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
          />
        </label>

        {mode === "edit" && team ? (
          <div className="rounded-sm border border-gray-200 bg-slate-50 p-2">
            <div className="mb-1 text-xs font-semibold text-slate-700">Membership</div>
            <p className="mb-2 text-[11px] text-slate-500">
              Replacing a driver closes this team (effective today) and opens a new one with the same name — the old
              record is kept, never deleted.
            </p>
            {(["primary", "secondary"] as MdataDriverTeamSlot[]).map((slot) => (
              <div key={slot} className="mb-1 flex flex-wrap items-center gap-2 text-xs text-slate-700">
                <span className="w-20 shrink-0 capitalize">{slot}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{driverTeamMemberName(team, slot)}</span>
                {readOnlyMembership ? null : (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    data-testid={`driver-team-replace-${slot}`}
                    onClick={() => {
                      setReplaceSlot((current) => (current === slot ? null : slot));
                      setReplacementDriverId(null);
                    }}
                  >
                    Replace
                  </Button>
                )}
              </div>
            ))}
            {replaceSlot ? (
              <div className="mt-2 space-y-2 border-t border-gray-200 pt-2">
                <div className="text-[11px] font-semibold text-slate-600">Replacement for {replaceSlot} driver</div>
                <DriverPickerWithCreate
                  operatingCompanyId={operatingCompanyId}
                  value={replacementDriverId}
                  onChange={setReplacementDriverId}
                  open={open}
                  placeholder="Select replacement driver"
                />
                <div className="flex gap-2">
                  <Button type="button" size="sm" disabled={isSaving} onClick={() => void replaceDriver()}>
                    Confirm Replacement
                  </Button>
                  <Button type="button" size="sm" variant="secondary" disabled={isSaving} onClick={() => setReplaceSlot(null)}>
                    Cancel Replacement
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {submitError ? (
          <div data-testid="driver-team-submit-error" className="rounded-sm border border-red-300 bg-red-50 px-2 py-1 text-xs text-red-800">
            {submitError}
          </div>
        ) : null}

        <div className="flex items-center justify-between">
          <div>
            {mode === "edit" && team && team.is_active ? (
              <Button
                type="button"
                variant="secondary"
                data-testid="driver-team-deactivate"
                disabled={isSaving}
                onClick={() => void deactivate()}
              >
                Deactivate Team
              </Button>
            ) : null}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button type="button" data-testid="driver-team-submit" onClick={() => void submit()} disabled={isSaving}>
              {mode === "create" ? "Create" : "Save Changes"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

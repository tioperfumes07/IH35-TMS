/**
 * LEAD 443.294 step 3 — the ONE override button (owner 10-23 8:52 PM: "for the owner and accountant it is just an
 * override button. click confirm etc. for other employees, reason drop down filter list. that simple.").
 *
 *   Owner / Accountant → button + Confirm dialog only (onConfirm(null); the engine stores owner_override /
 *                        accountant_override).
 *   Everyone else      → button + a searchable reason dropdown filtered to `context` (catalogs.override_reasons) + Confirm
 *                        (onConfirm(reason_code)).
 * Nothing is typed: there is no text input anywhere in this component. The site sends the code to its route, which
 * calls recordOverride (apps/backend/src/overrides/record-override.service.ts).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { listOverrideReasons, type OverrideContext } from "../../api/catalogs";
import { useAuth } from "../../auth/useAuth";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { Button } from "../Button";
import { SimpleCombobox } from "../Combobox";
import { Modal } from "../Modal";
import { overrideReasonText } from "./reasonLine";

export { overrideReasonCodeOf, overrideReasonText } from "./reasonLine";

/** Roles whose override is a plain confirm (same set as the engine's ROLE_OVERRIDE_CODES). */
export const OVERRIDE_CONFIRM_ROLES = ["Owner", "Accountant"] as const;

export function isOverrideConfirmRole(role: string | null | undefined): boolean {
  return (OVERRIDE_CONFIRM_ROLES as readonly string[]).includes(String(role ?? ""));
}

/** The role_only catalog rows an Owner / Accountant confirm stores (seeded by migration 202616230300). */
const ROLE_OVERRIDE_REASONS: Readonly<Record<(typeof OVERRIDE_CONFIRM_ROLES)[number], { code: string; label_en: string; label_es: string }>> = {
  Owner: { code: "owner_override", label_en: "Owner override", label_es: "Autorización del dueño" },
  Accountant: { code: "accountant_override", label_en: "Accountant override", label_es: "Autorización del contador" },
};

/** The chosen catalog reason, resolved for every caller (Owner / Accountant resolve to their role_only row). */
export type OverrideReasonChoice = {
  /** catalogs.override_reasons.reason_code — owner_override / accountant_override for a role confirm. */
  code: string;
  label_en: string;
  label_es: string;
  /** True when the Owner / Accountant confirmed without picking (role_only code). */
  role_override: boolean;
  /**
   * The catalog reason as one line — "<label> [<code>]" — for sites whose route still stores a reason sentence
   * (dispatch override_rules, settlement floor, onboarding). Picked from the catalog, never typed, always >= 10 chars.
   */
  text: string;
};

export function roleOverrideChoice(role: string | null | undefined): OverrideReasonChoice | null {
  if (!isOverrideConfirmRole(role)) return null;
  const r = ROLE_OVERRIDE_REASONS[role as (typeof OVERRIDE_CONFIRM_ROLES)[number]];
  return { ...r, role_override: true, text: overrideReasonText(r.code, r.label_en) };
}

export type OverrideButtonProps = {
  context: OverrideContext;
  /**
   * Called with null for Owner/Accountant, else the chosen catalog reason_code. The second argument is the resolved
   * catalog reason (code + labels + one-line text) for every role.
   */
  onConfirm: (reasonCode: string | null, choice: OverrideReasonChoice) => Promise<void> | void;
  label?: string;
  disabled?: boolean;
  testId?: string;
  size?: "sm" | "md";
};

export function OverrideButton({ context, onConfirm, label, disabled, testId = "override-button", size }: OverrideButtonProps) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const confirmOnly = isOverrideConfirmRole(user?.role);
  const [open, setOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reasonsQuery = useQuery({
    queryKey: ["override-reasons", companyId, context],
    queryFn: () => listOverrideReasons(companyId, { context }),
    enabled: open && !confirmOnly && Boolean(companyId),
  });
  const spanish = String(i18n.language ?? "").toLowerCase().startsWith("es");
  const options = useMemo(
    () => (reasonsQuery.data?.reasons ?? []).map((r) => ({ value: r.reason_code, label: spanish ? r.label_es : r.label_en })),
    [reasonsQuery.data, spanish]
  );

  const close = () => {
    setOpen(false);
    setReasonCode(null);
  };
  const confirm = async () => {
    if (!confirmOnly && !reasonCode) return;
    const picked = (reasonsQuery.data?.reasons ?? []).find((r) => r.reason_code === reasonCode);
    const choice: OverrideReasonChoice | null = confirmOnly
      ? roleOverrideChoice(user?.role)
      : picked
        ? {
            code: picked.reason_code,
            label_en: picked.label_en,
            label_es: picked.label_es,
            role_override: false,
            text: overrideReasonText(picked.reason_code, picked.label_en),
          }
        : null;
    if (!choice) return;
    setBusy(true);
    try {
      await onConfirm(confirmOnly ? null : reasonCode, choice);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" size={size} disabled={disabled} onClick={() => setOpen(true)} data-testid={testId}>
        {label ?? t("overrides.button")}
      </Button>
      <Modal open={open} onClose={close} title={t("overrides.title")} size="sm">
        <div className="space-y-3 text-xs text-[#1F2A44]" data-testid={`${testId}-dialog`}>
          {confirmOnly ? (
            <p data-testid={`${testId}-confirm-only`}>{t("overrides.confirmOnly")}</p>
          ) : (
            <label className="flex flex-col gap-1 font-semibold text-[#4B5563]">
              {t("overrides.reason")}
              <SimpleCombobox
                options={options}
                value={reasonCode}
                onChange={setReasonCode}
                loading={reasonsQuery.isLoading}
                placeholder={t("overrides.pickReason")}
                ariaLabel={t("overrides.reason")}
                dataTestId={`${testId}-reason`}
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close} disabled={busy}>
              {t("overrides.cancel")}
            </Button>
            <Button type="button" onClick={() => void confirm()} disabled={busy || (!confirmOnly && !reasonCode)} data-testid={`${testId}-confirm`}>
              {t("overrides.confirm")}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

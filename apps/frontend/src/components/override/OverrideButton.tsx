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

/** Roles whose override is a plain confirm (same set as the engine's ROLE_OVERRIDE_CODES). */
export const OVERRIDE_CONFIRM_ROLES = ["Owner", "Accountant"] as const;

export function isOverrideConfirmRole(role: string | null | undefined): boolean {
  return (OVERRIDE_CONFIRM_ROLES as readonly string[]).includes(String(role ?? ""));
}

export type OverrideButtonProps = {
  context: OverrideContext;
  /** Called with null for Owner/Accountant, else the chosen catalog reason_code. */
  onConfirm: (reasonCode: string | null) => Promise<void> | void;
  label?: string;
  disabled?: boolean;
  testId?: string;
};

export function OverrideButton({ context, onConfirm, label, disabled, testId = "override-button" }: OverrideButtonProps) {
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
    setBusy(true);
    try {
      await onConfirm(confirmOnly ? null : reasonCode);
      close();
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <Button type="button" variant="secondary" disabled={disabled} onClick={() => setOpen(true)} data-testid={testId}>
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

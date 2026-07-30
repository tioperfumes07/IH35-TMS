import { useState } from "react";
import { Link } from "react-router-dom";
import { ApiError } from "../../../api/client";
import {
  closeSettlementPayRun,
  PAYRUN_COA_ERROR_CODES,
  previewSettlementPayRun,
  type SettlementPayRunResult,
} from "../../../api/driverFinance";
import { Button } from "../../../components/Button";
import { PaymentMethodPicker } from "../../../components/driver-finance/PaymentMethodPicker";
import { EntityLink } from "../../../components/shared/EntityLink";
import { useToast } from "../../../components/Toast";

const COA_ROLES_HREF = "/accounting/settings/coa-roles";

const AUTHORITY_ROLES = new Set(["Owner", "Administrator", "Accountant"]);

type Props = {
  settlementId: string;
  companyId: string;
  userRole: string | null | undefined;
  settlementStatus: string;
  onPosted?: () => void;
};

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

function extractPayRunError(error: unknown): { code: string; message: string } {
  if (error instanceof ApiError && error.data && typeof error.data === "object") {
    const data = error.data as { error?: string; message?: string };
    return {
      code: String(data.error ?? `HTTP_${error.status}`),
      message: String(data.message ?? error.message),
    };
  }
  return { code: "UNKNOWN", message: String((error as Error)?.message ?? error) };
}

function isCoaDesignationError(code: string): boolean {
  return PAYRUN_COA_ERROR_CODES.has(code) || /ACCOUNT_MISSING|ROLE|COA|designat/i.test(code);
}

/**
 * Settlement pay-run preview + close — wires mounted
 * GET …/payrun-preview and POST …/payrun-close (LAW-E2E #3168 hop 3).
 * Fail-loud on CoA designation gaps (link to CoA Roles — never invent bindings).
 */
export function PayRunClosePanel({ settlementId, companyId, userRole, settlementStatus, onPosted }: Props) {
  const { pushToast } = useToast();
  const [paymentMethodId, setPaymentMethodId] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [busy, setBusy] = useState<"preview" | "close" | null>(null);
  const [result, setResult] = useState<SettlementPayRunResult | null>(null);
  const [errorBanner, setErrorBanner] = useState<{ code: string; message: string } | null>(null);

  const canAct = AUTHORITY_ROLES.has(String(userRole ?? ""));
  const postable = ["locked", "final", "closed", "paid", "approved", "ready"].includes(settlementStatus);


  if (!canAct) return null;

  async function runPreview() {
    if (!companyId) return;
    setBusy("preview");
    setErrorBanner(null);
    try {
      const data = await previewSettlementPayRun(settlementId, companyId, {
        payment_method_id: paymentMethodId || null,
      });
      setResult(data);
      pushToast(
        data.posting_enabled
          ? "Pay-run preview loaded"
          : "Pay-run preview only (SETTLEMENT_GL_POSTING_ENABLED OFF — no JE written)",
        "success"
      );
    } catch (error) {
      const parsed = extractPayRunError(error);
      setErrorBanner(parsed);
      setResult(null);
      pushToast(`${parsed.code}: ${parsed.message}`, "error");
    } finally {
      setBusy(null);
    }
  }

  async function runClose() {
    if (!companyId) return;
    setBusy("close");
    setErrorBanner(null);
    try {
      const data = await closeSettlementPayRun(settlementId, {
        operating_company_id: companyId,
        payment_method_id: paymentMethodId || null,
        payment_reference: paymentReference.trim() || null,
      });
      setResult(data);
      if (data.result === "posted" && data.journal_entry_id) {
        pushToast("Pay-run closed — journal entry posted", "success");
        onPosted?.();
      } else if (data.result === "previewed" || !data.posting_enabled) {
        pushToast(
          "Pay-run close returned preview only (flag OFF) — no JE / payrun_gl_runs written",
          "info"
        );
      } else {
        pushToast("Pay-run close completed", "success");
        onPosted?.();
      }
    } catch (error) {
      const parsed = extractPayRunError(error);
      setErrorBanner(parsed);
      pushToast(`${parsed.code}: ${parsed.message}`, "error");
    } finally {
      setBusy(null);
    }
  }


  return (
    <div
      className="rounded-sm border border-slate-300 bg-white p-3 text-sm"
      data-testid="payrun-close-panel"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pay-run GL close</p>
        {!postable ? (
          <span className="text-[10px] text-slate-600">Finalize/lock settlement before close</span>
        ) : null}
      </div>
      <p className="mb-2 text-xs text-gray-600">
        Preview computes balanced JE legs. Close posts only when{" "}
        <code className="rounded bg-slate-100 px-1">SETTLEMENT_GL_POSTING_ENABLED</code> is ON for this
        entity. CoA roles must already be designated — this panel never invents bindings.
      </p>

      <div className="mb-2 grid gap-2 sm:grid-cols-2">
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-gray-600">Payment method (net cash leg)</span>
          {/*
            LST-PICKER-01: reuse PaymentMethodPicker (Combobox first-row "+ Add new payment method"
            → POST catalogs.payment_methods). Prior native select had zero inline create — operators
            had to leave pay-run close and open Lists → Payment Methods.
          */}
          <div className="mt-1" data-testid="payrun-payment-method-picker">
            <PaymentMethodPicker
              operatingCompanyId={companyId}
              value={paymentMethodId || null}
              onChange={(next) => setPaymentMethodId(next ?? "")}
            />
          </div>
        </label>
        <label className="block text-xs">
          <span className="mb-1 block font-medium text-gray-600">Payment reference (optional)</span>
          <input
            value={paymentReference}
            onChange={(event) => setPaymentReference(event.target.value)}
            className="w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
            placeholder="Check # / ACH ref"
            data-testid="payrun-payment-reference"
          />
        </label>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="secondary"
          disabled={busy !== null || !companyId}
          onClick={() => void runPreview()}
          data-testid="payrun-preview-button"
        >
          {busy === "preview" ? "Previewing…" : "Preview pay-run JE"}
        </Button>
        <Button
          size="sm"
          disabled={busy !== null || !companyId || !postable}
          onClick={() => void runClose()}
          data-testid="payrun-close-button"
        >
          {busy === "close" ? "Closing…" : "Close pay-run"}
        </Button>
        <Link
          to={COA_ROLES_HREF}
          className="inline-flex items-center text-xs text-slate-700 underline"
          data-testid="payrun-coa-roles-link"
        >
          CoA Roles
        </Link>
      </div>

      {errorBanner ? (
        <div
          className="mb-3 border-l-4 border-red-600 bg-red-50 px-3 py-2 text-xs text-red-900"
          data-testid="payrun-error-banner"
          role="alert"
        >
          <p className="font-semibold">
            {errorBanner.code}: {errorBanner.message}
          </p>
          {isCoaDesignationError(errorBanner.code) ? (
            <p className="mt-1">
              Designate the missing role on{" "}
              <Link to={COA_ROLES_HREF} className="font-semibold underline" data-testid="payrun-error-coa-link">
                CoA Roles
              </Link>
              . Do not invent chart designations here. Depends on #3149 resolver + owner Neon designate
              (710000 roles) before live post is verified.
            </p>
          ) : null}
        </div>
      ) : null}

      {result ? (
        <div className="space-y-2 border-t border-gray-100 pt-2" data-testid="payrun-result">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className={`rounded-sm px-2 py-0.5 font-semibold ${
                result.result === "posted"
                  ? "bg-slate-100 text-slate-700"
                  : "bg-slate-100 text-slate-600"
              }`}
              data-testid="payrun-result-badge"
            >
              {result.result === "posted" ? "POSTED" : "PREVIEWED"}
            </span>
            <span className="text-gray-600">
              posting_enabled={String(result.posting_enabled)}
              {!result.posting_enabled
                ? " — flag OFF: preview cleared (not UNVERIFIED live post)"
                : result.journal_entry_id
                  ? ""
                  : " — awaiting JE id"}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-1 text-xs sm:grid-cols-3" data-testid="payrun-breakdown">
            <div>Gross {formatCents(result.breakdown.gross_cents)}</div>
            <div>Deductions {formatCents(result.breakdown.deductions_cents)}</div>
            <div>Advances {formatCents(result.breakdown.advance_recoveries_cents)}</div>
            <div>Chargebacks {formatCents(result.breakdown.chargebacks_cents)}</div>
            <div>Escrow {formatCents(result.breakdown.escrow_contribution_cents)}</div>
            <div className="font-semibold">Net {formatCents(result.breakdown.net_cents)}</div>
          </div>

          {/*
            Reverse drill-through (Law §9). The journal entry is the reachable accounting
            destination and renders as a real EntityLink. `payrun_gl_run_id` is deliberately NOT
            printed: no /payrun-gl-runs detail route exists, so displaying the bare uuid would put
            an unclickable dead-end id on screen — the exact defect the linkage law forbids, and it
            would have to be silenced in the EntityLink-adoption baseline. Give it a detail route
            first, then link it here through EntityLink like the JE.
          */}
          {result.journal_entry_id ? (
            <div className="flex flex-wrap gap-3 text-xs" data-testid="payrun-reverse-links">
              <span>
                Journal:{" "}
                <EntityLink
                  kind="journal_entry"
                  id={result.journal_entry_id}
                  label={`JE ${result.journal_entry_id.slice(0, 8)}`}
                  data-testid="payrun-je-link"
                />
              </span>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs" data-testid="payrun-je-legs">
              <thead>
                <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-500">
                  <th className="py-1 pr-2">Side</th>
                  <th className="py-1 pr-2">Amount</th>
                  <th className="py-1 pr-2">Account</th>
                  <th className="py-1">Description</th>
                </tr>
              </thead>
              <tbody>
                {result.je_preview.map((leg, idx) => (
                  <tr key={`${leg.account_id}-${idx}`} className="border-b border-gray-50">
                    <td className="py-1 pr-2 font-semibold uppercase">{leg.debit_or_credit}</td>
                    <td className="py-1 pr-2 tabular-nums">{formatCents(leg.amount_cents)}</td>
                    <td className="py-1 pr-2 font-mono text-[10px]">{leg.account_id.slice(0, 8)}</td>
                    <td className="py-1 text-gray-700">{leg.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}

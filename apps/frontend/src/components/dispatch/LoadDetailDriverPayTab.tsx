import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { formatMoneyCents } from "./constants";
import { entityLabel } from "../../lib/entity-label";
import { formatDateUS } from "../../lib/formatDate";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

/**
 * LDT-3 (owner item, 2026-09-05, deadline 06:00Z) — Load → Driver Pay tab.
 *
 * MEASURED LIVE (22:55Z, the prior version of this file): "1,610.0 practical mi × $0.60/mi ·
 * $958.69" — 1,610 × 0.60 = 966.00 ≠ 958.69. The prior component read driver_bills.rate_per_mile_cents
 * directly (a stored column that can be blended/wrong — filed to CC-2) as if it were the rate that
 * produced gross_amount_cents. Fixed at the SOURCE (GET /api/v1/driver-finance/loads/:loadId/
 * driver-pay-detail, driver-bills.routes.ts): every mileage line's rate is derived as
 * amount_cents / miles ON THE SAME ROW, never read from a column independently of the amount it
 * produced — SET-RATE law, "miles × rate ≠ amount" is impossible by construction, not merely
 * asserted. Two lines always (loaded + empty), matching LAW §2.
 */
type MileageLine = { kind: "loaded" | "empty"; miles: number | null; amount_cents: number | null; rate_cents_per_mile: number | null };
type Accessorial = { id: string; line_type: string; description: string; amount: string | number; approval_status: string };
type Deduction = { id: string; deduction_type: string; reason: string | null; amount_cents: string | number; status: string; applied_to_settlement_id: string | null };
type BrokerAdvance = { id: string; category: string; amount_cents: string | number; disbursed_amount_cents: string | number | null; disbursed_to_driver_bill_id: string | null };
type RateCard = { basis_type: string; rate_per_mile_cents: string | null; rate_empty_per_mile_cents: string | null; effective_from: string; effective_to: string | null };
type PostingPreview = {
  debit: Array<{ account_id: string; account_label: { account_number: string; account_name: string } | null; amount_cents: number }>;
  credit: Array<{ account_id: string; account_label: { account_number: string; account_name: string } | null; amount_cents: number }>;
  balanced: boolean;
  unresolved_reason: string | null;
};
type DriverPayDetail = {
  driver_id: string | null;
  driver_name: string | null;
  bill: { id: string; bill_number: string; status: string; gross_amount_cents: number } | null;
  mileage_lines: MileageLine[];
  accessorials: Accessorial[];
  deductions: Deduction[];
  broker_advances: BrokerAdvance[];
  rate_card: RateCard | null;
  posting_preview: PostingPreview;
};

type Props = {
  loadId: string;
  operatingCompanyId: string;
  currencyCode: "USD" | "MXN";
};

const DASH = "—";
const MILE_KIND_LABEL: Record<MileageLine["kind"], string> = { loaded: "Loaded miles", empty: "Empty miles" };

function fmtMiles(v: number | null): string {
  return v == null ? DASH : v.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
function fmtRate(cents: number | null): string {
  return cents == null ? DASH : `$${(cents / 100).toFixed(4)}`;
}
function pillClass(status: string): string {
  if (status === "approved") return "ldt-pill ok";
  if (status === "rejected") return "ldt-pill bad";
  return "ldt-pill warn";
}
function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LoadDetailDriverPayTab({ loadId, operatingCompanyId, currencyCode }: Props) {
  const hasParams = Boolean(loadId) && Boolean(operatingCompanyId);
  const query = useQuery({
    queryKey: ["driver-pay-detail", loadId, operatingCompanyId],
    enabled: hasParams,
    queryFn: () =>
      apiRequest<DriverPayDetail>(
        `/api/v1/driver-finance/loads/${encodeURIComponent(loadId)}/driver-pay-detail?operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
  });

  if (!hasParams || query.isLoading) {
    return <div className="py-8 text-center text-xs text-gray-500">Loading driver pay…</div>;
  }

  if (query.error) {
    const err = query.error as { status?: number };
    if (err?.status === 501) {
      return <div className="ldt-note">Driver finance module is not yet configured for this company.</div>;
    }
    if (err?.status === 403) {
      return <div className="ldt-note bad">You do not have permission to view driver pay for this load.</div>;
    }
    return <ListErrorState title="Failed to load driver pay data." status={err?.status ?? 0} onRetry={() => void query.refetch()} />;
  }

  const data = query.data;
  if (!data || !data.bill) {
    return (
      <div className="ldt-note">
        No driver bill for this load yet.
        <div className="ldt-muted" style={{ marginTop: 4 }}>
          Payables mint when the load is booked with miles and a driver pay rate (or on deliver when that path is armed).
        </div>
      </div>
    );
  }

  const { bill, mileage_lines, accessorials, deductions, broker_advances, rate_card, posting_preview, driver_id, driver_name } = data;
  const knownLineTotal = mileage_lines.reduce((s, l) => s + (l.amount_cents ?? 0), 0) + accessorials.reduce((s, a) => s + Math.round(Number(a.amount) * 100), 0);

  return (
    <div className="ldt-body">
      <div className="ldt-rowbar">
        <div>
          {driver_id ? (
            <EntityLink kind="driver" id={driver_id} label={entityLabel(driver_name, driver_id, "Driver")} className="ldt-k" />
          ) : (
            <span className="ldt-muted">No driver</span>
          )}
          <span className="ldt-sub">{bill.bill_number} · <span className={pillClass(bill.status === "open" ? "pending" : "approved")}>{statusLabel(bill.status)}</span></span>
        </div>
        {rate_card ? (
          <span className="ldt-muted">
            Rate card: {rate_card.basis_type === "per_load_pay" ? "flat per load" : "per mile"} · effective {formatDateUS(rate_card.effective_from)}
          </span>
        ) : (
          <span className="ldt-muted">No active rate card on file for this driver</span>
        )}
      </div>

      <div className="ldt-card">
        <div className="ldt-ch">Driver Pay</div>
        <div className="ldt-rows ldt-rows-4">
          <div className="ldt-row head">
            <span>Line</span><span>Miles</span><span>Rate</span><span>Amount</span>
          </div>
          {mileage_lines.map((line) => (
            <div className="ldt-row" key={line.kind}>
              <span>{MILE_KIND_LABEL[line.kind]}</span>
              <span className="ldt-m">{fmtMiles(line.miles)}</span>
              <span className="ldt-m">
                {line.miles == null ? <span title="no telematics miles for this leg">{DASH}</span> : fmtRate(line.rate_cents_per_mile)}
              </span>
              <span className="ldt-m">{line.amount_cents == null ? DASH : formatMoneyCents(line.amount_cents, currencyCode)}</span>
            </div>
          ))}
          {accessorials.map((a) => (
            <div className="ldt-row" key={a.id}>
              <span>
                {a.line_type === "detention_pay" ? "Detention" : "Accessorial"} — {a.description}{" "}
                <span className={pillClass(a.approval_status)}>{statusLabel(a.approval_status)}</span>
              </span>
              <span className="ldt-m">{DASH}</span>
              <span className="ldt-m">{DASH}</span>
              <span className="ldt-m">{formatMoneyCents(Math.round(Number(a.amount) * 100), currencyCode)}</span>
            </div>
          ))}
          <div className="ldt-row tot">
            <span>Lines total (mileage + accessorials)</span><span /><span />
            <span className="ldt-m">{formatMoneyCents(knownLineTotal, currencyCode)}</span>
          </div>
          <div className="ldt-row big">
            <span>Gross (driver bill)</span><span /><span />
            <span className="ldt-m">{formatMoneyCents(bill.gross_amount_cents, currencyCode)}</span>
          </div>
        </div>
        <div className="ldt-hint">
          Rate is <b>always</b> amount ÷ miles on this same line — a stored rate can never disagree with the amount it produced.
        </div>
      </div>

      <div className="ldt-card">
        <div className="ldt-ch">Deductions &amp; advances touching this load</div>
        {deductions.length === 0 && broker_advances.length === 0 ? (
          <div className="ldt-hint">None on file for this load.</div>
        ) : (
          <div className="ldt-rows ldt-rows-4">
            <div className="ldt-row head">
              <span>Item</span><span /><span>Status</span><span>Amount</span>
            </div>
            {deductions.map((d) => (
              <div className="ldt-row" key={d.id}>
                <span>{d.reason ?? statusLabel(d.deduction_type)}</span>
                <span />
                <span className={pillClass(d.applied_to_settlement_id ? "approved" : "pending")}>
                  {d.applied_to_settlement_id ? "Applied" : statusLabel(d.status)}
                </span>
                <span className="ldt-m">−{formatMoneyCents(Number(d.amount_cents), currencyCode)}</span>
              </div>
            ))}
            {broker_advances.map((b) => (
              <div className="ldt-row" key={b.id}>
                <span>Broker advance — {statusLabel(b.category)}</span>
                <span />
                <span className={pillClass(b.disbursed_to_driver_bill_id ? "approved" : "pending")}>
                  {b.disbursed_to_driver_bill_id ? "Disbursed" : "Pending disbursement"}
                </span>
                <span className="ldt-m">{formatMoneyCents(Number(b.disbursed_amount_cents ?? b.amount_cents), currencyCode)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="ldt-card">
        <div className="ldt-ch">Posting preview — when the tour closes</div>
        {posting_preview.balanced ? (
          <div className="ldt-rows ldt-rows-4">
            <div className="ldt-row head">
              <span>Account</span><span>Side</span><span /><span>Amount</span>
            </div>
            {posting_preview.debit.map((d) => (
              <div className="ldt-row" key={`d-${d.account_id}`}>
                <span>{d.account_label ? `${d.account_label.account_number} ${d.account_label.account_name}` : d.account_id}</span>
                <span style={{ color: "var(--ldt-debit)", fontWeight: 600 }}>Debit</span>
                <span />
                <span className="ldt-m">{formatMoneyCents(d.amount_cents, currencyCode)}</span>
              </div>
            ))}
            {posting_preview.credit.map((c) => (
              <div className="ldt-row" key={`c-${c.account_id}`}>
                <span>{c.account_label ? `${c.account_label.account_number} ${c.account_label.account_name}` : c.account_id}</span>
                <span style={{ color: "var(--ldt-accent)", fontWeight: 600 }}>Credit</span>
                <span />
                <span className="ldt-m">{formatMoneyCents(c.amount_cents, currencyCode)}</span>
              </div>
            ))}
            <div className="ldt-row tot">
              <span>In balance</span><span /><span /><span className="ldt-m"><span className="ldt-pill ok">Balanced</span></span>
            </div>
          </div>
        ) : (
          <div className="ldt-note warn">Preview unavailable — {posting_preview.unresolved_reason ?? "GL account not resolved"}.</div>
        )}
        <div className="ldt-hint">Preview only — nothing here posts. The real journal entry is created when the driver's settlement pay run closes.</div>
      </div>
    </div>
  );
}

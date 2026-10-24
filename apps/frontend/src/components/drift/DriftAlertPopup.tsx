import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { fetchReconcilerExceptions, type ReconcilerException } from "../../api/reconciler";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { useTranslation } from "../../hooks/useTranslation";
import { Button } from "../Button";
import { Modal } from "../Modal";

/**
 * LEAD 443.327 — app-wide DRIFT ALERT (owner 10-24 2:43 PM CT): "a pop up message should appear in dispatch,
 * accounting, anywhere in the app every 30 minutes if there is a drift … if there is no address or no amount etc every
 * 20-30 minutes until it is updated." Mounted once in the Topbar, so it rides every page.
 *
 * ONE ENGINE: it reads GET /api/v1/reconciler/exceptions (the reconciler — I2 delivered-not-invoiced, I8 load missing
 * truck/trailer/driver/reference, I9 dispatch drift: truck cannot make its next stop, stop without a date or a street
 * address, load without a rate). It computes nothing itself. The check repeats every 30 minutes; "Remind me in 30
 * minutes" hides it until the next check; it keeps coming back until the engine reports the breach fixed.
 */
export const DRIFT_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const SNOOZE_KEY = "ih35.driftAlert.snoozedUntil";

function readSnooze(companyId: string): number {
  try {
    return Number(window.localStorage.getItem(`${SNOOZE_KEY}.${companyId}`) ?? 0) || 0;
  } catch {
    return 0;
  }
}
function writeSnooze(companyId: string, until: number) {
  try {
    window.localStorage.setItem(`${SNOOZE_KEY}.${companyId}`, String(until));
  } catch {
    /* storage unavailable: the popup simply returns at the next check */
  }
}

const FIELD_LABEL: Record<string, string> = {
  truck_cannot_make_next_stop: "Wrong place",
  stop_no_date: "No stop date",
  stop_no_street_address: "No street address",
  load_no_amount: "No rate",
  unit: "No truck",
  trailer: "No trailer",
  driver: "No driver",
  customer_reference: "No W.O. / PO",
  invoice: "Not invoiced",
};

export function driftRows(exceptions: ReconcilerException[]) {
  const order = ["truck_cannot_make_next_stop", "stop_no_street_address", "load_no_amount", "stop_no_date"];
  return [...exceptions].sort((a, b) => {
    const ia = order.indexOf(a.field);
    const ib = order.indexOf(b.field);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.entity_label.localeCompare(b.entity_label);
  });
}

export function DriftAlertPopup() {
  const { selectedCompanyId } = useCompanyContext();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const companyId = selectedCompanyId ?? "";

  const q = useQuery({
    queryKey: ["drift-alert", "reconciler-exceptions", companyId],
    queryFn: ({ signal }) => fetchReconcilerExceptions(companyId, signal),
    enabled: Boolean(companyId),
    refetchInterval: DRIFT_CHECK_INTERVAL_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: false,
    staleTime: DRIFT_CHECK_INTERVAL_MS - 60_000,
  });

  const rows = useMemo(() => driftRows(q.data?.results.flatMap((r) => r.exceptions) ?? []), [q.data]);

  useEffect(() => {
    if (!companyId || rows.length === 0) {
      setOpen(false);
      return;
    }
    if (Date.now() >= readSnooze(companyId)) setOpen(true);
  }, [companyId, rows.length, q.dataUpdatedAt]);

  if (!companyId || rows.length === 0) return null;

  const remindLater = () => {
    writeSnooze(companyId, Date.now() + DRIFT_CHECK_INTERVAL_MS);
    setOpen(false);
  };

  return (
    <Modal open={open} onClose={remindLater} title={rows.length === 1 ? t("topbar.driftAlert.title_one", "1 item needs attention") : t("topbar.driftAlert.title_other", `${rows.length} items need attention`, { count: rows.length })} modalKind="drift-alert" sizePreset="lg" resizable>
      <div className="flex min-h-0 flex-col gap-3" data-testid="drift-alert-popup">
        <p className="text-xs text-gray-700">
          {t("topbar.driftAlert.checked", "Checked {{date}} at {{time}}. This message comes back every 30 minutes until each item is fixed.", {
            date: q.data ? formatDateUS(q.data.ran_at) : "—",
            time: q.data ? new Date(q.data.ran_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) : "—",
          })}
        </p>
        <div className="max-h-[55vh] overflow-auto rounded-sm border border-[#E5E7EB]">
          <table className="w-full table-fixed border-collapse text-xs">
            <colgroup>
              <col className="w-[84px]" />
              <col className="w-[132px]" />
              <col />
            </colgroup>
            <thead className="sticky top-0 bg-[#F3F4F6] text-left text-gray-700">
              <tr>
                <th className="px-2 py-1.5 font-normal">{t("topbar.driftAlert.colLoad", "Load")}</th>
                <th className="px-2 py-1.5 font-normal">{t("topbar.driftAlert.colProblem", "Problem")}</th>
                <th className="px-2 py-1.5 font-normal">{t("topbar.driftAlert.colFix", "What to fix")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-[#E5E7EB] align-top" data-testid="drift-alert-row">
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {r.entity_type === "load" ? (
                      <Link to={`/dispatch/loads/${r.entity_id}`} onClick={remindLater} className="text-[#1D4ED8] hover:underline">
                        {r.entity_label}
                      </Link>
                    ) : (
                      r.entity_label
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-1.5 text-gray-900">{t(`topbar.driftAlert.field.${r.field}`, FIELD_LABEL[r.field] ?? r.field)}</td>
                  <td className="break-words px-2 py-1.5 text-gray-700">{r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => { remindLater(); navigate("/tasks/exceptions"); }}>
            {t("topbar.driftAlert.openList", "Open the full list")}
          </Button>
          <Button type="button" variant="primary" onClick={remindLater} data-testid="drift-alert-remind">
            {t("topbar.driftAlert.remind", "Remind me in 30 minutes")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

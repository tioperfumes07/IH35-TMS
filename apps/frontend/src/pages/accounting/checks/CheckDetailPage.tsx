// R-172 step 8 -- the check's own detail view + More menu (Void / Copy / Transaction journal /
// Audit history). A check IS an accounting.expenses row (R-154 §2), but voiding one must go through
// the CHECK-specific voidCheck() (check_number_registry stamping, print_status, etc.) -- reusing
// ExpenseDetailPage's generic void would silently skip that, so this is its own page, not a shared one.
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { useToast } from "../../../components/Toast";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { VoidedBanner } from "../../../components/accounting/VoidedBanner";
import { EntityLink } from "../../../components/shared/EntityLink";
import { formatDateUS } from "../../../lib/formatDate";
import { getCheck, voidCheckApi, type CheckDetailLine } from "../../../api/checks";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

function formatMoneyCents(cents: number): string {
  return (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

export function CheckDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [voidOpen, setVoidOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const query = useQuery({
    queryKey: ["checks", "detail", companyId, id],
    queryFn: () => getCheck(companyId, id),
    enabled: Boolean(companyId && id),
  });

  if (!companyId) {
    return (
      <AccountingSubNavWrapper title="Checks" subtitle="Check">
        <div className="text-xs text-red-600">Select an operating company in the shell header.</div>
      </AccountingSubNavWrapper>
    );
  }
  if (query.isLoading) {
    return (
      <AccountingSubNavWrapper title="Checks" subtitle="Check">
        <div className="text-xs text-gray-400">Loading…</div>
      </AccountingSubNavWrapper>
    );
  }
  if (query.isError || !query.data) {
    return (
      <AccountingSubNavWrapper title="Checks" subtitle="Check">
        <div className="text-xs text-red-600">Check not found.</div>
      </AccountingSubNavWrapper>
    );
  }

  const { check, lines } = query.data;
  const isVoided = check.status === "void";

  const lineColumns: Array<ParityColumn<CheckDetailLine>> = [
    { key: "line_sequence", label: "#", sortable: false, className: "w-12", cellClass: "text-gray-500" },
    { key: "description", label: "Description", sortable: false },
    {
      key: "amount_cents",
      label: "Amount",
      sortable: false,
      className: "w-28",
      render: (line) => formatMoneyCents(line.amount_cents),
    },
  ];

  return (
    <AccountingSubNavWrapper
      title="Checks"
      subtitle={`Check ${check.check_number ?? "(to print)"}`}
      actions={
        <div className="relative">
          <button
            type="button"
            className="rounded border border-gray-300 px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
            onClick={() => setMoreOpen((v) => !v)}
            data-testid="check-more-menu-trigger"
          >
            More
          </button>
          {moreOpen ? (
            <div className="absolute right-0 z-30 mt-1 min-w-[180px] rounded-sm border border-gray-200 bg-white py-1 shadow-lg" data-testid="check-more-menu">
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-xs text-gray-800 hover:bg-gray-50"
                onClick={() => {
                  setMoreOpen(false);
                  navigate(`/accounting/checks/new?copy_from=${check.id}`);
                }}
              >
                Copy
              </button>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-xs text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                disabled={!check.journal_entry_id}
                onClick={() => {
                  setMoreOpen(false);
                  if (check.journal_entry_id) navigate(`/accounting/journal-entries/${check.journal_entry_id}`);
                }}
              >
                Transaction journal
              </button>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-xs text-gray-800 hover:bg-gray-50"
                onClick={() => {
                  setMoreOpen(false);
                  navigate(`/accounting/audit-trail?source_type=expense&source_id=${check.id}`);
                }}
              >
                Audit history
              </button>
              <button
                type="button"
                className="block w-full px-4 py-2 text-left text-xs text-gray-800 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                disabled={isVoided}
                onClick={() => {
                  setMoreOpen(false);
                  setVoidOpen(true);
                }}
              >
                {isVoided ? "Voided" : "Void"}
              </button>
            </div>
          ) : null}
        </div>
      }
    >
      <div className="flex flex-col gap-4 p-4">
        <VoidedBanner voidedAt={check.voided_at} voidReason={check.void_reason} voidedByUserId={check.voided_by_user_id} documentLabel="Check" />

        <div className="grid grid-cols-4 gap-4 rounded border border-gray-200 p-3 text-xs">
          <div>
            <div className="font-semibold text-gray-500">Payee</div>
            <div>{check.print_on_check_name}</div>
          </div>
          <div>
            <div className="font-semibold text-gray-500">Payment date</div>
            <div>{formatDateUS(check.transaction_date)}</div>
          </div>
          <div>
            <div className="font-semibold text-gray-500">Check no.</div>
            <div>{check.check_number ?? "(to print)"}</div>
          </div>
          <div>
            <div className="font-semibold text-gray-500">Total</div>
            <div>{formatMoneyCents(Number(check.total_amount_cents))}</div>
          </div>
          <div>
            <div className="font-semibold text-gray-500">Status</div>
            <div className="capitalize">{check.status}</div>
          </div>
          <div>
            <div className="font-semibold text-gray-500">Posting</div>
            <div>
              {check.posting_status === "posted" && check.journal_entry_id ? (
                <EntityLink kind="journal_entry" id={check.journal_entry_id} label="Posted" />
              ) : (
                <span className="text-gray-500">{check.posting_status}</span>
              )}
            </div>
          </div>
          <div>
            <div className="font-semibold text-gray-500">Print status</div>
            <div>{check.print_status}</div>
          </div>
          {check.memo ? (
            <div className="col-span-4">
              <div className="font-semibold text-gray-500">Memo</div>
              <div>{check.memo}</div>
            </div>
          ) : null}
        </div>

        <div className="rounded border border-gray-200">
          <ParityTable<CheckDetailLine>
            columns={lineColumns}
            rows={lines}
            rowKey={(line) => line.id}
            emptyText="No lines."
            pageSize={lines.length || 1}
            hidePager
            enableColumnResize={false}
            enableColumnReorder={false}
          />
        </div>
      </div>

      <VoidReasonModal
        open={voidOpen}
        title="Void Check"
        entityRef={check.check_number ?? undefined}
        onClose={() => setVoidOpen(false)}
        onSubmit={async (reason) => {
          await voidCheckApi(companyId, check.id, reason);
          setVoidOpen(false);
          pushToast("Check voided", "success");
          await queryClient.invalidateQueries({ queryKey: ["checks", "detail", companyId, id] });
        }}
      />
    </AccountingSubNavWrapper>
  );
}

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import {
  cashAdvanceRequestsOfficeApi,
  type CashAdvanceRequestRow,
} from "../../api/cashAdvanceRequests";

// B6 — Driver Inbox (inside Driver Hub Home). Built to APPROVED-PREVIEW-driver-inbox.html.
// Locked tokens: navy banner #1A1F36, white active-tab underline; cards #fff / #e5e7eb 4px;
// labels 9px uppercase #6B7280; green #16A34A; text #1A1F36/#4A5170/#8A92AB; base 12px.
// Only "Cash advances" has a backend; other tabs are honest empty states (no fake data).
// "Approve & post" calls the OFFICE endpoint = the B5 cascade.

type TabKey = "all" | "cash_advance" | "load_update" | "repair" | "complaint";
const TABS: { key: TabKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cash_advance", label: "Cash advances" },
  { key: "load_update", label: "Load updates" },
  { key: "repair", label: "Repairs" },
  { key: "complaint", label: "Complaints" },
];

type CatalogAccount = { id: string; account_number: string | null; account_name: string | null; account_type: string | null };

function initials(name: string): string {
  const parts = name.replace(/,/g, "").trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}
function usd(cents: unknown) {
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(Number(cents ?? 0) / 100);
}

export function DriverInbox({ companyId, canReview }: { companyId: string; canReview: boolean }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [payFrom, setPayFrom] = useState<Record<string, string>>({});
  const [denyForId, setDenyForId] = useState<string | null>(null);
  const [denyReason, setDenyReason] = useState("");

  const pendingKey = ["driver-inbox", "cash-advance", "pending", companyId];
  const pendingQuery = useQuery({
    queryKey: pendingKey,
    queryFn: () => cashAdvanceRequestsOfficeApi.listPending(companyId),
    enabled: Boolean(companyId) && canReview,
  });

  // Pay-from accounts (catalogs.accounts → real id for B5 credit_account_id).
  const accountsQuery = useQuery({
    queryKey: ["catalogs-accounts", companyId],
    queryFn: () =>
      apiRequest<{ accounts?: CatalogAccount[]; items?: CatalogAccount[] }>(
        `/api/v1/catalogs/accounts?operating_company_id=${encodeURIComponent(companyId)}`
      ),
    enabled: Boolean(companyId) && canReview,
  });
  const payFromAccounts = useMemo(() => {
    const list = accountsQuery.data?.accounts ?? accountsQuery.data?.items ?? [];
    return list.filter((a) => ["Bank", "Checking", "Savings", "CashOnHand", "Asset"].includes(String(a.account_type ?? "")));
  }, [accountsQuery.data]);

  const cashRows = (pendingQuery.data?.requests ?? []) as CashAdvanceRequestRow[];
  const counts: Record<TabKey, number> = {
    all: cashRows.length,
    cash_advance: cashRows.length,
    load_update: 0,
    repair: 0,
    complaint: 0,
  };

  // Opening a card fires the B4 'viewed' event (the office detail GET) + loads preview/timeline.
  const detailQuery = useQuery({
    queryKey: ["driver-inbox", "detail", companyId, openId],
    queryFn: () => cashAdvanceRequestsOfficeApi.get(companyId, String(openId)),
    enabled: Boolean(companyId && openId),
  });
  const previewQuery = useQuery({
    queryKey: ["driver-inbox", "preview", companyId, openId],
    queryFn: () => cashAdvanceRequestsOfficeApi.cascadePreview(companyId, String(openId)),
    enabled: Boolean(companyId && openId),
  });
  const timelineQuery = useQuery({
    queryKey: ["driver-inbox", "timeline", companyId, openId],
    queryFn: () => cashAdvanceRequestsOfficeApi.timeline(companyId, String(openId)),
    enabled: Boolean(companyId && openId),
  });

  const approveMut = useMutation({
    mutationFn: async (id: string) =>
      cashAdvanceRequestsOfficeApi.approve(companyId, id, { credit_account_id: payFrom[id] || undefined }),
    onSuccess: () => {
      setOpenId(null);
      void qc.invalidateQueries({ queryKey: pendingKey });
    },
  });
  const denyMut = useMutation({
    mutationFn: async () => cashAdvanceRequestsOfficeApi.deny(companyId, String(denyForId), { denial_reason: denyReason.trim() }),
    onSuccess: () => {
      setDenyForId(null);
      setDenyReason("");
      void qc.invalidateQueries({ queryKey: pendingKey });
    },
  });

  if (!canReview) return <p className="text-[12px] text-[#8A92AB]">Reviewing requests requires a Manager, Accountant, or Owner role.</p>;
  if (!companyId) return <p className="text-[12px] text-[#8A92AB]">Select an operating company to view the inbox.</p>;

  const showCash = tab === "all" || tab === "cash_advance";

  return (
    <div className="overflow-hidden rounded border border-[#e5e7eb] bg-[#f8f8f4]">
      <div className="px-[18px] pt-[14px] pb-[10px]">
        <span className="text-[20px] font-semibold text-[#1A1F36]">Inbox</span>
        <span className="ml-[10px] text-[12px] text-[#8A92AB]">Driver Hub · requests from the driver app</span>
      </div>

      {/* Navy filter strip — NavyPageSubNav locked tokens, as client-side filter buttons with counts */}
      <div className="flex overflow-x-auto bg-[#1A1F36] px-[18px]">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`whitespace-nowrap px-3 py-[10px] text-[12px] ${active ? "border-b-2 border-white font-semibold text-white" : "text-[#c7ccd9]"}`}
            >
              {t.label} {counts[t.key]}
            </button>
          );
        })}
      </div>

      <div className="px-[18px] py-[14px]">
        {pendingQuery.isLoading ? (
          <p className="text-[12px] text-[#8A92AB]">Loading…</p>
        ) : pendingQuery.isError ? (
          <p className="text-[12px] text-red-600">Could not load requests.</p>
        ) : showCash && cashRows.length > 0 ? (
          cashRows.map((row) => {
            const id = String(row.id ?? "");
            const name = String(row.driver_name ?? "Driver");
            const open = openId === id;
            const preview = previewQuery.data;
            const timeline = (timelineQuery.data?.timeline ?? null) as Record<string, unknown> | null;
            return (
              <div key={id} className="mb-[10px] rounded border border-[#e5e7eb] bg-white px-[14px] py-3">
                <button type="button" className="flex w-full items-start gap-[10px] text-left" onClick={() => setOpenId(open ? null : id)}>
                  <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-[#eef0f4] text-[11px] font-semibold text-[#4A5170]">
                    {initials(name)}
                  </span>
                  <span className="flex-1">
                    <span className="block">
                      <span className="text-[13px] font-semibold text-[#1A1F36]">{name}</span>{" "}
                      <span className="rounded-sm bg-[#fef3e2] px-[6px] py-[2px] text-[9px] font-semibold uppercase tracking-[0.25px] text-[#854f0b]">Cash advance</span>{" "}
                      <span className="text-[11px] text-[#8A92AB]">
                        {String(row.submitted_at ?? "").replace("T", " ").slice(0, 16)}
                        {timeline?.viewed_at ? " · viewed" : ""}
                      </span>
                    </span>
                    <span className="mt-1 block text-[12px] text-[#4A5170]">"{String(row.reason ?? "")}"</span>
                  </span>
                  <span className="text-[16px] font-semibold whitespace-nowrap text-[#1A1F36]">{usd(row.requested_amount_cents)}</span>
                </button>

                {open ? (
                  <div className="mt-[10px] rounded border border-[#e5e7eb] bg-[#f8f8f4] px-[11px] py-[9px]">
                    <div className="mb-[7px] text-[9px] font-semibold uppercase tracking-[0.25px] text-[#6B7280]">
                      Linkage — what posts on approve
                    </div>
                    {previewQuery.isLoading ? (
                      <p className="text-[11px] text-[#8A92AB]">Computing…</p>
                    ) : preview ? (
                      <div className="grid grid-cols-[auto_1fr] gap-x-[12px] gap-y-[5px] text-[12px]">
                        <span className="text-[#8A92AB]">Linked to</span>
                        <span className="text-[#1A1F36]">
                          {preview.branch === "load_bill" ? (
                            <>
                              Active load's bill <span className="text-[#16A34A]">auto-linked (driver assigned)</span>
                            </>
                          ) : preview.branch === "open_bill" ? (
                            "Open driver bill"
                          ) : (
                            "— No active bill: creates an employee loan (recovered on future settlements) —"
                          )}
                        </span>
                        <span className="text-[#8A92AB]">Posts as</span>
                        <span className="text-[#1A1F36]">
                          {preview.resolved_account
                            ? `${preview.resolved_account.posting_side} → ${preview.resolved_account.account_number ?? ""} ${preview.resolved_account.account_name ?? ""}`
                            : "account mapping not found"}
                        </span>
                        <span className="text-[#8A92AB]">Pay from</span>
                        <span>
                          <select
                            className="h-[28px] w-full rounded-sm border border-[#e5e7eb] text-[11px]"
                            value={payFrom[id] ?? ""}
                            onChange={(e) => setPayFrom((p) => ({ ...p, [id]: e.target.value }))}
                          >
                            <option value="">Company default cash account</option>
                            {payFromAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.account_number} · {a.account_name}
                              </option>
                            ))}
                          </select>
                        </span>
                        <span className="text-[#8A92AB]">Also</span>
                        <span className="text-[#1A1F36]">Settlement deduction on next pay</span>
                      </div>
                    ) : (
                      <p className="text-[11px] text-red-600">Could not compute the cascade preview.</p>
                    )}

                    <div className="mt-[10px] flex justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-sm border border-[#e5e7eb] bg-white px-3 py-[5px] text-[11px] text-[#4A5170]"
                        onClick={() => setDenyForId(id)}
                      >
                        Deny
                      </button>
                      <button
                        type="button"
                        disabled={approveMut.isPending}
                        className="rounded-sm border border-[#16A34A] bg-[#16A34A] px-[14px] py-[5px] text-[11px] font-semibold text-white disabled:opacity-70"
                        onClick={() => approveMut.mutate(id)}
                      >
                        Approve &amp; post
                      </button>
                    </div>
                    {approveMut.isError ? <p className="mt-1 text-[11px] text-red-600">Approve &amp; post failed — try again.</p> : null}
                    {detailQuery.isError ? null : null}
                  </div>
                ) : null}
              </div>
            );
          })
        ) : (
          <p className="text-[12px] text-[#8A92AB]">
            {tab === "all" || tab === "cash_advance" ? "No pending cash-advance requests." : "No requests of this type yet."}
          </p>
        )}
      </div>

      {denyForId ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg bg-white p-4 shadow-lg">
            <h2 className="text-base font-semibold text-[#1A1F36]">Deny request</h2>
            <p className="mt-1 text-[12px] text-[#8A92AB]">Reason is recorded to the audit trail and shared with the driver.</p>
            <textarea
              className="mt-3 w-full rounded border border-[#e5e7eb] p-2 text-sm"
              rows={4}
              value={denyReason}
              onChange={(e) => setDenyReason(e.target.value)}
              placeholder="Denial reason (required)"
            />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" className="rounded-sm border border-[#e5e7eb] bg-white px-3 py-[5px] text-[11px] text-[#4A5170]" onClick={() => setDenyForId(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={denyReason.trim().length < 1 || denyMut.isPending}
                className="rounded-sm border border-[#16A34A] bg-[#16A34A] px-[14px] py-[5px] text-[11px] font-semibold text-white disabled:opacity-60"
                onClick={() => void denyMut.mutate()}
              >
                Confirm deny
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

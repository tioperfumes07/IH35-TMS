import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { listVendorBills } from "../api/accounting";
import { getVendor } from "../api/mdata";
import { useAuth } from "../auth/useAuth";
import { DocumentsTab } from "../components/documents/DocumentsTab";
import { Button } from "../components/Button";
import { DataPanel } from "../components/layout/DataPanel";
import { DataPanelRow } from "../components/layout/DataPanelRow";
import { PageHeader } from "../components/forms/shared/PageHeader";
import { useCompanyContext } from "../contexts/CompanyContext";

const tabs = ["Profile", "A/P", "Documents", "Audit History"] as const;
type VendorTab = (typeof tabs)[number];

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function VendorDetailPage() {
  const { id = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [activeTab, setActiveTab] = useState<VendorTab>("Profile");

  useEffect(() => {
    if (searchParams.get("tab") === "ap") setActiveTab("A/P");
  }, [searchParams]);

  const vendorQuery = useQuery({
    queryKey: ["vendor", id],
    queryFn: () => getVendor(id),
    enabled: Boolean(id),
  });

  const billsQuery = useQuery({
    queryKey: ["vendor-ap-bills", companyId, id],
    queryFn: () => listVendorBills(companyId, { vendor_id: id, include_balance: true, limit: 200 }),
    enabled: Boolean(companyId) && Boolean(id) && activeTab === "A/P",
  });

  const canViewDocuments = useMemo(
    () =>
      user?.role === "Owner" ||
      user?.role === "Administrator" ||
      user?.role === "Manager" ||
      user?.role === "Accountant" ||
      user?.role === "Mechanic",
    [user?.role]
  );

  if (vendorQuery.isLoading) return <div className="text-sm text-gray-500">Loading vendor...</div>;
  if (!vendorQuery.data) {
    return (
      <div className="space-y-3">
        <div className="text-sm text-red-600">Vendor not found.</div>
        <Button variant="secondary" onClick={() => navigate("/vendors")}>
          Back to Vendors
        </Button>
      </div>
    );
  }

  const vendor = vendorQuery.data;

  return (
    <div className="space-y-3">
      <PageHeader
        title={vendor.name}
        backHref="/vendors"
        breadcrumb={[
          { label: "Vendors", href: "/vendors" },
          { label: vendor.name },
        ]}
        subtitle={vendor.vendor_type}
        actions={
          <span className={`rounded px-2 py-1 text-xs font-semibold ${vendor.deactivated_at ? "bg-gray-200 text-gray-700" : "bg-emerald-100 text-emerald-700"}`}>
            {vendor.deactivated_at ? "Inactive" : "Active"}
          </span>
        }
      />

      <div className="overflow-x-auto rounded-md border border-gray-200 bg-white p-0.5">
        <div className="flex min-w-max gap-1">
          {tabs
            .filter((tab) => tab !== "Documents" || canViewDocuments)
            .map((tab) => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`rounded px-2.5 py-1.5 text-xs font-medium ${activeTab === tab ? "bg-sky-100 text-sky-800" : "text-gray-700 hover:bg-gray-100"}`}
              >
                {tab}
              </button>
            ))}
        </div>
      </div>

      {activeTab === "Profile" ? (
        <DataPanel title="Vendor Profile">
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor Name</span>
            <span className="text-sm text-gray-900">{vendor.name}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Vendor Type</span>
            <span className="text-sm text-gray-900">{vendor.vendor_type}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Phone</span>
            <span className="text-sm text-gray-900">{vendor.phone ?? "-"}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Email</span>
            <span className="text-sm text-gray-900">{vendor.email ?? "-"}</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Payment Terms</span>
            <span className="text-sm text-gray-900">Defined in accounting workflow</span>
          </DataPanelRow>
          <DataPanelRow>
            <span className="text-xs font-semibold text-gray-600">Notes</span>
            <span className="text-sm text-gray-900">{vendor.notes ?? "-"}</span>
          </DataPanelRow>
        </DataPanel>
      ) : null}

      {activeTab === "A/P" ? (
        <div className="space-y-2">
          {!companyId ? <p className="text-sm text-red-600">Select an operating company.</p> : null}
          {billsQuery.isLoading ? <p className="text-sm text-gray-500">Loading bills…</p> : null}
          {billsQuery.isError ? <p className="text-sm text-red-600">Could not load bills.</p> : null}
          {billsQuery.isSuccess ? (
            <div className="overflow-auto rounded border border-gray-200 bg-white">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-gray-100 bg-gray-50 text-[11px] font-semibold uppercase text-gray-600">
                  <tr>
                    <th className="px-3 py-2">Bill #</th>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Due</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2 text-right">Balance</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {billsQuery.data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-4 text-gray-500">
                        No bills for this vendor.
                      </td>
                    </tr>
                  ) : null}
                  {billsQuery.data.rows.map((b) => (
                    <tr key={b.id} className="border-b border-gray-50">
                      <td className="px-3 py-2 font-medium">{b.bill_number ?? b.id.slice(0, 8)}</td>
                      <td className="px-3 py-2">{b.bill_date}</td>
                      <td className="px-3 py-2">{b.due_date ?? "—"}</td>
                      <td className="px-3 py-2 text-right">{money.format(b.amount_cents / 100)}</td>
                      <td className="px-3 py-2 text-right">{money.format((b.balance_cents ?? b.amount_cents - b.paid_cents) / 100)}</td>
                      <td className="px-3 py-2">{b.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "Documents" && canViewDocuments ? (
        <DocumentsTab entityType="vendor" entityId={vendor.id} entityName={vendor.name} />
      ) : null}

      {activeTab === "Audit History" ? (
        <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
          Audit history viewer placeholder. Full drill-down ships in a later phase.
        </div>
      ) : null}
    </div>
  );
}

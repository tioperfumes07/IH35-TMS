import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { listVendors } from "../api/mdata";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/layout/PageHeader";
import { ListErrorBanner } from "../components/shared/ListErrorBanner";

export function VendorsPage() {
  const navigate = useNavigate();
  const vendorsQuery = useQuery({
    queryKey: ["vendors", "list-page"],
    queryFn: () => listVendors({}).then((result) => result.vendors),
  });

  return (
    <div className="space-y-3">
      <PageHeader title="Vendors" subtitle="Fuel, repair, tires, tolls, and more" />
      {vendorsQuery.isError ? <ListErrorBanner onRetry={() => void vendorsQuery.refetch()} /> : null}
      <DataTable
        rows={vendorsQuery.data ?? []}
        rowKey={(row) => row.id}
        loading={vendorsQuery.isLoading}
        onRowClick={(row) => navigate(`/vendors/${row.id}`)}
        columns={[
          {
            key: "name",
            label: "Name",
            className: "max-w-[240px] whitespace-nowrap",
            render: (row) => <span className="block truncate">{row.name}</span>,
          },
          { key: "vendor_type", label: "Type" },
          {
            key: "status",
            label: "Status",
            render: (row) => (row.deactivated_at ? "Inactive" : "Active"),
          },
        ]}
      />
    </div>
  );
}

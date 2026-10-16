import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { listDriverQboMappingStatus, listUnits, type DriverQboMappingStatus } from "../../api/mdata";
import { listClassesForJe } from "../../api/accounting";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { SelectCombobox } from "../../components/Combobox";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../../components/shared/EntityLink";

type TabKey = "drivers" | "assets";

type UnitLinkageRow = {
  id: string;
  unit_number: string;
  qbo_class_id: string | null;
};

const QBO_VENDOR_LINKAGE_TAB_IDS = new Set<string>(["drivers", "assets"]);

export function parseQboVendorLinkageTab(raw: string | null): TabKey {
  if (raw && QBO_VENDOR_LINKAGE_TAB_IDS.has(raw)) return raw as TabKey;
  return "drivers";
}

function driverDisplayName(row: DriverQboMappingStatus): string {
  return `${row.last_name}, ${row.first_name}`;
}

/*
 * 443.137 9e (part 2, #26732 ACCT-F4431380): QuickBooks is a read-only archive. The seven QBO
 * vendor-linkage write routes (vendor-link POST/DELETE, drivers/:id/link-qbo-vendor,
 * units|trailers/:id/link-qbo-class, units|trailers/:id/unlink-qbo-class) now always answer 409
 * QBO_NATIVE_WRITE_REFUSED. This page therefore shows the archive linkage READ-ONLY: the
 * "Link to Existing" / "Edit Linkage" actions, the class picker + link button, the
 * "Auto-Link High Confidence" button and the VendorLinkageModal are removed — never a broken button.
 * A driver's payee is the native A/P vendor on the driver profile (mdata.vendors.driver_id); a unit's
 * class is the TMS class on the unit profile.
 */
export function QboVendorLinkagePage() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const companyId = selectedCompanyId ?? "";
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = parseQboVendorLinkageTab(searchParams.get("tab"));
  const setActiveTab = (next: TabKey) => {
    const params = new URLSearchParams(searchParams);
    if (next === "drivers") params.delete("tab");
    else params.set("tab", next);
    setSearchParams(params, { replace: true });
  };
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");

  const driversQuery = useQuery({
    queryKey: ["qbo-vendor-linkage", "drivers", companyId],
    queryFn: () => listDriverQboMappingStatus(companyId),
    enabled: Boolean(companyId),
  });

  const unitsQuery = useQuery({
    queryKey: ["qbo-vendor-linkage", "units", companyId],
    queryFn: () => listUnits({ operating_company_id: companyId }),
    enabled: Boolean(companyId),
  });

  const classesQuery = useQuery({
    queryKey: ["qbo-vendor-linkage", "classes", companyId],
    queryFn: () => listClassesForJe(companyId),
    enabled: Boolean(companyId),
  });

  const classNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of classesQuery.data?.classes ?? []) {
      const label = c.class_code ? `${c.class_code} — ${c.class_name}` : c.class_name;
      map.set(c.id, label);
    }
    return map;
  }, [classesQuery.data?.classes]);

  const rows = useMemo(() => {
    const source = driversQuery.data?.rows ?? [];
    if (filter === "linked") return source.filter((row) => row.linked);
    if (filter === "unlinked") return source.filter((row) => !row.linked);
    return source;
  }, [driversQuery.data?.rows, filter]);

  const unitRows = useMemo((): UnitLinkageRow[] => {
    return (unitsQuery.data?.units ?? [])
      .map((unitRaw) => {
        const unit = unitRaw as { id?: string; unit_number?: string; qbo_class_id?: string | null };
        if (!unit.id) return null;
        return {
          id: unit.id,
          unit_number: unit.unit_number ?? unit.id,
          qbo_class_id: unit.qbo_class_id ?? null,
        };
      })
      .filter((row): row is UnitLinkageRow => row !== null);
  }, [unitsQuery.data?.units]);

  const driverColumns = useMemo((): Array<ParityColumn<DriverQboMappingStatus>> => {
    return [
      {
        key: "driver",
        label: "Driver",
        sortable: true,
        sortValue: (row) => driverDisplayName(row),
        render: (row) => (
          <EntityLink
            kind="driver"
            id={row.id}
            label={entityLabel(driverDisplayName(row), row.id, "Driver")}
            className="font-medium text-[#1F2A44] underline"
          />
        ),
      },
      {
        key: "qbo_vendor_id",
        label: "Current Vendor",
        sortable: true,
        sortValue: (row) => row.qbo_vendor_id ?? "",
        render: (row) => row.qbo_vendor_id ?? "-",
      },
      {
        key: "linked",
        label: "Status",
        sortable: true,
        sortValue: (row) => (row.linked ? "Linked" : "Unlinked"),
        render: (row) => (row.linked ? "Linked" : "Unlinked"),
      },
    ];
  }, []);

  const unitColumns = useMemo((): Array<ParityColumn<UnitLinkageRow>> => {
    return [
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="unit"
            id={row.id}
            label={entityLabel(row.unit_number, row.id, "Unit")}
            className="font-medium text-[#1F2A44] underline"
          />
        ),
      },
      {
        key: "qbo_class_id",
        label: "QBO Class",
        sortable: true,
        sortValue: (row) => row.qbo_class_id ?? "",
        render: (row) =>
          row.qbo_class_id ? entityLabel(classNameById.get(row.qbo_class_id), row.qbo_class_id, "Class") : "—",
      },
    ];
  }, [classNameById]);

  if (auth.user?.role !== "Owner" && auth.user?.role !== "Administrator") {
    return <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-gray-600">Owner/Admin only.</div>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="QBO Vendor Linkage"
        subtitle="Read-only view of the QuickBooks vendor / class linkage archive"
        actions={
          <div className="flex items-center gap-2">
            <Button variant={activeTab === "drivers" ? "primary" : "secondary"} onClick={() => setActiveTab("drivers")}>
              Drivers
            </Button>
            <Button variant={activeTab === "assets" ? "primary" : "secondary"} onClick={() => setActiveTab("assets")}>
              Assets
            </Button>
          </div>
        }
      />

      {activeTab === "drivers" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-sm border border-gray-200 bg-white p-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">Filter:</label>
              <SelectCombobox
                value={filter}
                onChange={(event) => setFilter(event.target.value as "all" | "linked" | "unlinked")}
                className="h-8 rounded-sm border border-gray-300 px-2 text-xs"
              >
                <option value="all">All</option>
                <option value="linked">Linked</option>
                <option value="unlinked">Unlinked</option>
              </SelectCombobox>
            </div>
            <span className="text-xs text-gray-600" data-testid="qbo-vendor-linkage-read-only">
              QuickBooks is a read-only archive — linkage is shown, never written.
            </span>
          </div>
          {driversQuery.isError ? (
            <ListErrorState
              title="Couldn't load driver vendor linkage"
              status={0}
              message={(driversQuery.error as Error)?.message}
              onRetry={() => void driversQuery.refetch()}
            />
          ) : (
            <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white p-2">
              <ParityTable
                rows={rows}
                columns={driverColumns}
                rowKey={(row) => row.id}
                loading={driversQuery.isLoading}
                storageKey="qbo-vendor-linkage-drivers"
                emptyText="No drivers match this filter."
                tableTestId="qbo-vendor-linkage-drivers-table"
                rowTestId={(row) => `qbo-vendor-linkage-driver-row-${row.id}`}
              />
            </div>
          )}
        </div>
      ) : unitsQuery.isError ? (
        <ListErrorState
          title="Couldn't load unit class linkage"
          status={0}
          message={(unitsQuery.error as Error)?.message}
          onRetry={() => void unitsQuery.refetch()}
        />
      ) : (
        <div className="overflow-x-auto rounded-sm border border-gray-200 bg-white p-2">
          <ParityTable
            rows={unitRows}
            columns={unitColumns}
            rowKey={(row) => row.id}
            loading={unitsQuery.isLoading}
            storageKey="qbo-vendor-linkage-assets"
            emptyText="No units found."
            tableTestId="qbo-vendor-linkage-assets-table"
            rowTestId={(row) => `qbo-vendor-linkage-unit-row-${row.id}`}
          />
        </div>
      )}

    </div>
  );
}

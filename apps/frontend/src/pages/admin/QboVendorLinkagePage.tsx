import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  linkDriverQboVendor,
  linkUnitQboClass,
  listDriverQboMappingStatus,
  listQboVendorSuggestions,
  listUnits,
  type DriverQboMappingStatus,
} from "../../api/mdata";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { VendorLinkageModal } from "../../components/qbo/VendorLinkageModal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

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

export function QboVendorLinkagePage() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
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
  const [linkageTarget, setLinkageTarget] = useState<{
    entityType: "driver" | "asset";
    entityId: string;
    name: string;
    currentQboVendorId?: string | null;
  } | null>(null);
  const [classByUnit, setClassByUnit] = useState<Record<string, string>>({});

  const canManage = auth.user?.role === "Owner" || auth.user?.role === "Administrator";

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
        render: (row) => driverDisplayName(row),
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
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setLinkageTarget({
                entityType: "driver",
                entityId: row.id,
                name: `${row.first_name} ${row.last_name}`,
                currentQboVendorId: row.qbo_vendor_id,
              })
            }
          >
            {row.qbo_vendor_id ? "Edit Linkage" : "Link to Existing"}
          </Button>
        ),
      },
    ];
  }, []);

  const unitColumns = useMemo((): Array<ParityColumn<UnitLinkageRow>> => {
    return [
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
      },
      {
        key: "qbo_class_id",
        label: "QBO Class",
        sortable: true,
        sortValue: (row) => row.qbo_class_id ?? "",
        render: (row) => row.qbo_class_id ?? "-",
      },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="flex items-center gap-2">
            <input
              value={classByUnit[row.id] ?? row.qbo_class_id ?? ""}
              onChange={(event) => setClassByUnit((current) => ({ ...current, [row.id]: event.target.value }))}
              className="h-7 rounded-sm border border-gray-300 px-2 text-xs"
              placeholder="QBO class id"
            />
            <Button
              size="sm"
              onClick={() => {
                const qboClassId = (classByUnit[row.id] ?? row.qbo_class_id ?? "").trim();
                if (!qboClassId) {
                  pushToast("Enter QBO class id", "error");
                  return;
                }
                void linkUnitQboClass(row.id, {
                  operating_company_id: companyId,
                  qbo_class_id: qboClassId,
                  reason: "manual_asset_link",
                  force: true,
                })
                  .then(() => {
                    pushToast("Unit linked", "success");
                    void queryClient.invalidateQueries({ queryKey: ["qbo-vendor-linkage", "units", companyId] });
                  })
                  .catch((e) => pushToast(String((e as Error)?.message ?? "Link failed"), "error"));
              }}
            >
              Link to Existing
            </Button>
          </div>
        ),
      },
    ];
  }, [classByUnit, companyId, pushToast, queryClient]);

  async function autoLinkHighConfidence() {
    const candidates = (driversQuery.data?.rows ?? []).filter((row) => !row.qbo_vendor_id);
    let linkedCount = 0;
    for (const candidate of candidates) {
      const suggestions = await listQboVendorSuggestions(companyId, "driver", candidate.id);
      const top = suggestions.rows[0];
      if (!top || Number(top.score ?? 0) < 0.9) continue;
      await linkDriverQboVendor(candidate.id, {
        operating_company_id: companyId,
        qbo_vendor_id: top.qbo_vendor_id,
        reason: "bulk_auto_link_high_confidence",
        force: false,
      }).catch(() => undefined);
      linkedCount += 1;
    }
    pushToast(`Auto-link complete: ${linkedCount} drivers linked`, "success");
    void queryClient.invalidateQueries({ queryKey: ["qbo-vendor-linkage", "drivers", companyId] });
  }

  if (auth.user?.role !== "Owner" && auth.user?.role !== "Administrator") {
    return <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm text-gray-600">Owner/Admin only.</div>;
  }

  return (
    <div className="space-y-3">
      <PageHeader
        title="QBO Vendor Linkage"
        subtitle="Link drivers/assets to QBO Vendor/Class records"
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
            <Button onClick={() => void autoLinkHighConfidence()} disabled={!canManage}>
              Auto-Link High Confidence (&gt; 0.9)
            </Button>
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

      {linkageTarget ? (
        <VendorLinkageModal
          open={Boolean(linkageTarget)}
          operatingCompanyId={companyId}
          entityType={linkageTarget.entityType}
          entityId={linkageTarget.entityId}
          entityName={linkageTarget.name}
          currentQboVendorId={linkageTarget.currentQboVendorId}
          canManage={canManage}
          onClose={() => setLinkageTarget(null)}
          onSaved={() => {
            setLinkageTarget(null);
            pushToast("Vendor linkage saved", "success");
            void queryClient.invalidateQueries({ queryKey: ["qbo-vendor-linkage", "drivers", companyId] });
          }}
        />
      ) : null}
    </div>
  );
}

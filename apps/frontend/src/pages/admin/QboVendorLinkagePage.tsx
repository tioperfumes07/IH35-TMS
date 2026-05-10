import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  linkDriverQboVendor,
  linkUnitQboClass,
  listDriverQboMappingStatus,
  listQboVendorSuggestions,
  listUnits,
} from "../../api/mdata";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useAuth } from "../../auth/useAuth";
import { PageHeader } from "../../components/layout/PageHeader";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { VendorLinkageModal } from "../../components/qbo/VendorLinkageModal";

type TabKey = "drivers" | "assets";

export function QboVendorLinkagePage() {
  const { selectedCompanyId } = useCompanyContext();
  const auth = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const companyId = selectedCompanyId ?? "";
  const [activeTab, setActiveTab] = useState<TabKey>("drivers");
  const [filter, setFilter] = useState<"all" | "linked" | "unlinked">("all");
  const [linkageTarget, setLinkageTarget] = useState<{ entityType: "driver" | "asset"; entityId: string; name: string; currentQboVendorId?: string | null } | null>(null);
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
    return <div className="rounded border border-gray-200 bg-white p-3 text-sm text-gray-600">Owner/Admin only.</div>;
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
          <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-200 bg-white p-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-gray-600">Filter:</label>
              <select
                value={filter}
                onChange={(event) => setFilter(event.target.value as "all" | "linked" | "unlinked")}
                className="h-8 rounded border border-gray-300 px-2 text-xs"
              >
                <option value="all">All</option>
                <option value="linked">Linked</option>
                <option value="unlinked">Unlinked</option>
              </select>
            </div>
            <Button onClick={() => void autoLinkHighConfidence()} disabled={!canManage}>
              Auto-Link High Confidence (&gt; 0.9)
            </Button>
          </div>
          <div className="overflow-x-auto rounded border border-gray-200 bg-white">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50">
                <tr className="text-gray-600">
                  <th className="px-3 py-2 font-semibold">Driver</th>
                  <th className="px-3 py-2 font-semibold">Current Vendor</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{row.last_name}, {row.first_name}</td>
                    <td className="px-3 py-2">{row.qbo_vendor_id ?? "-"}</td>
                    <td className="px-3 py-2">{row.linked ? "Linked" : "Unlinked"}</td>
                    <td className="px-3 py-2">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-gray-50">
              <tr className="text-gray-600">
                <th className="px-3 py-2 font-semibold">Unit</th>
                <th className="px-3 py-2 font-semibold">QBO Class</th>
                <th className="px-3 py-2 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {(unitsQuery.data?.units ?? []).map((unitRaw) => {
                const unit = unitRaw as { id?: string; unit_number?: string; qbo_class_id?: string | null };
                if (!unit.id) return null;
                return (
                  <tr key={unit.id} className="border-t border-gray-100">
                    <td className="px-3 py-2">{unit.unit_number ?? unit.id}</td>
                    <td className="px-3 py-2">{unit.qbo_class_id ?? "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <input
                          value={classByUnit[unit.id] ?? unit.qbo_class_id ?? ""}
                          onChange={(event) => setClassByUnit((current) => ({ ...current, [unit.id!]: event.target.value }))}
                          className="h-7 rounded border border-gray-300 px-2 text-xs"
                          placeholder="QBO class id"
                        />
                        <Button
                          size="sm"
                          onClick={() => {
                            const qboClassId = (classByUnit[unit.id!] ?? unit.qbo_class_id ?? "").trim();
                            if (!qboClassId) {
                              pushToast("Enter QBO class id", "error");
                              return;
                            }
                            void linkUnitQboClass(unit.id!, {
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
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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

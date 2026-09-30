import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listDrivers } from "../../api/mdata";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { MASTER_DETAIL } from "../../design/master-detail";
import { driverDisplayName } from "../../lib/driverDqf";
import { SidebarPagination } from "../../components/shared/SidebarPagination";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { useListState } from "../../components/list-state";

type Props = {
  selectedDriverId: string;
  onSelectDriver: (driverId: string) => void;
};

/**
 * C-17 / C-34 — Drivers Profiles master pane. Same MASTER_DETAIL width/surface tokens as
 * Customers / Vendors. Auto-selects the first Active driver so the detail pane is never empty
 * after load when rows exist.
 */
export function DriverListSidebar({ selectedDriverId, onSelectDriver }: Props) {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const pageSize = 50;

  const driversQ = useQuery({
    queryKey: ["drivers", "master-sidebar", companyId, search, page],
    enabled: Boolean(companyId),
    queryFn: () =>
      listDrivers({
        operating_company_id: companyId,
        status: "Active",
        search,
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
  });

  const rows = useMemo(() => driversQ.data?.drivers ?? [], [driversQ.data?.drivers]);
  const totalCount = driversQ.data?.total ?? 0;
  const listState = useListState(driversQ, rows.length === 0);

  // C-34 — never strand the detail pane on "Select a driver" when the master list has rows.
  useEffect(() => {
    if (selectedDriverId) return;
    const first = rows[0];
    if (first?.id) onSelectDriver(first.id);
  }, [selectedDriverId, rows, onSelectDriver]);

  return (
    <aside className={`${MASTER_DETAIL.masterPaneClass} ${MASTER_DETAIL.surfaceClass} p-2`} data-driver-list-sidebar="true" data-master-detail-master="true" data-c34-profiles-master="true">
      <SidebarPagination
        page={page}
        pageSize={pageSize}
        totalCount={totalCount}
        onPageChange={setPage}
        onPageSizeChange={() => undefined}
        loading={listState.isLoading}
      />
      <input
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(1);
        }}
        placeholder="Search drivers"
        aria-label="Search drivers"
        className="mb-2 mt-2 w-full rounded-sm border border-gray-300 px-2 py-1 text-xs"
      />
      <div className={MASTER_DETAIL.listScrollClass} data-c05-list-scroll="true">
        {listState.isLoading ? (
          <p className="px-2 py-3 text-xs text-gray-500">Loading…</p>
        ) : listState.isEmpty ? (
          <p className="px-2 py-3 text-xs text-gray-500">No drivers.</p>
        ) : (
          <table className="w-full border-collapse text-xs" data-testid="drivers-profiles-master-table">
            <tbody>
              {rows.map((driver) => {
                const selected = selectedDriverId === driver.id;
                const name = driverDisplayName(driver.first_name, driver.last_name, driver.id);
                return (
                  <tr key={driver.id} className={MASTER_DETAIL.rowStripeClass} data-c04-row="true">
                    <td className="p-0">
                      <button
                        type="button"
                        className={`block w-full truncate px-2 py-1.5 text-left text-xs font-medium ${MASTER_DETAIL.rowBorderClass} ${
                          selected ? MASTER_DETAIL.rowSelectedClass : MASTER_DETAIL.rowHoverClass
                        }`}
                        data-testid={`driver-master-row-${driver.id}`}
                        onClick={() => onSelectDriver(driver.id)}
                      >
                        <EntityLinkOrTombstone kind="driver" id={driver.id} name={name} noun="Driver" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </aside>
  );
}

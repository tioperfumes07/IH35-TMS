import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { V3 } from "../../../design/v3-tokens";
import { V3Panel } from "../../../components/v3/V3Panel";
import { V3Segmented } from "../../../components/v3/V3Segmented";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";
import { EntityLink } from "../../../components/shared/EntityLink";
import { formatMoneyCents } from "../../../lib/formatMoney";
import { fetchDieselByTruckAggregate } from "../fuelDieselByTruck";
import { FUEL_BOARD_PERIOD_OPTIONS, fuelBoardPeriodRange, type FuelBoardPeriodId } from "../fuelBoardPeriod";

type Props = {
  companyId: string;
  maxRows?: number;
  viewAllHref?: string;
};

export function FuelDieselByTruckPanel({ companyId, maxRows, viewAllHref }: Props) {
  const [period, setPeriod] = useState<FuelBoardPeriodId>("oct");
  const range = fuelBoardPeriodRange(period);

  const aggQuery = useQuery({
    queryKey: ["fuel", "board", "diesel-by-truck", companyId, range.from, range.to],
    queryFn: () => fetchDieselByTruckAggregate(companyId, range.from, range.to),
    enabled: Boolean(companyId),
  });

  const rows = aggQuery.data?.rows ?? [];
  const maxSpend = rows.reduce((m, r) => Math.max(m, r.spend_cents), 0);
  const visible = maxRows != null ? rows.slice(0, maxRows) : rows;

  const headerRight = (
    <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <V3Segmented
        value={period}
        options={FUEL_BOARD_PERIOD_OPTIONS}
        onChange={setPeriod}
        testId="fuel-diesel-by-truck-period"
      />
      {viewAllHref ? (
        <Link
          to={viewAllHref}
          style={{ font: `600 11px ${V3.font}`, color: "#1D4ED8", textDecoration: "none" }}
          data-testid="fuel-diesel-by-truck-view-all"
        >
          View all →
        </Link>
      ) : null}
    </span>
  );

  return (
    <V3Panel
      title="Diesel by truck"
      subtitle=""
      testId="fuel-diesel-by-truck-panel"
      headerRight={headerRight}
    >
      {aggQuery.isError ? (
        <div style={{ padding: "10px 12px" }}>
          <ListErrorBanner onRetry={() => void aggQuery.refetch()} />
        </div>
      ) : aggQuery.isLoading ? (
        <div style={{ padding: "10px 12px", fontSize: 12, color: V3.muted }} data-testid="fuel-diesel-by-truck-loading">
          Loading diesel by truck…
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", fontFamily: V3.font, fontSize: 12 }}
            data-testid="fuel-diesel-by-truck-table"
          >
            <thead>
              <tr>
                {["", "Unit", "Spend", "$", "Gallons", "$/gal", "Fills", "Loads"].map((label, i) => (
                  <th
                    key={label || "bar"}
                    style={{
                      textAlign: i >= 3 ? "center" : "left",
                      font: `700 11px ${V3.font}`,
                      color: "#4B5563",
                      textTransform: "uppercase",
                      padding: "7px 12px",
                      borderBottom: `1px solid ${V3.border}`,
                      background: "#F7F8FA",
                    }}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: "12px", textAlign: "center", color: V3.muted }}>
                    No fills in this period.
                  </td>
                </tr>
              ) : (
                visible.map((row) => {
                  const pct = maxSpend > 0 ? (row.spend_cents / maxSpend) * 100 : 0;
                  const perGal = row.gallons > 0 ? row.spend_cents / 100 / row.gallons : null;
                  return (
                    <tr key={row.unit_id ?? row.unit_number}>
                      <td style={{ padding: "5px 12px", borderBottom: `1px solid #ECEEF2`, width: 100 }} />
                      <td style={{ padding: "5px 12px", borderBottom: `1px solid #ECEEF2` }}>
                        {row.unit_id ? (
                          <EntityLink kind="unit" id={row.unit_id} label={row.unit_number} className="font-semibold text-[#1F2A44]" />
                        ) : (
                          <span style={{ fontWeight: 600 }}>{row.unit_number}</span>
                        )}
                      </td>
                      <td style={{ padding: "5px 12px", borderBottom: `1px solid #ECEEF2`, minWidth: 120 }}>
                        <div
                          style={{
                            width: 160,
                            maxWidth: "100%",
                            height: 6,
                            background: "#EEF0F3",
                            borderRadius: 3,
                          }}
                        >
                          <div
                            style={{
                              width: `${pct.toFixed(1)}%`,
                              height: 6,
                              background: "#1E3A5F",
                              borderRadius: 3,
                            }}
                          />
                        </div>
                      </td>
                      <td
                        style={{
                          padding: "5px 12px",
                          borderBottom: `1px solid #ECEEF2`,
                          textAlign: "center",
                          fontWeight: 600,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {formatMoneyCents(row.spend_cents).replace("$", "")}
                      </td>
                      <td
                        style={{
                          padding: "5px 12px",
                          borderBottom: `1px solid #ECEEF2`,
                          textAlign: "center",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {row.gallons.toFixed(1)}
                      </td>
                      <td
                        style={{
                          padding: "5px 12px",
                          borderBottom: `1px solid #ECEEF2`,
                          textAlign: "center",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {perGal != null ? perGal.toFixed(3) : "—"}
                      </td>
                      <td
                        style={{
                          padding: "5px 12px",
                          borderBottom: `1px solid #ECEEF2`,
                          textAlign: "center",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {row.fill_count}
                      </td>
                      <td
                        style={{
                          padding: "5px 12px",
                          borderBottom: `1px solid #ECEEF2`,
                          textAlign: "center",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {row.load_count}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </V3Panel>
  );
}

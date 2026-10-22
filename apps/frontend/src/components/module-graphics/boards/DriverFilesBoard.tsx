import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getActiveDriverSet } from "../../../api/safety";
import { listDrivers } from "../../../api/catalog-drivers";
import type { Driver } from "../../../types/api";
import { ClickableStat } from "../ClickableStat";
import { ModBoardShell, ModSectionHead } from "../ModBoardShell";

type Props = { companyId: string };

type FileCell = { state: "on_file" | "to_add" | "check"; label: string };

function cell(onFile: boolean, labelOn: string, labelOff = "add"): FileCell {
  return onFile
    ? { state: "on_file", label: labelOn }
    : { state: "to_add", label: labelOff };
}

function driverCells(d: Driver): {
  cdl: FileCell;
  medical: FileCell;
  visa: FileCell;
  samsara: FileCell;
  dq: FileCell;
  emergency: FileCell;
  onFileCount: number;
} {
  const cdl = cell(Boolean(d.cdl_expires_at), d.cdl_expires_at ? d.cdl_expires_at.slice(0, 7).replace("-", "/") : "on file", "add date");
  const medical = cell(Boolean(d.dot_medical_expires_at), d.dot_medical_expires_at ? d.dot_medical_expires_at.slice(0, 7).replace("-", "/") : "on file", "add");
  const visaRaw = (d as { b1_visa_expires_at?: string | null }).b1_visa_expires_at;
  const visa = cell(Boolean(visaRaw), visaRaw ? String(visaRaw).slice(0, 7).replace("-", "/") : "on file", "add");
  const samsara = cell(Boolean((d as { samsara_driver_id?: string | null }).samsara_driver_id), "linked", "link");
  const dq = cell(
    Boolean((d as { dq_file_on_paper?: boolean | null }).dq_file_on_paper) ||
      Boolean((d as { dq_file_complete?: boolean | null }).dq_file_complete),
    "paper",
    "paper"
  );
  const emergency = cell(Boolean(d.emergency_contact_name || d.emergency_contact_phone_primary), "on file", "add");
  const cells = [cdl, medical, visa, samsara, dq, emergency];
  return {
    cdl,
    medical,
    visa,
    samsara,
    dq,
    emergency,
    onFileCount: cells.filter((c) => c.state === "on_file").length,
  };
}

function CellChip({ cell: c }: { cell: FileCell }) {
  const color =
    c.state === "on_file" ? "#1F8A4C" : c.state === "check" ? "#C76A0A" : "#6B7280";
  return (
    <span className="text-section-header font-semibold uppercase" style={{ color }}>
      {c.state === "to_add" ? c.label : c.label}
    </span>
  );
}

/**
 * ROUND 443.248 — Driver files matrix (LEAD-MOD-DESIGN-Safety).
 * Active drivers from Samsara movement set; NULL fields = "to add", never blocking.
 */
export function DriverFilesBoard({ companyId }: Props) {
  const activeQ = useQuery({
    queryKey: ["mod-graphics", "active-drivers", companyId],
    queryFn: () => getActiveDriverSet(companyId, 14),
    enabled: Boolean(companyId),
    retry: false,
  });
  const driversQ = useQuery({
    queryKey: ["mod-graphics", "drivers-roster", companyId],
    queryFn: () => listDrivers({ operating_company_id: companyId, status: "Active", limit: 500 }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const activeIds = useMemo(
    () => new Set(activeQ.data?.active_driver_uuids ?? []),
    [activeQ.data]
  );

  const rows = useMemo(() => {
    const all = driversQ.data?.drivers ?? [];
    const filtered = activeIds.size
      ? all.filter((d) => activeIds.has(d.id))
      : all.slice(0, 20);
    return filtered
      .map((d) => ({ driver: d, files: driverCells(d) }))
      .sort((a, b) =>
        `${a.driver.first_name} ${a.driver.last_name}`.localeCompare(
          `${b.driver.first_name} ${b.driver.last_name}`
        )
      );
  }, [driversQ.data, activeIds]);

  const n = rows.length;
  const medicalOn = rows.filter((r) => r.files.medical.state === "on_file").length;
  const emergencyOn = rows.filter((r) => r.files.emergency.state === "on_file").length;
  const cdlOn = rows.filter((r) => r.files.cdl.state === "on_file").length;
  const cdlToAdd = n - cdlOn;

  const listBase = "/drivers?status=active";

  return (
    <ModBoardShell
      eyebrow="Safety & compliance · USMCA · live"
      title="Driver files"
      subtitle="Driver files — what is on file, what to add"
      testId="driver-files-board"
    >
      <div className="mod-board__kpi-grid">
        <ClickableStat
          label="DOT medical on file"
          value={driversQ.isError ? "—" : `${medicalOn} of ${n || "—"}`}
          hint="add when you update files"
          to={listBase}
          testId="safety-board-medical"
        />
        <ClickableStat
          label="Emergency contact"
          value={driversQ.isError ? "—" : `${emergencyOn} of ${n || "—"}`}
          hint="to add — not blocking"
          to={listBase}
          testId="safety-board-emergency"
        />
        <ClickableStat
          label="CDL date on file"
          value={driversQ.isError ? "—" : `${cdlOn} of ${n || "—"}`}
          hint={cdlToAdd > 0 ? `${cdlToAdd} to add` : "all on file"}
          to={listBase}
          testId="safety-board-cdl"
        />
        <ClickableStat
          label="Active drivers"
          value={activeQ.isError ? "—" : String(activeIds.size || n)}
          hint="Samsara movement · 15 days"
          to="/safety?tab=home"
          testId="safety-board-active"
        />
      </div>

      <ModSectionHead title={`Driver files — ${n} active drivers`} viewAllTo={listBase} />
      {driversQ.isError || activeQ.isError ? (
        <div className="mod-empty">Driver files could not be loaded.</div>
      ) : n === 0 ? (
        <div className="mod-empty">No active drivers in the movement window yet.</div>
      ) : (
        <div className="overflow-x-auto" data-testid="driver-files-matrix">
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="text-section-header font-bold uppercase text-[#4B5563]">
                <th className="border-b border-[#E5E7EB] px-2 py-1 text-left">Driver</th>
                <th className="border-b border-[#E5E7EB] px-2 py-1 text-center">CDL</th>
                <th className="border-b border-[#E5E7EB] px-2 py-1 text-center">DOT medical</th>
                <th className="border-b border-[#E5E7EB] px-2 py-1 text-center">B-1 visa</th>
                <th className="border-b border-[#E5E7EB] px-2 py-1 text-center">Samsara</th>
                <th className="border-b border-[#E5E7EB] px-2 py-1 text-center">DQ file</th>
                <th className="border-b border-[#E5E7EB] px-2 py-1 text-center">On file</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ driver: d, files }) => {
                const to = `/drivers/${d.id}?tab=Overview`;
                const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || "Driver";
                return (
                  <tr key={d.id} className="border-b border-[#E5E7EB]">
                    <td className="px-2 py-1.5">
                      <Link
                        to={to}
                        className="font-semibold text-[#14213D] no-underline hover:underline"
                        data-mod-click-through="1"
                        data-mod-click-to={to}
                      >
                        {name}
                      </Link>
                      <div className="text-section-header text-[#6B7280]">{files.onFileCount} of 6 on file</div>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Link to={to} className="no-underline" data-mod-click-through="1" data-mod-click-to={to}>
                        <CellChip cell={files.cdl} />
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Link to={to} className="no-underline" data-mod-click-through="1" data-mod-click-to={to}>
                        <CellChip cell={files.medical} />
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Link to={to} className="no-underline" data-mod-click-through="1" data-mod-click-to={to}>
                        <CellChip cell={files.visa} />
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Link to={to} className="no-underline" data-mod-click-through="1" data-mod-click-to={to}>
                        <CellChip cell={files.samsara} />
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <Link to={to} className="no-underline" data-mod-click-through="1" data-mod-click-to={to}>
                        <CellChip cell={files.dq} />
                      </Link>
                    </td>
                    <td className="px-2 py-1.5 text-center font-mono text-xs text-[#14213D]">
                      {files.onFileCount}/6
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="mt-2 flex flex-wrap gap-3 text-section-header text-[#6B7280]">
            <span style={{ color: "#1F8A4C" }}>on file</span>
            <span>to add — not blocking</span>
            <span style={{ color: "#C76A0A" }}>double-check</span>
            <span>on paper</span>
          </div>
        </div>
      )}
    </ModBoardShell>
  );
}

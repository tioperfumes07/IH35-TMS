import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";
import { renderMaintenanceReportXlsx } from "../../maintenance/reports.routes.js";
import { renderSafetyReportXlsx } from "../../safety/reports/safety-reports.routes.js";
import { renderFleetLocationHosXlsx } from "../../telematics/fleet-location-hos.routes.js";

vi.mock("../../reports/scheduled-report-runner.js", () => ({
  renderLegacyScheduledReportForDelivery: vi.fn(async () => ({
    html: "<p>report</p>",
    subject: "Scheduled Report",
    envelope: {
      generatedAt: "2026-07-17T00:00:00.000Z",
      rowCount: 1,
      summary: "ready",
      data: { total: 1 },
    },
  })),
}));

async function open(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  return workbook;
}

describe("XLSX exporter openability", () => {
  it("opens maintenance report workbooks with preserved headers and values", async () => {
    const workbook = await open(await renderMaintenanceReportXlsx([{ unit_id: "T169", total_cost: 125.5 }]));
    expect(workbook.getWorksheet("report")?.getRow(1).values).toEqual([, "unit_id", "total_cost"]);
    expect(workbook.getWorksheet("report")?.getCell("B2").value).toBe(125.5);
  });

  it("opens safety report workbooks as genuine XLSX", async () => {
    const workbook = await open(
      await renderSafetyReportXlsx([{ event_class: "safety.dot_inspection", total: 3 }])
    );
    expect(workbook.getWorksheet("Safety Report")?.getCell("A1").value).toBe("event_class");
    expect(workbook.getWorksheet("Safety Report")?.getCell("A2").value).toBe("safety.dot_inspection");
    expect(workbook.getWorksheet("Safety Report")?.getCell("B2").value).toBe(3);
  });

  it("opens fleet HOS workbooks with the public sheet contract", async () => {
    const workbook = await open(await renderFleetLocationHosXlsx([]));
    expect(workbook.getWorksheet("Fleet Location HOS")?.getCell("A1").value).toBe("Unit");
    expect(workbook.getWorksheet("Fleet Location HOS")?.getCell("T1").value).toBe("Map");
  });

  it("opens scheduled report XLSX output", async () => {
    const { buildScheduledReportFile } = await import("../../scheduled-reports/report-file-builder.js");
    const result = await buildScheduledReportFile(
      "dispatch-board",
      "11111111-1111-4111-8111-111111111111",
      "xlsx"
    );
    const workbook = await open(result.buffer);
    expect(result.extension).toBe("xlsx");
    expect(result.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(result.summary).toBe("ready");
    const sheet = workbook.getWorksheet("Report")!;
    expect([1, 2, 3, 4].map((row) => sheet.getRow(row).values)).toEqual([
      [, "generatedAt", "2026-07-17T00:00:00.000Z"],
      [, "rowCount", "1"],
      [, "summary", "ready"],
      [, "data_json", '{"total":1}'],
    ]);
  });
});

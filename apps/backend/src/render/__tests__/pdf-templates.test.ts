import { describe, expect, it } from "vitest";
import { escapeHtml, wrapPdfDocument } from "../pdf-template.js";
import { renderDispatchSheetBody, type DispatchSheetModel } from "../dispatch-sheet.template.js";
import { renderInvoiceBody, type InvoiceHtmlModel } from "../invoice.template.js";
import { renderSettlementBody, type SettlementHtmlModel } from "../settlement.template.js";

describe("dispatch-sheet.template", () => {
  it("renders mock-contract headings, money, and escapes user content", () => {
    const malicious = `<script>alert(1)</script>`;
    const model: DispatchSheetModel = {
      brandName: "IH 35 Trucking LLC",
      brandSub: "DOT 4287135 · MC 1684226 · TRK",
      brandAddrHtml: "123 Industrial Way, Laredo, TX 78045<br/>(956) 555-0184 · dispatch@ih35trucking.com",
      docType: "Driver dispatch sheet",
      loadDocNum: "L-13518",
      issuedLines: ["Issued Wed, May 13, 2026 · 8:51 AM CT", "by dispatcher Jorge Munoz"],
      statusLine: "Assigned · awaiting driver confirm",
      driverName: "R. Smith",
      driverCdlLine: "CDL TX · exp 2027-08",
      hosDriveLine: "8h 12m drive",
      hosDutyLine: "12h 47m on-duty",
      truckUnit: "T120",
      truckSub: "2022 Volvo VNL · PM in 1,840 mi",
      trailerUnit: "RT-178",
      trailerSub: "Reefer · last DOT Apr 28",
      stopsSummaryRight: "2 stops · 1 pickup · 1 delivery · 238 mi practical",
      stops: [],
      commodityRight: "Customer WO# CHR-2026-77441",
      commodityDescription: malicious,
      commodityWeight: "42,800 lbs",
      commodityPieces: "24 pallets",
      equipmentPrimary: "Reefer van",
      equipmentSecondary: "Locking jacks + pulp probe",
      autoBillId: "B-13518",
      payRows: [
        { component: "Linehaul pay", basis: "221 short mi", rate: "$0.50 / mi", amountCents: 11050 },
        { component: "Fuel advance (already issued)", basis: "EFS / Comcheck", rate: "—", amountCents: 20000 },
        { component: "Cash advance", basis: "—", rate: "—", amountCents: 0 },
      ],
      grossFootnote: "Gross driver bill on completion · advances recovered at settlement",
      grossFootnoteCents: 11050,
      instructionsRight: "Visible to driver · mark read on receipt",
      instructionsFrom: "From dispatcher Jorge Munoz",
      instructionsBody:
        "Call dispatcher on arrival at both stops. Detention starts after 2 free hours — text dispatch with timestamp + photo of in-gate stamp.",
      sigDriverName: "R. Smith",
      dispatcherSigLine: "Jorge Munoz · IH 35 Trucking dispatch",
      dispatcherIssuedNote: "Issued Wed, May 13, 2026 · 8:51 AM CT",
      footerMobile: "Driver app shows this dispatch sheet automatically.",
      footerAfterHours: "After-hours line (956) 555-0188 · email dispatch@ih35trucking.com",
    };

    const html = renderDispatchSheetBody(model);
    expect(html).toContain("L-13518");
    expect(html).toContain("R. Smith");
    expect(html).toContain("$110.50");
    expect(html).toContain("Driver assignment");
    expect(html).toContain("Stops");
    expect(html).toContain("Commodity");
    expect(html).toContain("Driver pay summary");
    expect(html).toContain("Driver instructions");
    expect(html.includes("<script>")).toBe(false);
    expect(html).toContain(escapeHtml(malicious));
  });
});

describe("invoice.template", () => {
  it("renders invoice banner rows and tax line", () => {
    const model: InvoiceHtmlModel = {
      brandName: "IH 35 Trucking LLC",
      brandSub: "DOT 4287135 · MC 1684226 · EIN 87-4196522",
      brandAddrHtml: "123 Industrial Way, Laredo, TX 78045<br/>(956) 555-0184 · billing@ih35trucking.com",
      invoiceDocNum: "I-13518",
      issuedLines: ["Issued Wed, May 13, 2026", "Due Wed, Jun 12, 2026 · Net 30"],
      statusLine: "Unpaid · awaiting customer payment",
      billToSectionTitle: "Bill to · pay via factor",
      billToInnerHtml: `<div class="val">C.H. Robinson Worldwide Inc</div>`,
      remitLabel: "Remit to (factor — auto-routed)",
      remitInnerHtml: `<div class="val">Triumph Business Capital</div>`,
      loadDocNum: "L-13518",
      customerWo: "CHR-2026-77441",
      pickupRef: "PU-883920",
      podRef: "DEL-225601",
      pickupPrimary: "Pilgrim's Pride · San Antonio TX 78218",
      pickupSecondary: "Mon May 12 · 06:00 AM CT · appointment kept on time",
      deliveryPrimary: "Continental Forwarding · McAllen TX 78501",
      deliverySecondary: "Tue May 13 · 14:00 CT · POD signed by J. Garza",
      commodity: "Frozen poultry",
      weight: "42,800 lbs",
      pieces: "24 pallets",
      equipment: "Reefer −10°F continuous",
      lines: [
        { description: "Linehaul · TX-TX intrastate", basis: "238 practical mi", rate: "$9.45 / mi", amountCents: 225000 },
        { description: "Fuel surcharge · 8.4% of linehaul", basis: "—", rate: "8.4%", amountCents: 18900 },
        { description: "Lumper at pickup · broker-paid passthrough", basis: "Comcheck", rate: "—", amountCents: 0 },
        { description: "Detention · none triggered", basis: "0 hr", rate: "$65 / hr", amountCents: 0 },
        { description: "Subtotal", basis: "", rate: "", amountCents: 243900, isSubtotal: true },
      ],
      invoiceTotalCents: 243900,
      taxCents: 0,
      adjustmentsIntro: "Dispatcher flagged at booking · none materialized this trip.",
      adjustments: [
        { flag: "Anticipated chargeback", booking: "$0.00", actual: "$0.00", net: "$0.00" },
        { flag: "Detention (expected)", booking: "No", actual: "0 hr · no detention", net: "—" },
        { flag: "Late delivery risk", booking: "No", actual: "On time", net: "—" },
      ],
      totalDuePrimary: "Pay to Triumph Business Capital lockbox · Net 30 from Wed, May 13, 2026",
      totalDueSecondary: "",
      paymentInstructionsHtml: "<strong>Wire / ACH to Triumph Business Capital.</strong>",
      disputesFooter: "Email billing@ih35trucking.com within 15 days.",
      latePayFooter: "Late-pay terms apply.",
    };

    const html = renderInvoiceBody(model);
    expect(html).toContain("I-13518");
    expect(html).toContain("C.H. Robinson Worldwide Inc");
    expect(html).toContain("Triumph Business Capital");
    expect(html).toContain("$2,439.00");
    expect(html).toContain("Expected adjustments flagged at booking");
    expect(html).toContain("Tax · intrastate freight exempt");
    expect(html.includes("<script>")).toBe(false);
  });
});

describe("settlement.template", () => {
  it("renders settlement totals and signoff blocks", () => {
    const model: SettlementHtmlModel = {
      brandName: "IH 35 Trucking LLC",
      brandSub: "DOT 4287135 · MC 1684226 · TRK",
      brandAddrHtml: "123 Industrial Way, Laredo, TX 78045<br/>(956) 555-0184 · payroll@ih35trucking.com",
      settlementDocNum: "S-2026-W20-RSMITH",
      periodLines: ["Period Mon May 11 — Sun May 17, 2026", "Pay date Fri May 22, 2026 · ACH"],
      statusLine: "Due Fri May 22 · ACH to BBVA acct **6224",
      driverBlock: [{ label: "Driver", value: "R. Smith", sub: "DRV-0042 · 1099 contractor" }],
      loadsSummaryRight: "4 loads · 1,676 short mi · 1,891 practical mi",
      loadRows: [
        {
          loadNum: "L-13494",
          lane: "Laredo TX → Houston TX · Mon May 11",
          shortMi: "487",
          ratePerMi: "$0.50",
          linehaulCents: 24350,
          bonusesDisplay: "$40.00 detention",
          lineTotalCents: 28350,
        },
        {
          loadNum: "L-13501",
          lane: "San Antonio TX → OK City OK · Tue May 12",
          shortMi: "612",
          ratePerMi: "$0.50",
          linehaulCents: 30600,
          bonusesDisplay: "$50.00 tarp pay",
          lineTotalCents: 35600,
        },
        {
          loadNum: "L-13518",
          lane: "San Antonio TX → McAllen TX · Tue May 13",
          shortMi: "221",
          ratePerMi: "$0.50",
          linehaulCents: 11050,
          bonusesDisplay: "—",
          lineTotalCents: 11050,
        },
        {
          loadNum: "L-13524",
          lane: "McAllen TX → Dallas TX · Sat May 17",
          shortMi: "356",
          ratePerMi: "$0.50",
          linehaulCents: 17800,
          bonusesDisplay: "—",
          lineTotalCents: 17800,
        },
      ],
      loadsFoot: {
        label: "Gross loads + bonuses",
        shortMi: "1,676",
        rate: "—",
        linehaulCents: 83800,
        bonusesDisplay: "$90.00",
        lineTotalCents: 92800,
      },
      deductionsRight: "Advance recoveries · escrow · damage co-pay",
      deductions: [
        { item: "Fuel advance recovery", reference: "Issued Mon May 11 against L-13494 · EFS", amountCents: -15000 },
        { item: "Fuel advance recovery", reference: "Issued Tue May 13 against L-13518 · EFS", amountCents: -20000 },
        { item: "Cash advance recovery", reference: "Issued Wed May 14 · Comcheck #889341", amountCents: -5000 },
        { item: "Escrow contribution", reference: "Weekly · maintains driver escrow at $2,500 floor", amountCents: -2500 },
        { item: "Damage co-pay · mud flap L-13494", reference: "Repair invoice WO-44820 · 50% co-pay per contract", amountCents: -2250 },
      ],
      deductionsTotalCents: 44750,
      netTitle: "Net settlement · paid Fri May 22",
      netSubLines: ["ACH to BBVA Compass acct **6224 · routing 113010547"],
      netCents: 48050,
      ytd: {
        grossCents: 1574850,
        deductionsCents: 288325,
        netCents: 1286525,
        milesDisplay: "28,514",
      },
      sigDriverName: "R. Smith",
      dispatcherSigLine: "Jorge Munoz · IH 35 Trucking",
      dispatcherIssuedNote: "Generated Wed, May 13, 2026 · 8:51 AM CT",
      disputesFooter: "Email payroll@ih35trucking.com",
      escrowFooter: "Current driver escrow: $2,525.00",
    };

    const html = renderSettlementBody(model);
    expect(html).toContain("S-2026-W20-RSMITH");
    expect(html).toContain("L-13518");
    expect(html).toContain("$480.50");
    expect(html).toContain("Deductions &amp; recoveries");
    expect(html).toContain("YTD totals · for 1099-NEC");
    expect(html).toContain("Driver acknowledgment");
    expect(html.includes("<script>")).toBe(false);

    const wrapped = wrapPdfDocument({ title: "S-test · Settlement", body: html });
    expect(wrapped.includes("<script>")).toBe(false);
  });
});

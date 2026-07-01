import { describe, it, expect } from "vitest";
import {
  parseCsvText,
  splitName,
  isJunkName,
  normalizeImportDate,
  normalizePhone,
  normalizeKey,
  mapCsvToRecords,
  classifyImportRows,
  summarize,
} from "./drivers-import.routes.js";

describe("driver import — CSV parsing", () => {
  it("parses quoted fields, embedded commas, and CRLF", () => {
    const grid = parseCsvText('Name,Hire Date\r\n"Sanchez, Abel",2023-06-13\r\nMaria Lopez,27/02/2024\r\n');
    expect(grid).toEqual([
      ["Name", "Hire Date"],
      ["Sanchez, Abel", "2023-06-13"],
      ["Maria Lopez", "27/02/2024"],
    ]);
  });
  it("drops fully-empty rows", () => {
    expect(parseCsvText("a,b\n,,\nc,d\n")).toEqual([["a", "b"], ["c", "d"]]);
  });
});

describe("driver import — name handling", () => {
  it("splits first token vs remainder", () => {
    expect(splitName("Jorge Pablo Munoz")).toEqual({ first_name: "Jorge", last_name: "Pablo Munoz" });
    expect(splitName("Abel")).toEqual({ first_name: "Abel", last_name: "Abel" });
    expect(splitName("   ")).toBeNull();
  });
  it("flags junk/non-person rows", () => {
    expect(isJunkName("TERMINATED DRIVERS")).toBe(true);
    expect(isJunkName("#VALUE!")).toBe(true);
    expect(isJunkName("TEST-DRIVER-1 SEED")).toBe(true);
    expect(isJunkName("None")).toBe(true);
    expect(isJunkName("Abel Sanchez")).toBe(false);
  });
});

describe("driver import — date normalization", () => {
  it("handles ISO, ISO+time, and DD/MM/YYYY (file locale)", () => {
    expect(normalizeImportDate("2024-08-04 00:00")).toBe("2024-08-04");
    expect(normalizeImportDate("2023-06-13")).toBe("2023-06-13");
    expect(normalizeImportDate("27/02/2024")).toBe("2024-02-27");
    expect(normalizeImportDate("None")).toBeNull();
    expect(normalizeImportDate("")).toBeNull();
  });
  it("tolerates MM/DD when the day field is clearly a month", () => {
    expect(normalizeImportDate("13/06/2023")).toBe("2023-06-13"); // 13 can't be a month → DD/MM
  });
  it("rejects impossible calendar dates (would 22008 on ::date and crash the commit)", () => {
    expect(normalizeImportDate("31/04/2021")).toBeNull(); // April has 30 days
    expect(normalizeImportDate("2021-02-30")).toBeNull();
    expect(normalizeImportDate("29/02/2021")).toBeNull(); // non-leap
    expect(normalizeImportDate("29/02/2024")).toBe("2024-02-29"); // leap year OK
  });
});

describe("driver import — phone", () => {
  it("prefers a real number, strips formatting, rejects all-zero/short", () => {
    expect(normalizePhone("(984) 246-2407")).toBe("9842462407");
    expect(normalizePhone("None", "(956) 220-1149")).toBe("9562201149");
    expect(normalizePhone("None", "(000) 000-0000")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("driver import — classification + dedup", () => {
  const csv = [
    "Name,Hire Date,Termination Date,Cell Phone,License",
    "Abel Sanchez Badillo,2023-06-13,2023-06-19,(984) 246-2407,TX123",
    "Abel Sanchez Badillo,2023-06-13,,(984) 246-2407,TX123", // dup in file
    "Maria Lopez,27/02/2024,,,", // active, no phone
    "TERMINATED DRIVERS,,,,", // junk
    "Adrian Trujillo Tapia,2025-04-28,,(956) 111-2222,TX999", // already in roster
  ].join("\n");

  it("classifies will_create / dup_in_file / dup_existing / invalid and sets status", () => {
    const { records } = mapCsvToRecords(parseCsvText(csv));
    const existing = new Set([normalizeKey("Adrian Trujillo Tapia")]);
    const rows = classifyImportRows(records, existing);
    const s = summarize(rows);
    expect(s.total).toBe(5);
    expect(s.will_create).toBe(2); // Abel + Maria
    expect(s.dup_in_file).toBe(1); // 2nd Abel
    expect(s.dup_existing).toBe(1); // Adrian
    expect(s.invalid).toBe(1); // TERMINATED DRIVERS
    expect(s.will_create_no_phone).toBe(1); // Maria

    const abel = rows.find((r) => r.first_name === "Abel" && r.klass === "will_create")!;
    expect(abel.status).toBe("Terminated"); // has termination_date
    expect(abel.hire_date).toBe("2023-06-13");
    const maria = rows.find((r) => r.first_name === "Maria")!;
    expect(maria.status).toBe("Active");
    expect(maria.phoneMissing).toBe(true);
  });
});

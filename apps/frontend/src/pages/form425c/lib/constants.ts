import type { CompanyProfiles, QuestionnaireItem } from "../types";

export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const YEARS = [2024, 2025, 2026, 2027];

export const QUESTIONNAIRE: QuestionnaireItem[] = [
  { num: 1, text: "Did the business operate during the entire reporting period?", expectYes: true },
  { num: 2, text: "Do you plan to continue to operate the business next month?", expectYes: true },
  { num: 3, text: "Have you paid all of your bills on time?", expectYes: true },
  { num: 4, text: "Did you pay your employees on time?", expectYes: true },
  { num: 5, text: "Have you deposited all the receipts for your business into debtor in possession (DIP) accounts?", expectYes: true },
  { num: 6, text: "Have you timely filed your tax returns and paid all of your taxes?", expectYes: true },
  { num: 7, text: "Have you timely filed all other required government filings?", expectYes: true },
  { num: 8, text: "Are you current on your quarterly fee payments to the U.S. Trustee or Bankruptcy Administrator?", expectYes: true },
  { num: 9, text: "Have you timely paid all of your insurance premiums?", expectYes: true },
  { num: 10, text: "Do you have any bank accounts open other than the DIP accounts?", expectYes: false },
  { num: 11, text: "Have you sold any assets other than inventory?", expectYes: false },
  {
    num: 12,
    text: "Have you sold or transferred any assets or provided services to anyone related to the DIP in any way?",
    expectYes: false,
  },
  { num: 13, text: "Did any insurance company cancel your policy?", expectYes: false },
  { num: 14, text: "Did you have any unusual or significant unanticipated expenses?", expectYes: false },
  { num: 15, text: "Have you borrowed money from anyone or has anyone made any payments on your behalf?", expectYes: false },
  { num: 16, text: "Has anyone made an investment in your business?", expectYes: false },
  { num: 17, text: "Have you paid any bills you owed before you filed bankruptcy?", expectYes: false },
  { num: 18, text: "Have you allowed any checks to clear the bank that were issued before you filed bankruptcy?", expectYes: false },
];

export const DEFAULT_Q = {
  1: "yes",
  2: "yes",
  3: "yes",
  4: "yes",
  5: "yes",
  6: "yes",
  7: "yes",
  8: "yes",
  9: "yes",
  10: "no",
  11: "no",
  12: "no",
  13: "no",
  14: "no",
  15: "no",
  16: "no",
  17: "no",
  18: "no",
} as const;

export const DEFAULT_PROFILES: CompanyProfiles = {
  trucking: {
    name: "IH 35 TRUCKING LLC",
    caseNumber: "",
    district: "Texas",
    division: "San Antonio",
    judge: "",
    ein: "",
    address: "Laredo, TX 78041",
    lineOfBusiness: "Freight Trucking",
    naiscCode: "484121",
    bankAccounts: [{ id: "WF-3500", label: "Wells Fargo – WF-3500", number: "xxxx3500" }],
    defaultAnswers: { ...DEFAULT_Q },
  },
  transportation: {
    name: "IH 35 TRANSPORTATION LLC",
    caseNumber: "",
    district: "Texas",
    division: "San Antonio",
    judge: "",
    ein: "",
    address: "Laredo, TX 78041",
    lineOfBusiness: "Transportation",
    naiscCode: "485",
    bankAccounts: [
      { id: "WF-1", label: "Wells Fargo – WF (Account 1)", number: "xxxx" },
      { id: "WF-2", label: "Wells Fargo – WF (Account 2)", number: "xxxx" },
      { id: "WF-3", label: "Wells Fargo – WF (Account 3)", number: "xxxx" },
    ],
    defaultAnswers: { ...DEFAULT_Q },
  },
};

export const XFER_KW = [
  "transfer",
  "xfer",
  "xfr",
  "inter-",
  "journal entry",
  "opening balance",
  "reconcil",
  "balance adjustment",
  "wire to",
  "wire from",
  "funds transfer",
  "account transfer",
];

export const INCOME_TYPES = ["deposit", "payment", "sales receipt", "invoice", "credit", "check", "pmt", "dep", "rcpt"];


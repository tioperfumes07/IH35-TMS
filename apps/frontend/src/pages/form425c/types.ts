export type AnswerValue = "yes" | "no" | "na";

export type QuestionnaireItem = {
  num: number;
  text: string;
  expectYes: boolean;
};

export type BankAccount = {
  id: string;
  label: string;
  number: string;
};

export type CompanyProfile = {
  name: string;
  caseNumber: string;
  district: string;
  division: string;
  judge: string;
  ein: string;
  address: string;
  lineOfBusiness: string;
  naiscCode: string;
  bankAccounts: BankAccount[];
  defaultAnswers: Record<number, AnswerValue>;
};

export type CompanyKey = "trucking" | "transportation";

export type CompanyProfiles = Record<CompanyKey, CompanyProfile>;

export type QBParsedLine = {
  date: string;
  type: string;
  desc: string;
  acct: string;
  amt: number;
  include: boolean;
};

export type CurrentFormState = {
  reportId: string | null;
  status: "draft" | "ready_to_file" | "filed" | "amended" | "missing";
  answers: Record<number, AnswerValue>;
  openingBalance: string;
  totalReceipts: string;
  totalDisbursements: string;
  totalPayables: string;
  totalReceivables: string;
  numEmployeesAtFiling: string;
  numEmployeesNow: string;
  proFeesThisMonth: string;
  proFeesSinceFiling: string;
  otherProFeesThisMonth: string;
  otherProFeesSinceFiling: string;
  projReceiptsLast: string;
  projDisbLast: string;
  projReceiptsNext: string;
  projDisbNext: string;
  projectionOverrideReason: string;
  hasCarryForward: boolean;
  att38: boolean;
  att39: boolean;
  att40: boolean;
  att41: boolean;
  att42: boolean;
  notes: string;
  amendedFromUuid?: string | null;
};

export type HistoryReportRow = {
  id: string;
  reporting_month: string;
  status: "draft" | "ready_to_file" | "filed" | "amended";
  filed_at?: string | null;
  filed_by_user_id?: string | null;
  amended_from_uuid?: string | null;
};

export type Form425CProfileRecord = {
  id: string;
  operating_company_id: string;
  company_key: CompanyKey;
  company_name: string;
  case_number: string;
  district: string;
  division: string;
  judge: string;
  ein: string;
  filing_address: string;
  line_of_business: string;
  naisc_code: string;
  default_questionnaire_answers: Record<string, AnswerValue>;
  bank_accounts: BankAccount[];
  last_updated_at: string;
};


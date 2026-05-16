/** Minimal QuickBooks Online v3 JSON shapes used by outbound accounting writers (camelCase keys). */

export type QboRef = { value: string; name?: string };

export type QboLinkedTxn = { TxnId: string; TxnType: string };

export type QboSalesItemLineDetail = {
  ItemRef: QboRef;
  Qty?: number;
  UnitPrice?: number;
  ClassRef?: QboRef;
  TaxCodeRef?: QboRef;
};

export type QboInvoiceLine = {
  Id?: string;
  LineNum?: number;
  Amount: number;
  DetailType: "SalesItemLineDetail";
  SalesItemLineDetail: QboSalesItemLineDetail;
  Description?: string;
};

export type QboAccountBasedExpenseLineDetail = {
  AccountRef: QboRef;
  ClassRef?: QboRef;
  TaxCodeRef?: QboRef;
  BillableStatus?: string;
};

export type QboBillLine = {
  Id?: string;
  Amount: number;
  DetailType: "AccountBasedExpenseLineDetail";
  AccountBasedExpenseLineDetail: QboAccountBasedExpenseLineDetail;
  Description?: string;
};

export type QboJournalEntryLineDetail = {
  PostingType: "Debit" | "Credit";
  AccountRef: QboRef;
  Entity?: { Type: string; EntityRef: QboRef };
  ClassRef?: QboRef;
};

export type QboJournalLine = {
  Id?: string;
  Amount: number;
  DetailType: "JournalEntryLineDetail";
  JournalEntryLineDetail: QboJournalEntryLineDetail;
  Description?: string;
};

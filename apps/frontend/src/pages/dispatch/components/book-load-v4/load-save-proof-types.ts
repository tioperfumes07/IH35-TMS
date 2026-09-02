export type ProofLink =
  | { state: "linked"; id: string; label: string }
  | { state: "not_set"; reason: string };

export type LoadSaveProof = {
  created: {
    load_id: string;
    load_number: string | null;
    status: string | null;
    audit_insert: boolean;
    audit_changed_at: string | null;
    trace_no: string | null;
  };
  linked: {
    customer: ProofLink;
    driver: ProofLink;
    truck: ProofLink;
    trailer: ProofLink;
  };
  ledger: {
    postings: Array<{
      journal_entry_id: string;
      debit_or_credit: string;
      amount_cents: number;
      source_transaction_type: string | null;
      source_trace_key: string | null;
    }>;
    empty_english: string | null;
  };
  did_not: string[];
};

/** Display law: a missing driver id is never Linked. */
export function driverLinkFromIds(driverId: string | null | undefined, teamId?: string | null): ProofLink {
  const d = String(driverId ?? "").trim();
  if (d) return { state: "linked", id: d, label: d };
  const t = String(teamId ?? "").trim();
  if (t) return { state: "linked", id: t, label: "Team assignment" };
  return { state: "not_set", reason: "Driver is not set." };
}

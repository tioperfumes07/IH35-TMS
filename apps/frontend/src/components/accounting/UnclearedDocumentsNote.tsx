import { mmmDd } from "../../lib/formatDate";
import { formatUsdCents } from "../../lib/money";

export type UnclearedDocumentNote = {
  document_type: string;
  document_number: string;
  document_date: string;
  amount_cents: number;
};

/** ROUND 363-CUR-A — name the uncleared document beside the cleared balance. */
export function UnclearedDocumentsNote({ docs }: { docs: UnclearedDocumentNote[] }) {
  if (!docs.length) return null;
  return (
    <ul className="text-xs text-slate-600">
      {docs.map((d) => (
        <li key={`${d.document_type}-${d.document_number}-${d.document_date}-${d.amount_cents}`}>
          {d.document_type} {d.document_number} {d.document_date ? mmmDd(d.document_date) : "—"}{" "}
          {formatUsdCents(d.amount_cents)} not cleared
        </li>
      ))}
    </ul>
  );
}

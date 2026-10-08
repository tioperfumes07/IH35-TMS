import { EntityLink } from "../../../../components/shared/EntityLink";
import type { LoadSaveProof, ProofLink } from "./load-save-proof-types";

const LINK_KIND = {
  Customer: "customer",
  Driver: "driver",
  Truck: "unit",
  Trailer: "trailer",
} as const;

function LinkRow({ name, slot }: { name: keyof typeof LINK_KIND; slot: ProofLink }) {
  const linked = slot.state === "linked";
  return (
    <li className="flex items-start justify-between gap-3 py-0.5" data-testid={`save-proof-link-${name.toLowerCase()}`}>
      <span className="text-xs font-medium text-[#4B5563]">{name}</span>
      {linked ? (
        <span className="text-right text-xs font-medium text-[#0F1219]" data-proof-state="linked">
          Linked · <EntityLink kind={LINK_KIND[name]} id={slot.id} label={slot.label} />
        </span>
      ) : (
        <span className="text-right text-xs text-[#6B7280]" data-proof-state="not_set">
          Not set · {slot.reason}
        </span>
      )}
    </li>
  );
}

export function LoadSaveProofPanel({
  proof,
  onContinue,
}: {
  proof: LoadSaveProof;
  onContinue: () => void;
}) {
  return (
    <div className="border-t border-[#E5E7EB] bg-[#F7F8FA] px-3 py-3" data-testid="load-save-proof-panel">
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">What this save did</p>
      <section className="mt-2" data-testid="save-proof-created">
        <h3 className="text-xs font-semibold text-[#1F2A44]">Created</h3>
        <p className="text-xs text-[#4B5563]">
          Load {proof.created.load_number || "created"}
          {proof.created.status ? ` · ${proof.created.status}` : ""}
          {proof.created.audit_insert ? " · audit INSERT recorded" : " · audit INSERT not found"}
        </p>
        {proof.created.trace_no ? (
          <p className="font-mono text-xs text-[#6B7280]">trace {proof.created.trace_no}</p>
        ) : null}
      </section>
      <section className="mt-2" data-testid="save-proof-linked">
        <h3 className="text-xs font-semibold text-[#1F2A44]">Linked</h3>
        <ul className="mt-0.5">
          <LinkRow name="Customer" slot={proof.linked.customer} />
          <LinkRow name="Driver" slot={proof.linked.driver} />
          <LinkRow name="Truck" slot={proof.linked.truck} />
          <LinkRow name="Trailer" slot={proof.linked.trailer} />
        </ul>
      </section>
      <section className="mt-2" data-testid="save-proof-ledger">
        <h3 className="text-xs font-semibold text-[#1F2A44]">Ledger postings</h3>
        {proof.ledger.postings.length === 0 ? (
          <p className="text-xs text-[#6B7280]">{proof.ledger.empty_english}</p>
        ) : (
          <ul className="mt-0.5 space-y-0.5">
            {proof.ledger.postings.map((p) => (
              <li key={`${p.journal_entry_id}-${p.debit_or_credit}-${p.amount_cents}`} className="text-xs text-[#4B5563]">
                {p.debit_or_credit} {(p.amount_cents / 100).toFixed(2)} ·{" "}
                <EntityLink kind="journal_entry" id={p.journal_entry_id} label="journal entry" />
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="mt-2" data-testid="save-proof-did-not">
        <h3 className="text-xs font-semibold text-[#1F2A44]">DID NOT</h3>
        {proof.did_not.length === 0 ? (
          <p className="text-xs text-[#6B7280]">Nothing extra to report.</p>
        ) : (
          <ul className="mt-0.5 list-disc pl-4">
            {proof.did_not.map((line) => (
              <li key={line} className="text-xs text-[#4B5563]">
                {line}
              </li>
            ))}
          </ul>
        )}
      </section>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          className="rounded border border-[#E5E7EB] bg-white px-3 py-1 text-xs font-semibold text-[#1F2A44]"
          onClick={onContinue}
        >
          Continue
        </button>
      </div>
    </div>
  );
}

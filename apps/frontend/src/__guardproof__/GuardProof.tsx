import { useState } from "react";
// Throwaway: proves verify-money-fields-use-moneyinput catches BOTH slip-shapes.
export function GuardProof() {
  const [form, setForm] = useState({ amount: 0 });        // inline-create-row pattern (Internal Fines)
  const [claimAmountCents, setClaimAmountCents] = useState(""); // "(cents)"-labelled raw (Warranty/Factoring)
  return (
    <div>
      {/* shape (a): inline-create-row money input, bare type=number */}
      <input type="number" value={form.amount} onChange={(e) => setForm({ amount: Number(e.target.value) })} />
      {/* shape (b): "(cents)"-labelled raw text input */}
      <label>Claim amount (cents)
        <input value={claimAmountCents} onChange={(e) => setClaimAmountCents(e.target.value)} />
      </label>
    </div>
  );
}

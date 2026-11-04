// ACCT-F11070 — register rows 127-130 (ENG-48 / 49 / 50 / 51) static guard (claimed 19901 in #28617; no DB).
// R127 role-resolved card-credit repair + purchase-grained, chain-aware fuel one-to-one + dedupe ceilings 4/314 · R128 signed
// expense cost on every load / settlement read model · R129 one writer of accounting.invoices.amount_paid_cents · R130 Book
// Load records the source of the miles it writes.
export default {
  name: "verify:verify-rows-127-130",
  run(ctx) {
    ctx.run("node", ["scripts/verify-rows-127-130.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-rows-127-130.mjs"]);
  },
};

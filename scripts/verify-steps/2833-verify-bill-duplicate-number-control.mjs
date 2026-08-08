// verify-bill-duplicate-number-control — ACCT-F182 (board card LV-AP-DUP).
//
// Live-proven: two accounting.bills rows, same vendor / bill_number / amount / date, 10.3 s apart,
// BOTH posted — $1,486.42 of expense and A/P for one $743.21 invoice, accepted with no warning.
// Not a double-submit race (ten seconds apart) and not covered by idempotency (different keys).
//
// Selftest first, and it is the load-bearing half: the live check is a static scan, so a planted
// defect is the only thing proving it still detects anything. Two of its six mutations exist
// because they caught real weaknesses in this guard before it shipped — the query matcher grabbed
// the wrong `FROM accounting.bills … LIMIT 1` block, and the 409 assertion passed on an unrelated
// route's 409.
export default {
  name: "verify:bill-duplicate-number-control",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-bill-duplicate-number-control.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-bill-duplicate-number-control.mjs"]);
  },
};

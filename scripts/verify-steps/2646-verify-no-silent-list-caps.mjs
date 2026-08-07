// verify-no-silent-list-caps — CLS-SILENT-CAP (frontend half). A list that fetches a HARD CAP and never
// tells the user it capped: legal.matters shipped a bare LIMIT 500 with no offset and no total, so matter
// 501 simply did not exist as far as the screen was concerned. A cap the caller cannot see is
// indistinguishable from "there is no more data". The BACKEND guard (verify-mdata-list-pagination) asserts
// five route files RETURN a total — necessary and not sufficient; nothing asserted the UI SURFACES it.
// Baseline ratchet: existing debt inventoried, NEW ones fail, list may only shrink.
export default {
  name: "verify:no-silent-list-caps",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-no-silent-list-caps.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-no-silent-list-caps.mjs"]);
  },
};

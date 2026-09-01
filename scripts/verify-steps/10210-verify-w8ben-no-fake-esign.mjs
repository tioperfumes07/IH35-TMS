// WIR-04 — W-8BEN honest blocked banner; field-data save only; no fake LegalSign claim. Step 10210 · Cursor EVEN.
export default {
  name: "verify-w8ben-no-fake-esign",
  run(ctx) {
    ctx.run("node", ["scripts/verify-w8ben-no-fake-esign.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-w8ben-no-fake-esign.mjs"]);
  },
};

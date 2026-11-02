// Step 18802 — ENG-07 Book Load refuses city-only pickup/delivery (street or Google place).
export default {
  name: "verify:book-stop-street-or-place-required",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-stop-street-or-place-required.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-stop-street-or-place-required.mjs"]);
  },
};

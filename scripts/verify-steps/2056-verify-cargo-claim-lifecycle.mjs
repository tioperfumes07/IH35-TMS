// SAF-F20 cargo-claim leg — Carmack intake lifecycle (Cursor EVEN band).
export default {
  name: "verify:cargo-claim-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cargo-claim-lifecycle.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cargo-claim-lifecycle.mjs"]);
  },
};

// verify-local-gate-covers-fe-ratchets — the local pre-push gate must carry every GLOBAL FE component
// ratchet CI runs. #4484 red'd CI five times on standards a 0.1s static scan catches; the first
// hand-written fix then MISSED verify-referenceselect-coverage-ratchet (invoked via `npm run`, not
// `node`) and burned another cycle. This asserts the mirror instead of trusting it.
export default {
  name: "verify:local-gate-covers-fe-ratchets",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-local-gate-covers-fe-ratchets.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-local-gate-covers-fe-ratchets.mjs"]);
  },
};

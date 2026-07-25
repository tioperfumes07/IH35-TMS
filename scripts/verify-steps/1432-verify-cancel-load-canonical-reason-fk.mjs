// LST-F04: the cancel-load writer must persist reason_code_id (canonical per-entity FK), not just
// the legacy reason_code text that was FK'd to the RETIRE table catalogs.cancellation_reasons.
export default {
  name: "verify:cancel-load-canonical-reason-fk",
  run(ctx) {
    ctx.run("node", ["scripts/verify-cancel-load-canonical-reason-fk.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-cancel-load-canonical-reason-fk.mjs"]);
  },
};

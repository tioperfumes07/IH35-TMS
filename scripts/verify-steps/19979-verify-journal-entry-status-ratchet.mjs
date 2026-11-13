export default {
  name: "verify:journal-entry-status-ratchet",
  run(ctx) {
    ctx.run("node", ["scripts/verify-journal-entry-status-ratchet.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-journal-entry-status-ratchet.mjs"]);
  },
};

export default {
  name: "verify:bill-list-journal-entry-date-memo-resolves",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bill-list-journal-entry-date-memo-resolves.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bill-list-journal-entry-date-memo-resolves.mjs"]);
  },
};

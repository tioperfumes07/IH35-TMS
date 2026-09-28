export default {
  name: "verify:no-journal-entry-has-zero-postings",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-journal-entry-has-zero-postings.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-journal-entry-has-zero-postings.mjs"]);
  },
};

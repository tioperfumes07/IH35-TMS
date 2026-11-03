export default {
  name: "verify:seed-document-is-whole",
  run(ctx) {
    ctx.run("node", ["scripts/verify-seed-document-is-whole.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-seed-document-is-whole.mjs"]);
  },
};

export default {
  name: "legal-template-detail-no-box-in-box",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-template-detail-no-box-in-box.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-legal-template-detail-no-box-in-box.mjs"]);
  },
};

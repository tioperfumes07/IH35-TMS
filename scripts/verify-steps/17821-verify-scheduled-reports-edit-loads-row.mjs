export default {
  name: "verify:scheduled-reports-edit-loads-row",
  run(ctx) {
    ctx.run("node", ["scripts/verify-scheduled-reports-edit-loads-row.mjs"]);
  },
};

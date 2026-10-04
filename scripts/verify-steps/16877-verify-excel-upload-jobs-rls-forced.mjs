export default {
  name: "verify:excel-upload-jobs-rls-forced",
  run(ctx) {
    ctx.run("node", ["scripts/verify-excel-upload-jobs-rls-forced.mjs"]);
  },
};

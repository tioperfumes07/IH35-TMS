export default {
  name: "verify:warranty-reimburse-update-checked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-warranty-reimburse-update-checked.mjs"]);
  },
};

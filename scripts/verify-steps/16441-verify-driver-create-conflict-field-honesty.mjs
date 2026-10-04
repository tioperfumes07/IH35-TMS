export default {
  name: "verify:driver-create-conflict-field-honesty",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-create-conflict-field-honesty.mjs"]);
  },
};

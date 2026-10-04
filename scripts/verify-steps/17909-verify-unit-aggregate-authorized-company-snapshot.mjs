export default {
  name: "verify:unit-aggregate-authorized-company-snapshot",
  run(ctx) {
    ctx.run("node", ["scripts/verify-unit-aggregate-authorized-company-snapshot.mjs"]);
  },
};

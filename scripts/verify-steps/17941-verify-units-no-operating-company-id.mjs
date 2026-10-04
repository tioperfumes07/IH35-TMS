export default {
  name: "verify:units-no-operating-company-id",
  run(ctx) {
    ctx.run("node", ["scripts/verify-units-no-operating-company-id.mjs"]);
  },
};

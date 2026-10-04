export default {
  name: "verify:no-caller-voids-without-cascade",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-caller-voids-without-cascade.mjs"]);
  },
};

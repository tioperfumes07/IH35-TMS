export default {
  name: "verify:coi-single-component",
  run(ctx) {
    ctx.run("node", ["scripts/verify-coi-single-component.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-coi-single-component.mjs"]);
  },
};

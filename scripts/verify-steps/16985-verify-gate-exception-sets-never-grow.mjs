export default {
  name: "verify:gate-exception-sets-never-grow",
  run(ctx) {
    ctx.run("node", ["scripts/verify-gate-exception-sets-never-grow.mjs"]);
  },
};

export default {
  name: "verify:factoring-collection-completeness",
  run(ctx) {
    ctx.run("node", ["--env-file=/Users/jorgemunoz/.ih35-gate.env", "scripts/verify-factoring-collection-completeness.mjs"]);
    ctx.run("node", ["--env-file=/Users/jorgemunoz/.ih35-gate.env", "scripts/verify-factoring-collection-completeness.mjs", "--selftest"]);
  },
};

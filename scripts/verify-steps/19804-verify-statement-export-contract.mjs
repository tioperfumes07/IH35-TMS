export default {
  name: "verify:statement-export-contract",
  run(ctx) {
    ctx.run("node", ["scripts/verify-statement-export-contract.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-statement-export-contract.mjs"]);
  },
};

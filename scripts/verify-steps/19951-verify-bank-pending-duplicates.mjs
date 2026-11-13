export default {
  name: "verify:verify-bank-pending-duplicates",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bank-pending-duplicates.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-bank-pending-duplicates.mjs"]);
  },
};

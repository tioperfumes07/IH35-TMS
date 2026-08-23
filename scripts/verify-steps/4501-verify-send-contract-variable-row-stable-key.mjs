export default {
  name: "verify:send-contract-variable-row-stable-key",
  run(ctx) {
    ctx.run("node", ["scripts/verify-send-contract-variable-row-stable-key.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-send-contract-variable-row-stable-key.mjs"]);
  },
};

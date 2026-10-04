export default {
  name: "verify:trailer-reefer-uses-paritytable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-trailer-reefer-uses-paritytable.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-trailer-reefer-uses-paritytable.mjs"]);
    // BANK-F91552 leftover slate class refuse (14349 is CC-1 ≡1).
    ctx.run("node", ["scripts/verify-reefer-fuel-credit-leftover-chrome.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-reefer-fuel-credit-leftover-chrome.mjs"]);
  },
};

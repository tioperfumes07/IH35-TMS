export default { name: "verify-maint-kpi-dashboard", run(ctx) { if (ctx.run("npm", ["run", "verify:maint-kpi-dashboard"]) !== 0) throw new Error("verify:maint-kpi-dashboard failed"); } };

export async function registerProfitLossRoutes(app) {
  app.route({ method: "GET", url: "/api/v1/accounting/profit-loss", handler: async () => ({ ok: true }) });
}

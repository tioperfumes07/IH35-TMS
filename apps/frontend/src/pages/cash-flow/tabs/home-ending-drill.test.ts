import { describe, expect, it } from "vitest";
import homeSource from "./CashFlowHomeTab.tsx?raw";
import ledgerSource from "./RollingLedgerTab.tsx?raw";
import pageSource from "../CashFlowPage.tsx?raw";

describe("Cash Flow Home Ending drill (board4/7)", () => {
  it("Home Ending drill carries rl_ending + rl_opening (not only rl_net)", () => {
    expect(homeSource).toMatch(/rl_ending:\s*explain === "ending"/);
    expect(homeSource).toMatch(/rl_opening:\s*openingCents/);
    expect(homeSource).toMatch(/endingCents - bucket\.net_cents/);
    // Negative: must not send only rl_net for ending without ending cents.
    expect(pageSource).toMatch(/rl_ending/);
    expect(pageSource).toMatch(/rl_opening/);
  });

  it("Rolling Ledger Ending banner shows Opening + Net = Ending (not Clicked Ending = net)", () => {
    expect(ledgerSource).toMatch(/Clicked Ending = \$\{formatUsdCents\(homeNetBreakdown\.ending\)\}/);
    expect(ledgerSource).toMatch(/Opening \$\{formatUsdCents\(homeNetBreakdown\.opening\)\}/);
    expect(ledgerSource).toMatch(/searchParams\.get\("rl_ending"\)/);
    // Negative control: Ending path must not label Clicked Ending with homeNetBreakdown.net alone.
    expect(ledgerSource).not.toMatch(
      /Clicked \{homeNetBreakdown\.explain === "ending" \? "Ending" : "Net"\} = \{formatUsdCents\(homeNetBreakdown\.net\)\}/,
    );
  });
});

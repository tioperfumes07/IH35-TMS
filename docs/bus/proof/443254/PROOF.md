# ROUND 443.254 PROOF — Settlements nav (N1 N2 N5 N7 N8)

## N1 route list (Settlements module mounts)
```
2833:          path="/driver-finance/settlements"
2843:          path="/driver-finance/settlements/batch"
2851:          path="/driver-finance/settlement-creator"
2859:          path="/driver-finance/cash-advance-requests"
2867:          path="/driver-finance/company-settlements"
2875:          path="/driver-finance/settlement-close"
2883:        <Route path="/driver-finance/drivers" element={<ProtectedRoute><SettlementsDriversPage /></ProtectedRoute>} />
2884:        <Route path="/driver-finance/profiles" element={<ProtectedRoute><SettlementsProfilesPage /></ProtectedRoute>} />
2885:        <Route path="/driver-finance/pre-settlements" element={<ProtectedRoute><SettlementsPreSettlementsPage /></ProtectedRoute>} />
2886:        <Route path="/driver-finance/feed-gate" element={<ProtectedRoute><SettlementsFeedGatePage /></ProtectedRoute>} />
2887:        <Route path="/driver-finance/cash-advances" element={<ProtectedRoute><SettlementsCashAdvancesPage /></ProtectedRoute>} />
2888:        <Route path="/driver-finance/liabilities" element={<ProtectedRoute><SettlementsLiabilitiesPage /></ProtectedRoute>} />
2889:        <Route path="/driver-finance/escrow" element={<ProtectedRoute><SettlementsEscrowPage /></ProtectedRoute>} />
2890:        <Route path="/driver-finance/escrow/:driverId" element={<ProtectedRoute><EscrowRegisterPage /></ProtectedRoute>} />
2891:        <Route path="/driver-finance/pay-rate-templates" element={<ProtectedRoute><SettlementsPayRateTemplatesPage /></ProtectedRoute>} />
2892:        <Route path="/driver-finance/deductions" element={<ProtectedRoute><SettlementsDeductionsPage /></ProtectedRoute>} />
4865:          path="/driver-finance/driver-bills"
4875:          path="/driver-finance/driver-bills/:id"
```

## N2 guard
```
verify-back-returns-to-module-parent: PASS — verify-back-arrow-stays-in-module: PASS — 4 writers clamp inModuleBackHref; 160 page back literals in-module; 663 manifest routes keep parent prefix; 0 cross-module
  PASS  real repo tree passes
  PASS  cross-module back FAILS
verify-back-returns-to-module-parent --selftest 2/2
```

## N5 escrow name → register
- EscrowPage driver Link → settlementsEscrowRegisterHref(holder_id) = /driver-finance/escrow/:driverId
- EscrowRegisterPage: ParityTable dated lines + source + running balance; Back → /driver-finance/escrow

## N7 PU/DEL + gear/sort
- SettlementsToursRegister: PU date + DEL date separate sortable columns; ParityTable gear (storageKey)
- CashAdvancesTable: gearButtonTestId + every money/enum column sortable

## N8 Cash Advances
- formatUsdTable for KPI + Amount/Outstanding ($2,575.96)
- labelEnum for purpose/method/status; formatDisplayName for driver

DONE = CURSOR → LEAD | 443.254 DONE (N1 N2 N5 N7 N8)

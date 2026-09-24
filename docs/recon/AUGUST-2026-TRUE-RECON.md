# USMCA August 2026 — TRUE RECONCILIATION (tour-shaped)

Generated: 2026-09-24T15:14:29.086Z · Neon `tiny-field-89581227 / br-fancy-credit-akjnd07a`

## Law (architecture + owner)

- ARCHITECTURE-BLUEPRINT §3: Bill per LOAD; multiple bills → ONE settlement (a trip/tour).
- MEMORY_BANK: settlement = TOUR = NB (+ optional TR triangulation) + SB back to Laredo/Mexico. Never group by calendar week as the identity.
- GO-22: trip_type NB/TR/SB; NB opens tour; TR/SB join; AlwaysTrack 4-digit doc = settlement identity.
- Owner 2026-09-24: sometimes only 1 load (local or NB); breakdown may omit SB; SB may deliver off-Laredo with deadhead miles home to Laredo.
- Owner 2026-09-24: a settlement usually spans ~1 week, but can last MORE than a week when triangulation loads extend the tour.
- TRIP-TYPE-DERIVE: NB=Laredo pickup, SB=Laredo delivery, TR=neither, LOCAL=Laredo↔Laredo.

## Verdict

| Check | Result |
|---|---|
| Faro 8/10–8/31 | **TIE** 13/13 |
| Faro purchase $ | ctrl 108975.00 / live 108975.00 |
| Faro net adv $ | ctrl 105575.74 / live 105575.74 |
| Tours in scope | 31 |
| Tours composition OK | 13 / gaps 18 |
| Tour duration (stop span) | avg 7.7d · min 1d · max 40d |
| Tours longer than 7 days (triangulations extend) | 5772(10d/2TR), 5773(40d/1TR), 5775(10d/2TR), 5776(11d/1TR), 5778(10d/0TR), 5784(9d/2TR), 5785(9d/2TR), 5787(9d/1TR), 5788(11d/1TR) |
| Tours missing SB (open / breakdown / local-only — not auto-fail) | 5760, 5764, 5766, 5767, 5771, 5773, 5777, 5779, 5783, 5784, 5785, 5787, 5789, 5790, 5794 |
| Tours not beginning Laredo | 5775, 5789, 5790 |
| feed_cursor Aug pending | **NONE** |
| Minted driver_settlements (period_end Aug) | 0 |
| Partial open invoices | 43 |
| GL Aug debit/credit | 457235.87 / 457235.87 balanced=YES |

## Tours (AlwaysTrack doc = settlement identity)

| Tour | Driver | Shape | Span | >7d | Loads | Laredo start | SB | Composition |
|---|---|---|---|---|---|---|---|---|
| 5760 | JORGE FLORES VALADEZ | 1NB+1TR | 7d |  | 13481(NB) · 13489(TR) | Y | N | OK |
| 5761 | Leonel Antonio Morales | 1NB+1SB | 6d |  | 13482(NB) · 13485(SB) | Y | Y | OK |
| 5764 | Jorge Luis Infante Corona | 1NB+1TR | 6d |  | 13487(NB) · 13493(TR) | Y | N | OK |
| 5766 | Rafael Rogelio Rivero Reynoso | 1NB | 1d |  | 13501(NB) | Y | N | OK |
| 5767 | JOSE ANTONIO VICENTE MARTINEZ | 1NB+1TR | 6d |  | 13495(NB) · 13496(TR) | Y | N | OK |
| 5768 | HUGO GAYTAN SARABIA | 1NB+1SB | 6d |  | 13494(NB) · 13500(SB) | Y | Y | OK |
| 5769 | Angel Alfonso Sosa Perez | 1NB+1SB | 7d |  | 13498(NB) · 13508(SB) | Y | Y | 13498:MISSING_DB |
| 5770 | Neftali Coronado Urbano | 1NB+1SB | 6d |  | 13503(NB) · 13509(SB) | Y | Y | 13503:MISSING_DB; 13509:MISSING_DB |
| 5771 | Jorge Luis Infante Corona | 1NB+1TR | 7d |  | 13504(NB) · 13510(TR) | Y | N | 13504:MISSING_DB |
| 5772 | PEDRO ABRAHAM LOPEZ COLLADO | 1NB+2TR+1SB | 10d | Y | 13502(NB) · 13507(TR) · 13512(TR) · 13513(SB) | Y | Y | 13502:MISSING_DB; 13507:MISSING_DB; 13513:MISSING_DB |
| 5773 | Concepcion Cordova Dominguez | 1NB+1TR | 40d | Y | 13497(NB) · 13511(TR) | Y | N | 13497:MISSING_DB |
| 5774 | JOSE ANTONIO VICENTE MARTINEZ | 1NB+1SB | 7d |  | 13517(NB) · 13518(SB) | Y | Y | 13517:MISSING_DB |
| 5775 | ALFONSO HIDALGO CHAVEZ | 2TR+1SB | 10d | Y | 13506(TR) · 13514(TR) · 13516(SB) | N | Y | 13506:MISSING_DB |
| 5776 | Leonel Antonio Morales | 1NB+1TR+1SB | 11d | Y | 13505(NB) · 13515(SB) · 13520(TR) | Y | Y | 13505:MISSING_DB |
| 5777 | Jorge Luis Infante Corona | 1NB+1TR | 6d |  | 13519(NB) · 13521(TR) | Y | N | OK |
| 5778 | HUGO GAYTAN SARABIA | 1NB+1SB | 10d | Y | 13524(SB) · 13525(NB) | Y | Y | 13525:MISSING_DB |
| 5779 | LUIS ARMANDO SOSA PEREZ | 1NB+1TR | 6d |  | 13526(TR) · 13527(NB) | Y | N | 13527:MISSING_DB |
| 5780 | Rafael Rogelio Rivero Reynoso | 1NB+1SB | 3d |  | 13530(NB) · 13532(SB) | Y | Y | 13530:MISSING_DB |
| 5781 | Leonel Antonio Morales | 1NB+1SB | 6d |  | 13523(NB) · 13534(SB) | Y | Y | OK |
| 5782 | HUGO GAYTAN SARABIA | 1NB+1SB | 7d |  | 13529(NB) · 13540(SB) | Y | Y | 13540:MISSING_DB |
| 5783 | Jorge Luis Infante Corona | 1NB+1TR | 7d |  | 13535(NB) · 13537(TR) | Y | N | OK |
| 5784 | JOSE ANTONIO VICENTE MARTINEZ | 1NB+2TR | 9d | Y | 13522(NB) · 13528(TR) · 13536(TR) | Y | N | 13522:MISSING_DB |
| 5785 | Genaro Guerrero Chavez | 1NB+2TR | 9d | Y | 13531(NB) · 13538(TR) · 13543(TR) | Y | N | 13531:MISSING_DB |
| 5786 | Concepcion Cordova Dominguez | 1NB+1SB | 7d |  | 13533(NB) · 13548(SB) | Y | Y | 13533:MISSING_DB |
| 5787 | ALFONSO HIDALGO CHAVEZ | 1NB+1TR | 9d | Y | 13549(TR) · 13555(NB) | Y | N | OK |
| 5788 | Angel Alfonso Sosa Perez | 1NB+1TR+1SB | 11d | Y | 13539(NB) · 13546(TR) · 13552(SB) | Y | Y | 13539:MISSING_DB; 13546:stops+fuel; 13552:fuel |
| 5789 | Jorge Luis Infante Corona | 1TR | 4d |  | 13557(TR) | N | N | OK |
| 5790 | Leonel Antonio Morales | 1TR | 5d |  | 13554(TR) | N | N | OK |
| 5794 | JOSE ANTONIO VICENTE MARTINEZ | 1NB | 3d |  | 13558(NB) | Y | N | OK |
| 5795 | LUIS ARMANDO SOSA PEREZ | 1NB+1SB | 4d |  | 13561(NB) · 13567(SB) | Y | Y | 13567:MISSING_DB |
| 5796 | JOSE ANTONIO VICENTE MARTINEZ | 1LOCAL | 3d |  | 13541(LOCAL) | Y | N | 13541:MISSING_DB |

### Per-tour load money (LIVE)

#### Tour 5760 — 1NB+1TR — 7d — JORGE FLORES VALADEZ / T144

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13481 | NB | 3920.00 | 3920.00 | 639.59 | 639.59 | 913.18 | 913.18 | 0.00 | - |
| 13489 | TR | 2800.00 | 2800.00 | 681.31 | 681.31 | 1854.62 | 1854.62 | 0.00 | - |

#### Tour 5761 — 1NB+1SB — 6d — Leonel Antonio Morales / T171

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13482 | NB | 4100.00 | 4100.00 | 639.59 | 639.59 | 1012.74 | 1012.74 | 15.25 | - |
| 13485 | SB | 2039.00 | 2039.00 | 759.61 | 759.61 | 2219.88 | 2219.88 | 142.05 | - |

Deadhead on SB (home to Laredo): 13485=223.3 mi

#### Tour 5764 — 1NB+1TR — 6d — Jorge Luis Infante Corona / T177

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13487 | NB | 4900.00 | 4900.00 | 945.10 | 945.10 | 1992.40 | 1992.40 | 0.00 | - |
| 13493 | TR | 4000.00 | 4000.00 | 984.20 | 984.20 | 1916.07 | 1916.07 | 0.00 | - |

#### Tour 5766 — 1NB — 1d — Rafael Rogelio Rivero Reynoso / T148

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13501 | NB | 1500.00 | 1500.00 | 0.00 | 0.00 | 710.35 | 710.35 | 55.87 | - |

#### Tour 5767 — 1NB+1TR — 6d — JOSE ANTONIO VICENTE MARTINEZ / T168

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13495 | NB | 4100.00 | 4100.00 | 610.82 | 610.82 | 1905.39 | 1905.39 | 20.50 | - |
| 13496 | TR | 3000.00 | 3000.00 | 696.38 | 696.38 | 894.81 | 894.81 | 20.50 | - |

#### Tour 5768 — 1NB+1SB — 6d — HUGO GAYTAN SARABIA / T173

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13494 | NB | 3800.00 | 3800.00 | 562.46 | 562.46 | 1822.00 | 1822.00 | 0.00 | - |
| 13500 | SB | 3500.00 | 3500.00 | 665.64 | 665.64 | 1243.66 | 1243.66 | 15.25 | - |

Deadhead on SB (home to Laredo): 13500=166.8 mi

#### Tour 5769 — 1NB+1SB — 7d — Angel Alfonso Sosa Perez / T156

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13498 | NB | 3800.00 | MISSING | 568.76 | - | 0.00 | - | - | - |
| 13508 | SB | 2500.00 | 2500.00 | 586.76 | 586.76 | 1346.06 | 1346.06 | 1346.06 | FAC-2026-00001(inv3) |

Deadhead on SB (home to Laredo): 13508=19.9 mi

#### Tour 5770 — 1NB+1SB — 6d — Neftali Coronado Urbano / T176

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13503 | NB | 4900.00 | MISSING | 947.15 | - | 1770.91 | - | - | - |
| 13509 | SB | 4400.00 | MISSING | 960.35 | - | 1555.84 | - | - | - |

Deadhead on SB (home to Laredo): 13509=107.4 mi

#### Tour 5771 — 1NB+1TR — 7d — Jorge Luis Infante Corona / T177

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13504 | NB | 4900.00 | MISSING | 945.10 | - | 1713.50 | - | - | - |
| 13510 | TR | 3000.00 | 3000.00 | 964.00 | 964.00 | 1610.50 | 1610.50 | 1528.80 | FAC-2026-00002(inv2) |

#### Tour 5772 — 1NB+2TR+1SB — 10d — PEDRO ABRAHAM LOPEZ COLLADO / T152

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13502 | NB | 3800.00 | MISSING | 485.87 | - | 1139.30 | - | - | - |
| 13507 | TR | 1200.00 | MISSING | 228.56 | - | 449.47 | - | - | - |
| 13512 | TR | 1700.00 | 1700.00 | 422.46 | 422.46 | 1066.44 | 1066.44 | 1133.66 | FAC-2026-00004(inv4) |
| 13513 | SB | 525.00 | MISSING | 244.94 | - | 908.60 | - | - | - |

Deadhead on SB (home to Laredo): 13513=108.2 mi

#### Tour 5773 — 1NB+1TR — 40d — Concepcion Cordova Dominguez / T163

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13497 | NB | 7200.00 | MISSING | 939.87 | - | 2184.88 | - | - | - |
| 13511 | TR | 3600.00 | 3600.00 | 957.65 | 957.65 | 1817.91 | 1817.91 | 1697.66 | FAC-2026-00003(inv1) |

#### Tour 5774 — 1NB+1SB — 7d — JOSE ANTONIO VICENTE MARTINEZ / T171

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13517 | NB | 3800.00 | MISSING | 471.97 | - | 1556.91 | - | - | - |
| 13518 | SB | 4000.00 | 4000.00 | 579.98 | 579.98 | 1018.96 | 1018.96 | 2219.23 | FAC-2026-00011(inv12) |

Deadhead on SB (home to Laredo): 13518=134 mi

#### Tour 5775 — 2TR+1SB — 10d — ALFONSO HIDALGO CHAVEZ / T164

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13506 | TR | 3900.00 | MISSING | 581.58 | - | 1100.82 | - | - | - |
| 13514 | TR | 2700.00 | 2700.00 | 552.83 | 552.83 | 1826.41 | 1826.41 | 1929.49 | FAC-2026-00005(inv5) |
| 13516 | SB | 700.00 | 700.00 | 169.74 | 169.74 | 417.11 | 417.11 | 344.53 | FAC-2026-00008(inv11) |

Deadhead on SB (home to Laredo): 13516=25.6 mi

#### Tour 5776 — 1NB+1TR+1SB — 11d — Leonel Antonio Morales / T147

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13505 | NB | 3900.00 | MISSING | 581.58 | - | 1232.84 | - | - | - |
| 13515 | SB | 525.00 | 525.00 | 208.53 | 208.53 | 3178.91 | 3178.91 | 3199.41 | FAC-2026-00009(inv8) |
| 13520 | TR | 2600.00 | 2600.00 | 413.78 | 413.78 | 0.00 | 0.00 | 0.00 | FAC-2026-00006(inv6) |

Deadhead on SB (home to Laredo): 13515=36.6 mi

#### Tour 5777 — 1NB+1TR — 6d — Jorge Luis Infante Corona / T177

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13519 | NB | 4900.00 | 4900.00 | 945.10 | 945.10 | 1839.06 | 1839.06 | 1839.06 | FAC-2026-00010(inv13) |
| 13521 | TR | 3500.00 | 3500.00 | 962.90 | 962.90 | 1610.94 | 1610.94 | 1610.94 | FAC-2026-00012(inv14) |

#### Tour 5778 — 1NB+1SB — 10d — HUGO GAYTAN SARABIA / T173

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13524 | SB | 4200.00 | 3800.00 | 853.61 | 853.61 | 3657.90 | 3657.90 | 33.25 | FAC-2026-00043(inv16) |
| 13525 | NB | 0.00 | MISSING | 586.40 | - | 0.00 | - | - | - |

Deadhead on SB (home to Laredo): 13524=711.5 mi

#### Tour 5779 — 1NB+1TR — 6d — LUIS ARMANDO SOSA PEREZ / T170

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13526 | TR | 3500.00 | 3500.00 | 724.51 | 724.51 | 1418.42 | 1418.42 | 1418.42 | FAC-2026-00014(inv19) |
| 13527 | NB | 3000.00 | MISSING | 696.15 | - | 2008.66 | - | - | - |

#### Tour 5780 — 1NB+1SB — 3d — Rafael Rogelio Rivero Reynoso / T148

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13530 | NB | 1500.00 | MISSING | 0.00 | - | 843.76 | - | - | - |
| 13532 | SB | 1000.00 | 1000.00 | 0.00 | 150.00 | 0.00 | 0.00 | 172.00 | FAC-2026-00016(inv20) |

#### Tour 5781 — 1NB+1SB — 6d — Leonel Antonio Morales / T175

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13523 | NB | 3600.00 | 3600.00 | 627.89 | 627.89 | 1366.68 | 1366.68 | 0.00 | FAC-2026-00042(inv15) |
| 13534 | SB | 3100.00 | 3100.00 | 652.42 | 652.42 | 1092.80 | 1092.80 | 1435.22 | FAC-2026-00018(inv22) |

Deadhead on SB (home to Laredo): 13534=58.1 mi

#### Tour 5782 — 1NB+1SB — 7d — HUGO GAYTAN SARABIA / T173

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13529 | NB | 3900.00 | 3900.00 | 728.51 | 728.51 | 1477.89 | 1477.89 | 0.00 | FAC-2026-00044(inv18) |
| 13540 | SB | 3120.00 | MISSING | 760.60 | - | 1913.82 | - | - | - |

Deadhead on SB (home to Laredo): 13540=178.5 mi

#### Tour 5783 — 1NB+1TR — 7d — Jorge Luis Infante Corona / T177

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13535 | NB | 4900.00 | 4900.00 | 945.10 | 945.10 | 1875.13 | 1875.13 | 1956.58 | FAC-2026-00015(inv23) |
| 13537 | TR | 3300.00 | 3300.00 | 961.15 | 961.15 | 1786.26 | 1786.26 | 1704.81 | FAC-2026-00019(inv21) |

#### Tour 5784 — 1NB+2TR — 9d — JOSE ANTONIO VICENTE MARTINEZ / T171

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13522 | NB | 3500.00 | MISSING | 567.17 | - | 1821.39 | - | - | - |
| 13528 | TR | 3100.00 | 3100.00 | 285.39 | 285.39 | 1945.84 | 1945.84 | 1945.84 | FAC-2026-00013(inv17) |
| 13536 | TR | 4000.00 | 4000.00 | 810.38 | 810.38 | 1973.72 | 1973.72 | 1950.91 | FAC-2026-00017(inv24) |

#### Tour 5785 — 1NB+2TR — 9d — Genaro Guerrero Chavez / T152

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13531 | NB | 4300.00 | MISSING | 666.81 | - | 2044.50 | - | - | - |
| 13538 | TR | 800.00 | 800.00 | 309.61 | 309.61 | 1047.95 | 1047.95 | 1114.13 | FAC-2026-00020(inv25) |
| 13543 | TR | 2500.00 | 2500.00 | 547.25 | 547.25 | 1613.29 | 1613.29 | 1536.51 | FAC-2026-00022(inv27) |

#### Tour 5786 — 1NB+1SB — 7d — Concepcion Cordova Dominguez / T163

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13533 | NB | 3450.00 | MISSING | 500.22 | - | 1263.58 | - | - | - |
| 13548 | SB | 2300.00 | 2300.00 | 538.83 | 538.83 | 1215.55 | 1215.55 | 1154.66 | FAC-2026-00023(inv33) |

Deadhead on SB (home to Laredo): 13548=154 mi

#### Tour 5787 — 1NB+1TR — 9d — ALFONSO HIDALGO CHAVEZ / T164

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13549 | TR | 1000.00 | 1000.00 | 569.57 | 569.57 | 736.59 | 736.59 | 736.59 | FAC-2026-00027(inv34) |
| 13555 | NB | 3180.00 | 3180.00 | 431.15 | 431.15 | 1328.21 | 1328.21 | 65.95 | - |

#### Tour 5788 — 1NB+1TR+1SB — 11d — Angel Alfonso Sosa Perez / T156

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13539 | NB | 4860.00 | MISSING | 670.68 | - | 2133.52 | - | - | - |
| 13546 | TR | 1100.00 | 1100.00 | 369.86 | 369.86 | 771.84 | 1396.44 | 1396.44 | FAC-2026-00026(inv31) |
| 13552 | SB | 3000.00 | 3000.00 | 685.35 | 685.35 | 1141.30 | 1298.02 | 1235.99 | FAC-2026-00033(inv38) |

Deadhead on SB (home to Laredo): 13552=173.8 mi

#### Tour 5789 — 1TR — 4d — Jorge Luis Infante Corona / T177

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13557 | TR | 3900.00 | 3900.00 | 980.75 | 980.75 | 2002.01 | 2002.01 | 0.00 | FAC-2026-00046(inv40) |

#### Tour 5790 — 1TR — 5d — Leonel Antonio Morales / T175

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13554 | TR | 0.00 | 3500.00 | 761.70 | 761.70 | 2106.71 | 2106.71 | 20.80 | FAC-2026-00045(inv39) |

#### Tour 5794 — 1NB — 3d — JOSE ANTONIO VICENTE MARTINEZ / T171

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13558 | NB | 3500.00 | 3500.00 | 564.42 | 564.42 | 1394.72 | 1394.72 | 1447.16 | FAC-2026-00032(inv41) |

#### Tour 5795 — 1NB+1SB — 4d — LUIS ARMANDO SOSA PEREZ / T170

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13561 | NB | 3450.00 | 3450.00 | 500.22 | 500.22 | 1074.62 | 1074.62 | 1619.76 | FAC-2026-00034(inv44) |
| 13567 | SB | 2100.00 | MISSING | 550.81 | - | 1681.76 | - | - | - |

Deadhead on SB (home to Laredo): 13567=59.1 mi

#### Tour 5796 — 1LOCAL — 3d — JOSE ANTONIO VICENTE MARTINEZ / T171

| Load | Leg | Ctrl LH | Live inv | Ctrl pay | Live bill | Ctrl fuel | Live fuel | Exp | FA |
|---|---|---|---|---|---|---|---|---|---|
| 13541 | LOCAL | 2500.00 | MISSING | 379.73 | - | 0.00 | - | - | - |

## Faro purchase days

| Day | Inv | Purchase live/ctrl | Net live/ctrl | Tie |
|---|---|---|---|---|
| 2026-08-10 | 2,3 | 5500/5500 | 5325/5325 | TIE |
| 2026-08-11 | 1 | 3600/3600 | 3482/3482 | TIE |
| 2026-08-12 | 4 | 1700/1700 | 1639/1639 | TIE |
| 2026-08-13 | 5,6,7 | 5650/5650 | 5470.5/5470.5 | TIE |
| 2026-08-14 | 8,11,12,13 | 10125/10125 | 9811.24/9811.24 | TIE |
| 2026-08-17 | 14,15 | 7100/7100 | 6877/6877 | TIE |
| 2026-08-18 | 16 | 3800/3800 | 3676/3676 | TIE |
| 2026-08-19 | 17,19 | 6600/6600 | 6392/6392 | TIE |
| 2026-08-21 | 18,20,22,23,24 | 16900/16900 | 16383/16383 | TIE |
| 2026-08-24 | 21,25 | 4100/4100 | 3967/3967 | TIE |
| 2026-08-26 | 27,28 | 3100/3100 | 2997/2997 | TIE |
| 2026-08-28 | 29,30,31,32,33,34,35,36 | 26900/26900 | 26083/26083 | TIE |
| 2026-08-31 | 38,39,40,41 | 13900/13900 | 13473/13473 | TIE |

## Partial / open invoices

| Load | Invoice | Total | Open | Paid |
|---|---|---|---|---|
| 13535 | 13535 | 4900.00 | 4900.00 | 0.00 |
| 13519 | 13519 | 4900.00 | 4900.00 | 0.00 |
| 13487 | 13487 | 4900.00 | 4900.00 | 0.00 |
| 13482 | 13482 | 4100.00 | 4100.00 | 0.00 |
| 13495 | 13495 | 4100.00 | 4100.00 | 0.00 |
| 13536 | 13536 | 4000.00 | 4000.00 | 0.00 |
| 13493 | 13493 | 4000.00 | 4000.00 | 0.00 |
| 13518 | 13518 | 4000.00 | 4000.00 | 0.00 |
| 13481 | 13481 | 3920.00 | 3920.00 | 0.00 |
| 13557 | 13557 | 3900.00 | 3900.00 | 0.00 |
| 13529 | 13529 | 3900.00 | 3900.00 | 0.00 |
| 13494 | 13494 | 3800.00 | 3800.00 | 0.00 |
| 13524 | 13524 | 3800.00 | 3800.00 | 0.00 |
| 13523 | 13523 | 3600.00 | 3600.00 | 0.00 |
| 13511 | 13511 | 3600.00 | 3600.00 | 0.00 |
| 13554 | 13554 | 3500.00 | 3500.00 | 0.00 |
| 13521 | 13521 | 3500.00 | 3500.00 | 0.00 |
| 13526 | 13526 | 3500.00 | 3500.00 | 0.00 |
| 13500 | 13500 | 3500.00 | 3500.00 | 0.00 |
| 13558 | 13558 | 3500.00 | 3500.00 | 0.00 |
| 13561 | 13561 | 3450.00 | 3450.00 | 0.00 |
| 13537 | 13537 | 3300.00 | 3300.00 | 0.00 |
| 13555 | 13555 | 3180.00 | 3180.00 | 0.00 |
| 13528 | 13528 | 3100.00 | 3100.00 | 0.00 |
| 13534 | 13534 | 3100.00 | 3100.00 | 0.00 |
| 13552 | 13552 | 3000.00 | 3000.00 | 0.00 |
| 13510 | 13510 | 3000.00 | 3000.00 | 0.00 |
| 13496 | 13496 | 3000.00 | 3000.00 | 0.00 |
| 13489 | 13489 | 2800.00 | 2800.00 | 0.00 |
| 13514 | 13514 | 2700.00 | 2700.00 | 0.00 |
| 13520 | 13520 | 2600.00 | 2600.00 | 0.00 |
| 13543 | 13543 | 2500.00 | 2500.00 | 0.00 |
| 13508 | 13508 | 2500.00 | 2500.00 | 0.00 |
| 13548 | 13548 | 2300.00 | 2300.00 | 0.00 |
| 13485 | 13485 | 2039.00 | 2039.00 | 0.00 |
| 13512 | 13512 | 1700.00 | 1700.00 | 0.00 |
| 13501 | 13501 | 1500.00 | 1500.00 | 0.00 |
| 13546 | 13546 | 1100.00 | 1100.00 | 0.00 |
| 13549 | 13549 | 1000.00 | 1000.00 | 0.00 |
| 13532 | 13532 | 1000.00 | 1000.00 | 0.00 |
| 13538 | 13538 | 800.00 | 800.00 | 0.00 |
| 13516 | 13516 | 700.00 | 700.00 | 0.00 |
| 13515 | 13515 | 525.00 | 525.00 | 0.00 |

## Vendors on Aug-scope load expenses

| Vendor | Rows | Amount |
|---|---|---|
| LOVES | 109 | 36409.03 |
| FLYING | 2 | 1133.66 |
| PALOS GARZA | 1 | 124.80 |
| SR FORWARDING,INC | 1 | 120.00 |
| Blue Beacon Truck Wash | 2 | 94.13 |
| TEN STAR TRUCKWASH | 1 | 52.00 |
| FRONTIER TRUCK WASH | 1 | 42.23 |
| INDIANA TOLL ROAD | 3 | 41.75 |
| PILOT | 1 | 24.88 |
| DTOPS | 1 | 20.80 |

## GL accounts (entry_date in August)

| Acct | Name | Type | Lines | Debit | Credit |
|---|---|---|---|---|---|
| 1090 | Undeposited Funds | Asset | 130 | 113256.44 | 34920.87 |
| 1100 | Accounts Receivable (A/R) | Asset | 51 | 152744.00 | 0.00 |
| 1150 | Unbilled Revenue | Asset | 102 | 152744.00 | 152744.00 |
| 1230 | Factoring Reserves | Asset | 38 | 1632.41 | 52.50 |
| 2000 | Accounts Payable (A/P) | Liability | 4 | 0.00 | 139.30 |
| 2150 | Factoring Advance | Liability | 38 | 3500.00 | 109375.00 |
| 4000 | Freight / Line-haul Income | Income | 51 | 0.00 | 152744.00 |
| 5000 | Fuel & Diesel | CostOfGoodsSold | 92 | 31483.37 | 7250.20 |
| 6300 | Bank Service Charges & Wire Fees | Expense | 1 | 10.00 | 0.00 |
| 6400 | Factoring Fees | Expense | 38 | 1726.35 | 10.00 |
| 9000 | Ask My Accountant | Expense | 4 | 139.30 | 0.00 |

## Linkage

- Tour identity = AlwaysTrack 4-digit `source_document_ref` / settlement_control `company_doc`.
- Duration = stop-date span of the tour's loads (usually ~7d; longer when TR legs extend).
- Legs: NB/TR/SB/LOCAL derived from Laredo pickup/delivery (or live `trip_type`).
- Bill per load → ONE settlement (blueprint §3). Faro FA → invoice → load.
- Tables: loads, load_stops, invoices, factoring_advances, driver_bills, fuel_transactions, expenses, journal_entries + journal_entry_postings, accounts, vendors.

JSON twin: `docs/recon/AUGUST-2026-TRUE-RECON.json`
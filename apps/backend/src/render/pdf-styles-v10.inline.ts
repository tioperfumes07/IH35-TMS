/** LOCKED v10 print styles — from claude/00-LOCKED-DOCUMENT-DESIGNS-v10-DO-NOT-ALTER.html. Do not invent a new scale. */
export const PDF_V10_STYLES = `/* LOCKED v10 print styles — extracted from claude/00-LOCKED-DOCUMENT-DESIGNS-v10-DO-NOT-ALTER.html */
@import url("https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap");

  /* Paper specimens. The review page follows the viewer's theme; the sheets themselves stay
     white with black ink in both themes, because that is what comes out of the printer. */
  :root{
    --ground:#E8E6E1; --ink:#151A21; --ink-2:#4A545F; --ink-3:#7C8794;
    --rule:#D4D0C8; --steel:#1F3A5F; --chip:#F2F0EC;
    --f-head:"IBM Plex Sans Condensed",-apple-system,"Segoe UI",sans-serif;
    --f-body:"IBM Plex Sans",-apple-system,"Segoe UI",sans-serif;
    --f-num:"IBM Plex Mono",ui-monospace,"SF Mono",Menlo,monospace;
  }

  *{box-sizing:border-box}
  body{background:#E8E6E1;color:#151A21;font-family:var(--f-body);margin:0}
  .wrap{max-width:1180px;margin:0 auto;padding-inline:16px;padding-block:28px 64px}

  .masthead{border-bottom:2px solid var(--ink);padding-bottom:14px}
  .masthead h1{font-family:var(--f-head);font-size:clamp(22px,4.4vw,32px);font-weight:700;
    letter-spacing:-.01em;margin:0 0 6px;text-wrap:balance}
  .masthead p{margin:0;color:var(--ink-2);font-size:14px;max-width:66ch}
  .meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .tag{font-family:var(--f-num);font-size:11px;letter-spacing:.04em;background:var(--chip);
    border:1px solid var(--rule);padding:4px 9px;color:var(--ink-2)}
  .changed{border-left:3px solid var(--steel);padding-left:9px;margin:10px 0 0;
    font-size:12.5px;color:var(--ink-2)}

  .sectionhead{font-family:var(--f-head);font-size:13px;font-weight:700;letter-spacing:.14em;
    text-transform:uppercase;color:var(--ink-3);margin:42px 0 0;padding-bottom:8px;
    border-bottom:1px solid var(--rule)}
  .orient{display:flex;flex-wrap:wrap;align-items:baseline;gap:10px;margin:24px 0 9px}
  .orient .n{font-family:var(--f-num);font-size:11px;font-weight:600;color:#fff;
    background:#1F3A5F;padding:3px 8px;letter-spacing:.04em}
  .orient h3{font-family:var(--f-head);font-size:17px;font-weight:700;margin:0}
  .orient .why{flex:1 1 260px;min-width:0;color:var(--ink-2);font-size:13px}

  /* ---- the printed sheet: fixed paper colours in both themes ---- */
  .sheet{--paper:#FFFFFF; --pink:#151A21; --pink-2:#4A545F; --pink-3:#7C8794;
    --prule:#D4D0C8; --prule-2:#EBE8E3; --psteel:#1F3A5F; --prust:#9B3A2B; --pmoss:#2F5D3A;
    --pchip:#F2F0EC; color-scheme:light;
    background:var(--paper);color:var(--pink);border:1px solid var(--rule);padding:20px;
    overflow-x:auto;box-shadow:0 1px 0 rgba(0,0,0,.05)}
  .sheet.portrait{max-width:1000px}
  @media(max-width:520px){.sheet{padding:13px}}

  .num{font-family:var(--f-num);font-variant-numeric:tabular-nums}
  .sheet td.num,.sheet .subtot td.r,.sheet .marginrow td.r{white-space:nowrap}
  .unit{font-family:var(--f-num)}
  .neg{color:var(--prust)} .pos{color:var(--pmoss)}

  .dochead{display:flex;flex-wrap:wrap;gap:16px;justify-content:space-between;align-items:flex-start;
    border-bottom:2px solid var(--pink);padding-bottom:11px}
  .brand{display:flex;align-items:center;gap:12px;min-width:0}
  .brand img{width:168px;height:auto;display:block;flex:none}
  @media(max-width:520px){.brand img{width:132px}}
  .carrier{font-family:var(--f-head);font-size:15px;font-weight:700;letter-spacing:.02em}
  .sub{font-size:11.5px;color:var(--pink-2);margin-top:2px}
  .docno{text-align:right;min-width:0}
  .docno .lab{font-family:var(--f-head);font-size:9.5px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--pink-3)}
  .docno .val{font-family:var(--f-num);font-size:19px;font-weight:600;line-height:1.15}

  .headbar{display:flex;flex-wrap:wrap;gap:0;border:1px solid var(--prule);
    border-left:none;border-right:none;margin-top:10px}
  .headbar .f{flex:1 1 150px;min-width:0;padding:8px 12px;border-left:1px solid var(--prule)}
  .headbar .f:first-child{border-left:none;padding-left:0}
  .headbar .f .k{display:block;font-family:var(--f-head);font-size:9.5px;letter-spacing:.16em;
    text-transform:uppercase;color:var(--pink-3);margin-bottom:2px}
  .headbar .f .v{font-family:var(--f-num);font-size:14px;font-weight:600}
  .headbar .f .v.t{font-family:var(--f-head);letter-spacing:.02em;font-size:13.5px}

  .sheet table{width:100%;border-collapse:collapse;font-size:12px}
  .sheet table.tight{font-size:11px}
  .sheet table.tight td{padding:4px 6px}
  .sheet table.tight th{padding:6px}
  .loc{display:block;font-size:10.5px;color:var(--pink-3);margin-top:1px}
  .typ{font-family:var(--f-head);font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;
    color:var(--pink-2)}
  .typ.e{color:var(--prust)}
  .est{border:1px dashed var(--psteel);background:#F4F7FB;padding:12px 14px;margin-top:12px}
  .invhead{display:flex;flex-wrap:wrap;gap:20px;justify-content:space-between;align-items:flex-start}
  .invtitle{font-family:var(--f-head);font-size:30px;font-weight:700;letter-spacing:.06em;
    line-height:1;color:var(--pink);text-align:right}
  .invmeta{margin-top:8px;display:grid;grid-template-columns:auto auto;gap:2px 14px;
    font-size:11.5px;text-align:right;justify-content:end}
  .invmeta .k{color:var(--pink-3);font-family:var(--f-head);font-size:9.5px;letter-spacing:.12em;
    text-transform:uppercase;align-self:center}
  .invmeta .v{font-family:var(--f-num);font-weight:600}
  .totstack{margin-top:12px;display:flex;justify-content:flex-end}
  .totstack table{width:auto;min-width:290px}
  .totstack td{padding:5px 8px;border-bottom:1px solid var(--prule-2)}
  .totstack td:first-child{color:var(--pink-2)}
  .totstack tr.bal td{border-top:1.5px solid var(--pink);border-bottom:2px solid var(--pink);
    font-family:var(--f-head);font-weight:700;letter-spacing:.04em;font-size:13px;padding-top:8px}
  .totstack tr.bal td.r{font-family:var(--f-num);font-size:15px;letter-spacing:0}
  .party{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:22px}
  @media(max-width:620px){.party{grid-template-columns:1fr}}
  .party h5{font-family:var(--f-head);font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;
    color:var(--pink-3);margin:0 0 4px;padding-bottom:3px;border-bottom:1px solid var(--prule)}
  .party .nm{font-weight:600;font-size:13px}
  .party p{margin:2px 0 0;font-size:11.5px;color:var(--pink-2);line-height:1.5}
  .appr{display:block;font-size:10.5px;color:var(--psteel);margin-top:2px}
  .est h4{font-family:var(--f-head);font-size:11px;letter-spacing:.13em;text-transform:uppercase;
    margin:0 0 3px;color:var(--psteel)}
  .est p{margin:0 0 9px;font-size:11.5px;color:var(--pink-2)}
  .sheet th{font-family:var(--f-head);font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;
    color:var(--pink-3);text-align:left;font-weight:600;padding:7px;border-bottom:1px solid var(--prule)}
  .sheet td{padding:5px 7px;border-bottom:1px solid var(--prule-2);vertical-align:top}
  .r{text-align:right}
  .loadrow td{background:var(--pchip);font-family:var(--f-head);font-weight:600;
    letter-spacing:.03em;font-size:11.5px}
  .sheet tfoot td{border-top:1px solid var(--prule);border-bottom:none;font-weight:600;padding-top:8px}
  .blockhead th{color:var(--psteel);border-bottom:1px solid var(--psteel);font-size:10.5px;
    letter-spacing:.13em;padding-top:2px}
  .netrow td{border-top:1.5px solid var(--pink);border-bottom:none;font-weight:600;
    font-family:var(--f-head);letter-spacing:.03em;font-size:12.5px;padding-top:8px}

  .loadblock{border:1px solid var(--prule);padding:11px 12px 12px;margin-top:13px}
  .loadblock > .lbhead{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;
    align-items:baseline;border-bottom:1.5px solid var(--pink);padding-bottom:6px}
  .lbhead b{font-family:var(--f-head);font-size:13.5px;letter-spacing:.03em}
  .lbhead .eq{font-family:var(--f-num);font-size:10.5px;color:var(--pink-3)}

  .totalbar{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:baseline;
    margin-top:14px;border-top:2px solid var(--pink);padding-top:10px}
  .totalbar .lab{font-family:var(--f-head);font-size:11px;letter-spacing:.14em;
    text-transform:uppercase;color:var(--pink-2)}
  .totalbar .val{font-family:var(--f-num);font-size:13px;font-weight:600}
  .totalbar .val b{font-weight:600}
  .strip{display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:space-between;align-items:baseline;
    margin-top:12px;border-top:2px solid var(--pink);padding-top:9px;font-size:11.5px;
    color:var(--pink-2)}
  .strip .set{display:flex;flex-wrap:wrap;gap:6px 16px;min-width:0}
  .strip .k{color:var(--pink-3);font-family:var(--f-head);font-size:9.5px;letter-spacing:.11em;
    text-transform:uppercase;margin-right:4px}
  .strip .m{font-family:var(--f-head);font-size:10px;letter-spacing:.12em;text-transform:uppercase;
    color:var(--pink-2)}
  .strip .mv{font-family:var(--f-num);font-size:13px;font-weight:600;margin-left:7px}

  /* section subtotal rows — rule above, bold, no fill (fill is reserved for margin) */
  .subtot td{border-top:1px solid var(--prule);border-bottom:none;font-weight:600;
    font-family:var(--f-head);letter-spacing:.03em;font-size:11.5px;padding:7px;
    color:var(--pink-2)}
  .subtot td.r{font-family:var(--f-num);letter-spacing:0;color:var(--pink)}
  .subtot + tr td{padding-top:11px}
  .sheet td.dim{color:var(--pink-3)}

  /* highlighted margin / net rows */
  .marginrow td{background:#EEF2F7;border-top:1.5px solid var(--psteel);border-bottom:none;
    font-weight:600;font-family:var(--f-head);letter-spacing:.03em;font-size:12.5px;padding:8px 7px}
  .marginrow td.r{font-family:var(--f-num);letter-spacing:0}
  .marginrow td:first-child{box-shadow:inset 3px 0 0 var(--psteel)}
  .cardtot.hl{background:#EEF2F7;border-top:1.5px solid var(--psteel);padding:7px 8px;
    margin:5px -12px -12px;box-shadow:inset 3px 0 0 var(--psteel)}

  .cards{display:grid;gap:11px;grid-template-columns:repeat(auto-fit,minmax(280px,1fr))}
  .card{border:1px solid var(--prule);padding:12px;min-width:0}
  .card .hd{display:flex;justify-content:space-between;align-items:baseline;gap:8px;
    border-bottom:1px solid var(--prule);padding-bottom:6px;margin-bottom:8px}
  .card .hd b{font-family:var(--f-head);font-size:13px;letter-spacing:.03em}
  .card .hd .eq{font-family:var(--f-num);font-size:10.5px;color:var(--pink-3)}
  .leg{display:grid;grid-template-columns:auto 1fr auto;gap:4px 8px;font-size:11px;
    color:var(--pink-2);margin-bottom:8px}
  .leg .t{font-family:var(--f-head);font-size:9.5px;letter-spacing:.09em;text-transform:uppercase;
    color:var(--pink-3)}
  .mini{font-family:var(--f-head);font-size:9.5px;letter-spacing:.11em;text-transform:uppercase;
    color:var(--psteel);border-bottom:1px solid var(--psteel);padding-bottom:3px;margin:9px 0 4px}
  .kv{display:flex;justify-content:space-between;gap:12px;font-size:12px;padding:4px 0;
    border-bottom:1px solid var(--prule-2)}
  .kv span:first-child{color:var(--pink-2)}
  .cardtot{display:flex;justify-content:space-between;border-top:1.5px solid var(--pink);
    padding-top:6px;margin-top:4px;font-size:12.5px}

  .ref{font-size:10.5px;color:var(--pink-3);display:block;margin-top:1px}
  .note{margin-top:8px;font-size:11.5px;color:var(--pink-3)}
  .pagenote{margin-top:14px;font-size:12px;color:var(--ink-3)}
  .pagenote b{color:var(--ink-2)}
  .foot{margin-top:38px;border-top:1px solid var(--rule);padding-top:14px;
    color:var(--ink-3);font-size:12.5px}
  .foot b{color:var(--ink-2)}

.scene { padding: 20px 16px 40px; }
.sheet { margin: 0 auto; max-width: 1000px; }
.dim { color: var(--pink-3); }
.ref { font-size: 10px; color: var(--pink-3); margin-left: 4px; }
.note { font-size: 11px; color: var(--pink-2); margin-top: 10px; }
.appr { display:block; font-size:10.5px; color:var(--psteel); margin-top:2px; }
@media print {
  body { background: #fff; }
  .scene { padding: 0; }
  .sheet { border: none; box-shadow: none; max-width: none; }
}
`;

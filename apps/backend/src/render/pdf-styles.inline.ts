export const PDF_BASE_STYLES = `* { box-sizing: border-box; }
html, body {
  margin: 0; padding: 0;
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;
  font-size: 10.5px;
  line-height: 1.45;
  color: #1a1a1a;
  background: #e8e8e6;
  font-feature-settings: 'tnum';
  -webkit-font-smoothing: antialiased;
}
.scene { padding: 20px 16px 40px; }

.toc {
  max-width: 800px;
  margin: 0 auto 18px;
  font-size: 9.5px;
  color: #555;
  text-align: center;
  letter-spacing: 0.6px;
  text-transform: uppercase;
}

.doc-page {
  width: 800px;
  max-width: 100%;
  margin: 18px auto;
  background: #ffffff;
  border: 1px solid #d0d0d0;
  padding: 36px 44px 32px;
  position: relative;
}

.doc-head {
  border-bottom: 1px solid #1a1a1a;
  padding-bottom: 12px;
  margin-bottom: 16px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}
.brand-name {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.2px;
}
.brand-sub {
  font-size: 9.5px;
  color: #555;
  margin-top: 1px;
}
.brand-addr {
  font-size: 9px;
  color: #666;
  margin-top: 8px;
  line-height: 1.5;
}
.doc-meta {
  text-align: right;
}
.doc-type {
  font-size: 9px;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: #555;
  font-weight: 500;
}
.doc-num {
  font-family: 'JetBrains Mono', 'SF Mono', Consolas, monospace;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.3px;
  margin-top: 2px;
}
.doc-issued {
  font-size: 9px;
  color: #555;
  margin-top: 6px;
  line-height: 1.5;
}
.doc-status {
  display: inline-block;
  margin-top: 6px;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.4px;
  text-transform: uppercase;
  color: #1a1a1a;
  border-top: 1px solid #1a1a1a;
  padding-top: 4px;
}

.sec-head {
  margin: 14px 0 6px;
  padding-bottom: 3px;
  border-bottom: 1px solid #1a1a1a;
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.sec-head .title {
  font-size: 9.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.8px;
}
.sec-head .right {
  margin-left: auto;
  font-size: 9px;
  color: #555;
  font-weight: 400;
  text-transform: none;
  letter-spacing: 0;
}

.lv-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px 18px;
  padding: 2px 0 4px;
}
.lv-grid.cols-3 { grid-template-columns: repeat(3, 1fr); }
.lv-grid.cols-2 { grid-template-columns: repeat(2, 1fr); }
.lv { min-width: 0; }
.lv .lbl {
  font-size: 8.5px;
  font-weight: 500;
  color: #777;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 1px;
}
.lv .val {
  font-size: 10.5px;
  color: #1a1a1a;
  font-weight: 500;
  line-height: 1.4;
  word-break: break-word;
}
.lv .sub {
  font-size: 9px;
  color: #666;
  margin-top: 1px;
  font-weight: 400;
  line-height: 1.4;
}
.lv .val.mono,
.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
}
.lv .val.amt,
.amt {
  font-family: 'JetBrains Mono', monospace;
  font-feature-settings: 'tnum';
  font-weight: 500;
}

.stop-block {
  border: 1px solid #d0d0d0;
  padding: 8px 10px 10px;
  margin-bottom: 8px;
}
.stop-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding-bottom: 6px;
  margin-bottom: 6px;
  border-bottom: 1px solid #e5e5e5;
  font-size: 10px;
}
.stop-header .seq {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.6px;
}
.stop-header .ref {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
  color: #555;
}
.stop-header .when {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
  margin: 4px 0;
}
.data-table th,
.data-table td {
  padding: 5px 8px;
  text-align: left;
  border-bottom: 1px solid #e5e5e5;
  vertical-align: top;
}
.data-table th {
  font-weight: 600;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #555;
  border-bottom: 1px solid #1a1a1a;
}
.data-table td.num,
.data-table th.num {
  text-align: right;
  font-feature-settings: 'tnum';
  font-family: 'JetBrains Mono', monospace;
}
.data-table td.mono {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9.5px;
}
.data-table tfoot td {
  border-top: 1px solid #1a1a1a;
  border-bottom: none;
  font-weight: 600;
  font-size: 10.5px;
  padding: 6px 8px;
}
.data-table tr.subtotal td {
  font-weight: 600;
}

.instruction-block {
  margin: 6px 0 4px;
  padding: 10px 12px;
  border: 1px solid #1a1a1a;
  font-size: 10px;
  line-height: 1.55;
}
.instruction-block .ib-from {
  font-size: 8.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #555;
  margin-bottom: 4px;
}

.adj-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10px;
  margin-top: 4px;
}
.adj-table th,
.adj-table td {
  padding: 4px 8px;
  text-align: left;
  border-bottom: 1px solid #e5e5e5;
}
.adj-table th {
  font-weight: 600;
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #555;
}
.adj-table td.num {
  text-align: right;
  font-family: 'JetBrains Mono', monospace;
}

.signoff {
  margin: 22px 0 0;
  padding-top: 14px;
  border-top: 1px solid #1a1a1a;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 36px;
}
.sig-block .sig-label-top {
  font-size: 8.5px;
  text-transform: uppercase;
  color: #555;
  letter-spacing: 0.6px;
  font-weight: 600;
}
.sig-block .sig-line {
  border-bottom: 1px solid #1a1a1a;
  margin-top: 28px;
}
.sig-block .sig-name {
  font-size: 9.5px;
  margin-top: 3px;
  color: #1a1a1a;
}
.sig-block .sig-note {
  font-size: 8.5px;
  color: #666;
  margin-top: 2px;
}

.total-line {
  margin: 14px 0 6px;
  padding-top: 8px;
  border-top: 2px solid #1a1a1a;
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: baseline;
  gap: 12px;
}
.total-line .lbl {
  font-size: 9.5px;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  font-weight: 600;
}
.total-line .sub {
  font-size: 8.5px;
  color: #666;
  margin-top: 2px;
  letter-spacing: 0;
  text-transform: none;
  font-weight: 400;
}
.total-line .amt {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 600;
  font-feature-settings: 'tnum';
}

.doc-footer {
  margin-top: 18px;
  padding-top: 10px;
  border-top: 1px solid #d0d0d0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
  font-size: 8.5px;
  color: #666;
  line-height: 1.55;
}
.doc-footer .fl-label {
  font-size: 8.5px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #1a1a1a;
  margin-bottom: 2px;
}
.doc-footer p { margin: 0; }

.muted { color: #666; }

@media print {
  body { background: white; }
  .toc { display: none; }
  .doc-page {
    border: none;
    margin: 0;
    padding: 24px 28px;
    page-break-after: always;
  }
  .doc-page:last-child { page-break-after: auto; }
}
`;

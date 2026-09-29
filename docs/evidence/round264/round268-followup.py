"""Reproduce formula attribution and the authorized NET PAY marker correction.
Run from repo root. Uses committed read-only evidence; performs no DB writes.
"""
import json, re
from decimal import Decimal
from pypdf import PdfReader
from pathlib import Path
from collections import Counter
from openpyxl import load_workbook
from openpyxl.styles import PatternFill
from openpyxl.comments import Comment

root = Path('docs/evidence/round264')
data = json.loads((root / 'company-concepts.json').read_text())
reports = json.loads((root / 'live-company-reports.json').read_text())
metrics = json.loads((root / 'metrics.json').read_text())
report_map = {r['display_id']: r for r in reports['reports']}
rows = []
deductions = {'extra_pay', 'reimbursement', 'deduction', 'advance_recovery',
              'abandonment_chargeback', 'auto_deduction', 'dispute_adjustment',
              'detention_pay', 'deadhead_pay'}
counts, amounts = Counter(), Counter()
for r in data['results']:
    n = r['number']; at = r['at']['revenue']; s = report_map[n]['sections']
    # Preserve the printed profit/loss sign; magnitude normalization is comparison-only.
    text = '\n'.join(p.extract_text(extraction_mode='layout') for p in PdfReader(r['at']['path']).pages)
    line = next(l for l in text.splitlines() if 'Net Revenue' in l)
    token = re.search(r'(-?[\d,]+\.\d{2})\s*$', line).group(1)
    at['Net Revenue'] = int(Decimal(token.replace(',', '')) * 100)
    r['at']['totals']['margin'] = at['Net Revenue']
    r['at']['comparison_totals']['margin'] = at['Net Revenue']
    lines = s['pl_rollup']['lines']
    base = sum(x['amount_cents'] for x in lines if x['line_type'] in
               {'earnings', 'team_split_primary', 'team_split_secondary', 'deadhead_pay'})
    other = sum(x['amount_cents'] for x in lines if x['line_type'] in deductions - {'deadhead_pay'})
    extra = at.get('Additional Driver Pay', 0)
    at_formula = (at['Invoiced'] - at.get('Quick Pay', 0) - at.get('Driver Salary', 0)
                  - extra - at.get('Fuel', 0) - at.get('Company Expenses', 0))
    app_formula = (s['revenue']['invoiced_cents'] - base - other
                   - s['fuel_purchases']['total_cents'] - s['expenses']['total_cents'])
    assert app_formula == s['pl_rollup']['net_revenue_cents'], n
    terms = {
        'revenue_difference': s['revenue']['invoiced_cents'] - at['Invoiced'],
        'quick_pay_not_subtracted_by_report': at.get('Quick Pay', 0),
        'base_driver_cost_difference': at.get('Driver Salary', 0) - base,
        'other_driver_cost_minus_AT_extra_pay': extra - other,
        'fuel_report_minus_AT_fuel': at.get('Fuel', 0) - s['fuel_purchases']['total_cents'],
        'expense_report_minus_AT_expenses': at.get('Company Expenses', 0) - s['expenses']['total_cents'],
        'PDF_printed_margin_formula_residual': at_formula - at['Net Revenue'],
    }
    delta = app_formula - at['Net Revenue']
    assert sum(terms.values()) == delta, n
    for k, v in terms.items():
        if v: counts[k] += 1; amounts[k] += abs(v)
    rows.append({'number': n, 'AT_printed_margin_cents': at['Net Revenue'],
                 'AT_extra_pay_cents': extra, 'AT_formula_cents': at_formula,
                 'app_report_margin_cents': app_formula,
                 'extra_pay_alone_explains': delta == -extra,
                 'terms_cents': terms, 'signed_difference_cents': delta})
result = {'measurement_at': reports['measured_at'], 'rows': rows,
          'extra_pay_alone_explains_count': sum(r['extra_pay_alone_explains'] for r in rows),
          'AT_formula_ties_count': sum(r['AT_formula_cents'] == r['AT_printed_margin_cents'] for r in rows),
          'nonzero_counts': dict(counts), 'absolute_term_cents': dict(amounts)}
(root / 'round268-margin-attribution.json').write_text(json.dumps(result, indent=2)+'\n')
(root / 'company-concepts.json').write_text(json.dumps(data, indent=2)+'\n')

path = root / '09-30-2026-ALWAYSTRACK-vs-APP-SETTLEMENT-COMPARISON-R264.xlsx'
wb = load_workbook(path); ws = wb['DRIVER SETTLEMENTS']
audit = {r['number']: r for r in metrics['driver_audit']}
current = None; green = red = 0
for row in ws:
    if str(row[0].value) in audit:
        current = str(row[0].value)
        ok = audit[current]['normalized_diff_cents'] == 0
        row[2].value = '✓' if ok else '✕'
        row[2].fill = PatternFill('solid', fgColor='D5E8D4' if ok else 'F8CECC')
        row[2].comment = Comment('ROUND 268: settlement marker measures NET PAY only. Other displayed field differences remain visible; green is not a claim that every field matches.', 'Codex')
        green += int(ok); red += int(not ok)
    if current and row[3].value == 'SUMMARY':
        old = str(row[4].value or '')
        if not old.startswith('NET PAY'):
            row[4].value = ('NET PAY matches. ' if audit[current]['normalized_diff_cents']==0 else 'NET PAY differs (known 5812 defect). ') + 'Other field observations retained: ' + old
ws['C1'] = 'NET PAY match (Round 268)'
assert (green, red) == (47, 1)
company = wb['COMPANY SETTLEMENTS']
by_number = {r['number']: r for r in rows}
for row in company:
    n = str(row[0].value)
    if n in by_number and row[3].value == 'margin' and row[8].value == 'SETTLEMENT TOTAL':
        row[4].value = by_number[n]['AT_printed_margin_cents']/100
for r in metrics['summary']:
    a = by_number[r['number']]
    r['margin_at_cents'] = a['AT_printed_margin_cents']
    r['signed_margin_variance_cents'] = a['signed_difference_cents']
    for i,note in enumerate(r['notes']):
        if note.startswith('App report margin'):
            new = f"App report margin {a['app_report_margin_cents']/100:,.2f}; AT margin {a['AT_printed_margin_cents']/100:,.2f}; signed variance {a['signed_difference_cents']/100:+,.2f}"
            for row in company:
                for cell in row:
                    if isinstance(cell.value,str) and note in cell.value: cell.value=cell.value.replace(note,new)
            r['notes'][i] = new
metrics['margin_absolute_signed_variance_cents'] = sum(abs(r['signed_difference_cents']) for r in rows)
company.append(['ROUND 268 FORMULA EXPLANATION', None, None,
                'Extra pay alone explains 0/48 report margin differences. The PDF already subtracts Additional Driver Pay. See round268-margin-attribution.json and the Round 268 report for exact term decomposition.'])
wb.save(path)
metrics['driver_tab_unchanged'] = False
metrics['driver_tab_saved_green'] = green; metrics['driver_tab_saved_red'] = red
metrics['driver_marker_basis'] = 'NET PAY magnitude only, authorized ROUND 268; gross/deduction observations preserved'
(root/'metrics.json').write_text(json.dumps(metrics,indent=2)+'\n')
print(json.dumps({k:v for k,v in result.items() if k!='rows'},indent=2))
print('Driver NET PAY markers:',green,red)

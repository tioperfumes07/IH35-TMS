export async function buildBankingTransactionsXlsx(
  rows: Array<Array<string | number>>
) {
  const ExcelJS = (await import("exceljs")).default;
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Banking Transactions");
  worksheet.addRows(rows);
  for (const column of [3, 4, 5]) {
    worksheet.getColumn(column).numFmt = '$#,##0.00;[Red]-$#,##0.00';
  }
  return workbook.xlsx.writeBuffer();
}

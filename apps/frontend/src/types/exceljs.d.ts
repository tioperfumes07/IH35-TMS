declare module "exceljs" {
  export class Workbook {
    addWorksheet(name: string): WorksheetType;
    xlsx: { writeBuffer(): Promise<Buffer> };
  }
  export interface WorksheetType {
    columns: unknown[];
    addRow(data: unknown): void;
    getRow(index: number): { font: unknown; fill: unknown };
  }
}

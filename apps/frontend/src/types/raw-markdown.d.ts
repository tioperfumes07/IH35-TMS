declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.tsx?raw" {
  const content: string;
  export default content;
}

declare module "*.ts?raw" {
  const content: string;
  export default content;
}

// Lazy-import shim for exceljs (installed at runtime, not as a dev dependency)
declare module "exceljs" {
  const ExcelJS: {
    Workbook: new () => {
      addWorksheet(name: string): {
        addRow(values: unknown[]): void;
        getRow(n: number): { font: { bold: boolean }; commit(): void };
        columns: { width: number }[];
      };
      xlsx: { writeBuffer(): Promise<ArrayBuffer> };
    };
  };
  export default ExcelJS;
}

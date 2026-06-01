declare module 'pdfmake' {
  import type { TDocumentDefinitions } from 'pdfmake/interfaces';

  interface PdfKitDocument {
    on(event: 'data', cb: (chunk: Buffer) => void): void;
    on(event: 'end', cb: () => void): void;
    on(event: 'error', cb: (err: Error) => void): void;
    end(): void;
  }

  type FontSource = Buffer | string;
  interface FontFace {
    normal: FontSource;
    bold?: FontSource;
    italics?: FontSource;
    bolditalics?: FontSource;
  }

  export default class PdfPrinter {
    constructor(fonts: Record<string, FontFace>);
    createPdfKitDocument(docDefinition: TDocumentDefinitions): PdfKitDocument;
  }
}

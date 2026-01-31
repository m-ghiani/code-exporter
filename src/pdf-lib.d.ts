declare module "pdf-lib" {
  export const StandardFonts: {
    Courier: string;
  };

  export class PDFDocument {
    static create(): Promise<PDFDocument>;
    embedFont(name: string): Promise<{ widthOfTextAtSize(text: string, size: number): number }>;
    addPage(size?: [number, number]): {
      drawText(text: string, options: { x: number; y: number; size: number; font: unknown }): void;
    };
    save(): Promise<Uint8Array>;
  }
}

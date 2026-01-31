import { PDFDocument, StandardFonts } from "pdf-lib";
import * as fs from "fs/promises";

export interface PdfExportOptions {
  fontSize?: number;
  margin?: number;
}

function wrapLine(
  line: string,
  maxWidth: number,
  measure: (text: string) => number
): string[] {
  if (measure(line) <= maxWidth) return [line];
  const words = line.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (measure(test) <= maxWidth) {
      current = test;
      continue;
    }
    if (current) lines.push(current);
    if (measure(word) > maxWidth) {
      const hardParts: string[] = [];
      let chunk = "";
      for (const char of word) {
        const testChunk = chunk + char;
        if (measure(testChunk) <= maxWidth) {
          chunk = testChunk;
        } else {
          if (chunk) hardParts.push(chunk);
          chunk = char;
        }
      }
      if (chunk) hardParts.push(chunk);
      lines.push(...hardParts);
      current = "";
    } else {
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

export async function exportMarkdownToPdf(
  markdownContent: string,
  outputPath: string,
  options: PdfExportOptions = {}
): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Courier);

  const fontSize = options.fontSize ?? 10;
  const margin = options.margin ?? 40;
  const pageWidth = 595.28;
  const pageHeight = 841.89;

  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const lines = markdownContent.split("\n");
  for (const rawLine of lines) {
    const isHeading = rawLine.trim().startsWith("#");
    const headingLevel = isHeading ? rawLine.match(/^#+/)?.[0].length || 1 : 0;
    const lineFontSize = isHeading ? Math.max(12, 16 - headingLevel) : fontSize;
    const lineHeight = lineFontSize + 4;
    const maxWidth = pageWidth - margin * 2;
    const measure = (text: string) => font.widthOfTextAtSize(text, lineFontSize);

    const wrapped = wrapLine(rawLine, maxWidth, measure);
    for (const line of wrapped) {
      if (y - lineHeight < margin) {
        page = pdfDoc.addPage([pageWidth, pageHeight]);
        y = pageHeight - margin;
      }
      page.drawText(line, { x: margin, y: y - lineHeight, size: lineFontSize, font });
      y -= lineHeight;
    }
  }

  const pdfBytes = await pdfDoc.save();
  await fs.writeFile(outputPath, pdfBytes);
}

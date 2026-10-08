import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

export type ReportFinding = {
  title: string;
  severity: string;
};

function pdfLine(value: string): string {
  let line = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    line += code >= 32 && code <= 126 ? char : ' ';
    if (line.length >= 90) {
      break;
    }
  }
  return line;
}

export function templateBelongsToOrg(
  callerOrgId: string | null,
  templateOrgId: string | null,
): boolean {
  return callerOrgId !== null && templateOrgId === callerOrgId;
}

export async function buildScanReportPdf(input: {
  clientName: string;
  scanId: string;
  logoPng?: Uint8Array;
  findings?: readonly ReportFinding[];
  templateName?: string;
}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  page.drawText(input.clientName, { x: 50, y: 760, size: 20, font, color: rgb(0.1, 0.1, 0.1) });
  page.drawText(`Scan ${input.scanId}`, { x: 50, y: 730, size: 12, font });
  let y = 700;
  if (input.templateName !== undefined) {
    page.drawText(pdfLine(input.templateName), { x: 50, y, size: 12, font });
    y -= 20;
  }
  for (const finding of input.findings ?? []) {
    if (y < 72) {
      break;
    }
    page.drawText(pdfLine(`${finding.severity}: ${finding.title}`), { x: 50, y, size: 11, font });
    y -= 16;
  }

  if (input.logoPng !== undefined) {
    try {
      const image = await doc.embedPng(input.logoPng);
      page.drawImage(image, { x: 400, y: 720, width: 64, height: 64 });
    } catch {
      // A missing or unreadable logo must not fail the report.
    }
  }

  return doc.save();
}

export function reportAccess(input: {
  callerOrgId: string | null;
  scanOrgId: string | null;
  clientOrgId: string | null;
}): 'ok' | 'no-org' | 'other-scan' | 'other-client' {
  if (input.callerOrgId === null) {
    return 'no-org';
  }
  if (input.scanOrgId !== input.callerOrgId) {
    return 'other-scan';
  }
  if (input.clientOrgId !== input.callerOrgId) {
    return 'other-client';
  }
  return 'ok';
}

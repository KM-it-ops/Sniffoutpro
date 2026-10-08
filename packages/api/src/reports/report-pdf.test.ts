import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildScanReportPdf, reportAccess, templateBelongsToOrg } from './report-pdf.js';

function pdfPlainText(pdf: Uint8Array): string {
  const bytes = Buffer.from(pdf);
  const parts = [bytes.toString('latin1')];
  let cursor = 0;
  const startMark = Buffer.from('stream\n');
  const endMark = Buffer.from('\nendstream');
  while (cursor < bytes.length) {
    const start = bytes.indexOf(startMark, cursor);
    if (start === -1) {
      break;
    }
    const dataStart = start + startMark.length;
    const end = bytes.indexOf(endMark, dataStart);
    if (end === -1) {
      break;
    }
    try {
      parts.push(inflateSync(bytes.subarray(dataStart, end)).toString('latin1'));
    } catch {
      parts.push(bytes.subarray(dataStart, end).toString('latin1'));
    }
    cursor = end + endMark.length;
  }
  return parts.join('\n');
}

const ORG_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ORG_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('buildScanReportPdf', () => {
  it('includes the client name', async () => {
    const pdf = await buildScanReportPdf({
      clientName: 'Acme Security',
      scanId: 'scan-1',
    });
    expect(pdfPlainText(pdf).toUpperCase()).toContain(
      Buffer.from('Acme Security').toString('hex').toUpperCase(),
    );
  });

  it('includes the report template name', async () => {
    const pdf = await buildScanReportPdf({
      clientName: 'Acme Security',
      scanId: 'scan-1',
      templateName: 'Quarterly brief',
    });
    expect(pdfPlainText(pdf).toUpperCase()).toContain(
      Buffer.from('Quarterly brief').toString('hex').toUpperCase(),
    );
  });

  it('includes a finding from the scan', async () => {
    const pdf = await buildScanReportPdf({
      clientName: 'Acme Security',
      scanId: 'scan-1',
      findings: [{ title: 'OpenSSH', severity: 'high' }],
    });
    expect(pdfPlainText(pdf).toUpperCase()).toContain(
      Buffer.from('OpenSSH').toString('hex').toUpperCase(),
    );
  });

  it('embeds a PNG logo', async () => {
    const logoPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    );
    const pdf = await buildScanReportPdf({
      clientName: 'Acme Security',
      scanId: 'scan-1',
      logoPng,
    });
    expect(Buffer.from(pdf).toString('latin1')).toContain('/Subtype /Image');
  });

  it('still produces a PDF when the logo bytes are not a PNG', async () => {
    const pdf = await buildScanReportPdf({
      clientName: 'Acme Security',
      scanId: 'scan-1',
      logoPng: new Uint8Array([1, 2, 3, 4]),
    });
    expect(pdfPlainText(pdf).toUpperCase()).toContain(
      Buffer.from('Acme Security').toString('hex').toUpperCase(),
    );
    expect(pdf.byteLength).toBeGreaterThan(100);
  });
});

describe('reportAccess', () => {
  it('refuses a scan from another organization', () => {
    expect(reportAccess({ callerOrgId: ORG_A, scanOrgId: ORG_B, clientOrgId: ORG_A })).toBe(
      'other-scan',
    );
  });

  it('refuses a template from another organization', () => {
    expect(templateBelongsToOrg(ORG_A, ORG_B)).toBe(false);
    expect(templateBelongsToOrg(ORG_A, ORG_A)).toBe(true);
  });

  it('allows a scan and client in the caller organization', () => {
    expect(reportAccess({ callerOrgId: ORG_A, scanOrgId: ORG_A, clientOrgId: ORG_A })).toBe('ok');
  });
});

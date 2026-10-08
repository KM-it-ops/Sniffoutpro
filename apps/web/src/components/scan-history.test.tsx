import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ScanHistory } from './scan-history';

describe('signed-in scan history', () => {
  it('renders the caller scans', () => {
    const html = renderToStaticMarkup(
      <ScanHistory
        scans={[
          {
            id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            status: 'completed',
            targets: ['127.0.0.1'],
            startedAt: '2026-10-08T12:00:00.000Z',
          },
        ]}
        selectedScanId={null}
        onSelect={() => undefined}
      />,
    );
    expect(html).toContain('completed');
    expect(html).toContain('127.0.0.1');
  });
});

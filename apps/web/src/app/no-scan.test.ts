import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

function sourceFiles(dir: string): string[] {
  const found: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path));
      continue;
    }
    if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      found.push(path);
    }
  }
  return found;
}

describe('website scan boundary', () => {
  it('does not invoke nmap from the website', () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), '..');
    const files = sourceFiles(root).filter((path) => !path.endsWith('no-scan.test.ts'));
    const combined = files.map((path) => readFileSync(path, 'utf8')).join('\n');
    expect(combined.includes('run_nmap')).toBe(false);
    expect(combined.includes('invoke(')).toBe(false);
  });
});

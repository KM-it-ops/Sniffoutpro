import { test, expect } from '@playwright/test';
import { seedFixtureScan } from './helpers/seed-fixture-scan';

test.describe('dashboard', () => {
  test.beforeAll(async () => {
    await seedFixtureScan();
  });

  test('shows synced fixture scan with topology and severity chart', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /scan dashboard/i })).toBeVisible();

    const scanButton = page.getByRole('button', { name: /completed.*127\.0\.0\.1/i }).first();
    await expect(scanButton).toBeVisible();
    await scanButton.click();

    await expect(page.getByRole('heading', { name: /topology/i })).toBeVisible();
    await expect(page.getByText(/3 hosts/i)).toBeVisible();
    await expect(page.getByText(/CVE-2021-44228|Log4j/i).first()).toBeVisible();
    await expect(page.getByTestId('severity-chart')).toBeVisible();
  });

  test('compare runs section is available', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /compare runs/i })).toBeVisible();
  });
});

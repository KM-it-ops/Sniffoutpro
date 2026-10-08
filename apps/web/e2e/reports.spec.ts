import { test, expect } from '@playwright/test';

test.describe('reports', () => {
  test('offers a branded download and does not scan', async ({ page }) => {
    await page.goto('/reports');
    await expect(page.getByRole('heading', { name: /reports/i })).toBeVisible();
    await expect(page.getByLabel(/logo/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /save template/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /download pdf/i })).toBeVisible();
    await page.getByLabel('New client name').fill('Renamed client');
    await page.getByRole('button', { name: /rename client/i }).click();
    await expect(page.getByText(/save a client before renaming/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /run scan/i })).toHaveCount(0);
  });
});

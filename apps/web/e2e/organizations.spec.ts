import { test, expect } from '@playwright/test';

test.describe('organizations', () => {
  test('lets an admin invite a member and does not scan', async ({ page }) => {
    await page.goto('/organizations');
    await expect(page.getByRole('heading', { name: /organizations/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /invite member/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /run scan/i })).toHaveCount(0);
    await page.getByLabel('Organization name').fill('Acme Security');
    await page.getByLabel('Short name').fill('acme-security');
    await page.getByRole('button', { name: /create organization/i }).click();
    await expect(page.getByText(/authentication required/i)).toBeVisible({ timeout: 20_000 });
  });
});

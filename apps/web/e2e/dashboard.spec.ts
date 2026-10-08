import { test, expect } from '@playwright/test';

test.describe('dashboard', () => {
  test('asks a signed-out visitor to sign in', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page.getByRole('heading', { name: /scan dashboard/i })).toBeVisible();
    await expect(page.getByText(/sign in to see scan history/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /sign in/i })).toBeVisible();
  });
});

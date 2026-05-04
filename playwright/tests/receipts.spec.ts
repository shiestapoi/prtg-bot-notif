import { test, expect } from '@playwright/test';

const username = process.env.PW_USERNAME || 'haruyaki';
const password = process.env.PW_PASSWORD || 'haruyaki123';

test('select a contact or group for receipt', async ({ page }) => {
  await page.goto('/');

  await page.getByLabel('Username').fill(username);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Login' }).click();

  await page.getByRole('button', { name: 'Receipts' }).click();
  await page.getByRole('button', { name: 'Tambah Receipt' }).click();

  const contactTargets = page.locator('#receipt-targets-contact input[name="receiptTarget"]');
  const groupTargets = page.locator('#receipt-targets-group input[name="receiptTarget"]');

  if ((await contactTargets.count()) > 0) {
    await contactTargets.first().check();
  } else if ((await groupTargets.count()) > 0) {
    await groupTargets.first().check();
  } else {
    await page.getByLabel('Nomor Manual').first().check();
    await page.getByPlaceholder('6282179438863').fill('6282179438863');
  }

  await page.getByRole('button', { name: 'Simpan Receipt' }).click();
  await expect(page.getByText('Receipt Directory')).toBeVisible();

  await page.context().storageState({ path: 'playwright/.auth/state.json' });
});

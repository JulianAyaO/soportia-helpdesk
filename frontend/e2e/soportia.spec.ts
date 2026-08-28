import { expect, test } from '@playwright/test';

test('employee creates a ticket and admin sees automations', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar como Camila Restrepo' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole('heading', { name: /Buenos |Buenas /i })).toBeVisible();

  await page.goto('/tickets/new');
  await page.getByLabel('Título').fill('E2E printer access request');
  await page.getByLabel('Descripción').fill('The shared office printer rejects my company credentials.');
  await page.getByLabel('Categoría').click();
  await page.getByRole('option').first().click();
  await page.getByRole('button', { name: 'Enviar solicitud' }).click();
  await expect(page).toHaveURL(/\/tickets\/[0-9a-f-]+$/);
  await expect(page.getByRole('heading', { name: 'E2E printer access request' })).toBeVisible();

  await page.evaluate(() => localStorage.clear());
  await page.context().clearCookies();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Entrar como Marta Suárez' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto('/admin/automations');
  await expect(page.getByRole('heading', { name: 'Centro de automatización' })).toBeVisible();
  await expect(page.getByText('Enviar el ticket a la categoría correcta')).toBeVisible();
  await expect(page.getByText('Avisar cuando un ticket se retrasa')).toBeVisible();
});

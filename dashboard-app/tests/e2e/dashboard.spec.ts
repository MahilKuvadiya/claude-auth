import { test, expect } from '@playwright/test';
import { mockApi, gotoAs, type Role } from './fixtures';

const NAV_FOR: Record<Role, { visible: string[]; hidden: string[] }> = {
  member: { visible: ['Overview'], hidden: ['Team', 'Sessions', 'Pools', 'Admin'] },
  pod_lead: { visible: ['Overview', 'Team', 'Pools'], hidden: ['Sessions', 'Admin'] },
  admin: { visible: ['Overview', 'Team', 'Sessions', 'Pools', 'Admin'], hidden: [] },
};

for (const role of ['member', 'pod_lead', 'admin'] as Role[]) {
  test.describe(role, () => {
    test('overview renders with role-correct nav + charts', async ({ page }) => {
      await mockApi(page, role);
      await gotoAs(page, role, '/');

      // page header + scope
      await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

      // nav gating
      for (const label of NAV_FOR[role].visible) {
        await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
      }
      for (const label of NAV_FOR[role].hidden) {
        await expect(page.getByRole('link', { name: label, exact: true })).toHaveCount(0);
      }

      // KPI tiles + charts present
      await expect(page.getByText('Est. cost', { exact: true })).toBeVisible();
      await expect(page.getByText('Active users', { exact: true })).toHaveCount(role === 'admin' ? 1 : 0);
      await expect.poll(() => page.locator('svg.recharts-surface').count()).toBeGreaterThan(2);

      // Atlas palette: bg-primary resolves to teal #055F59
      const primary = await page.evaluate(() => {
        const el = document.createElement('div');
        el.className = 'bg-primary'; document.body.appendChild(el);
        const c = getComputedStyle(el).backgroundColor; el.remove(); return c;
      });
      expect(primary).toBe('rgb(5, 95, 89)');

      await page.screenshot({ path: `tests/e2e/__screens__/overview-${role}.png`, fullPage: true });
    });

    test('RBAC routing: admin-only pages', async ({ page }) => {
      await mockApi(page, role);
      // /sessions
      await gotoAs(page, role, '/sessions');
      if (role === 'admin') {
        await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible(); // redirected
      }
      // /admin
      await gotoAs(page, role, '/admin');
      if (role === 'admin') {
        await expect(page.getByRole('heading', { name: 'Admin' })).toBeVisible();
        await expect(page.getByText('Users & roles')).toBeVisible();
      } else {
        await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible(); // redirected
      }
    });
  });
}

test('admin can open the leaderboard and sessions explorer', async ({ page }) => {
  await mockApi(page, 'admin');
  await gotoAs(page, 'admin', '/team');
  await expect(page.getByRole('heading', { name: 'Leaderboard' })).toBeVisible();
  await expect(page.getByText('Ada Admin')).toBeVisible();

  await gotoAs(page, 'admin', '/sessions');
  await expect(page.getByRole('heading', { name: 'Sessions' })).toBeVisible();
  await expect(page.getByText('total', { exact: false })).toBeVisible();
});

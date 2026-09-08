import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { defaultBrief } from '../../shared/domain.ts'

test('hosted sign-in separates browser drafts and sign-out returns to the access screen', async ({ page }) => {
  const users = [{ id: randomUUID(), username: 'first_studio' }, { id: randomUUID(), username: 'second_studio' }]
  await page.addInitScript(({ users, brief }) => {
    users.forEach(user => localStorage.setItem('commission.projects.v2.' + user.id, JSON.stringify([{ id: crypto.randomUUID(), brief: { ...brief, title: user.username }, createdAt: new Date().toISOString() }])))
  }, { users, brief: defaultBrief })
  await page.route('**/api/access', route => route.fulfill({ json: { hosted: true, user: null } }))
  await page.route('**/api/auth/login', route => route.fulfill({ json: { user: users.find(user => user.username === route.request().postDataJSON().username) } }))
  await page.route('**/api/auth/logout', route => route.fulfill({ json: { ok: true } }))
  await page.route('**/api/orders', route => route.fulfill({ json: [] }))
  await page.route('**/api/wallet', route => route.fulfill({ json: { connected: false } }))
  await page.route('**/api/agent/status', route => route.fulfill({ json: { configured: false } }))
  await page.goto('/')
  for (const user of users) {
    await page.getByLabel('Username', { exact: true }).fill(user.username)
    await page.getByLabel('Password', { exact: true }).fill('browser-test-password')
    await page.getByRole('button', { name: 'Sign in', exact: true }).click()
    await expect(page.getByRole('heading', { name: user.username, exact: true })).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Campaigns', exact: true })).not.toContainText(users.find(other => other.id !== user.id)!.username)
    await page.getByRole('button', { name: 'Sign out', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Welcome to your studio.' })).toBeVisible()
  }
})

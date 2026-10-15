import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { loyaltyPoints } from '@awecommerce/service/apps/loyalty/schemas'
import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { orders } from '@awecommerce/service/apps/order/schemas'
import * as authSchema from '../../../packages/auth/server/db/schema'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('customers and staff', async () => {
  const db = await setupBackoffice()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const person = async (name: string, role: 'user' | 'admin' = 'user') => {
    const id = randomUUID()
    const email = `${unique(name.toLowerCase())}@example.com`
    await db.insert(authSchema.users).values({ id, name, email, role })
    return { id, email }
  }
  const userRow = async (id: string) => (await db.select().from(authSchema.users).where(eq(authSchema.users.id, id)))[0]!

  const openPage = async (path: string) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}${path}`)
    return page
  }

  test('lists customers and staff apart, and adds staff by email', async () => {
    const customer = await person('Cara')
    const staff = await person('Sam', 'admin')
    const page = await openPage(`/customers?q=example.com`)
    const row = (email: string) => page.getByRole('row', { name: new RegExp(email) })

    await row(customer.email).waitFor()
    expect(await row(staff.email).count()).toBe(0)
    await page.getByRole('tab', { name: 'Staff' }).click()
    await row(staff.email).waitFor()

    const newEmail = `${unique('newstaff')}@example.com`
    await page.getByRole('button', { name: 'Add staff' }).click()
    await page.getByRole('dialog').getByLabel('Email').fill(newEmail)
    await page.getByRole('dialog').getByRole('button', { name: 'Add staff' }).click()
    await page.getByText(`Added ${newEmail} as staff`).first().waitFor()
    await page.getByPlaceholder('Search by email…').fill(newEmail)
    await row(newEmail).getByText('Staff', { exact: true }).waitFor()
  })

  test('a person page: orders, points, memberships, name, role and ban', async () => {
    const { id, email } = await person('Dee')
    await db.insert(orders).values({ total: '42', userId: id })
    await db.insert(loyaltyPoints).values({ userId: id, orderId: 0, earnedPoints: '30' })
    const gold = await new MembershipService(db).createPlan({ name: unique('Gold'), slug: unique('gold'), program: unique('music'), rank: 1 })
    const page = await openPage(`/customers/${id}`)

    await page.getByText(email).first().waitFor()
    await page.getByTestId('points').getByText('30').waitFor()
    await page.getByRole('heading', { name: /Orders · 1/ }).waitFor()

    // Name
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Change name' }).click()
    await page.getByRole('dialog').getByLabel('Name').fill('Dee Corrected')
    await page.getByRole('button', { name: 'Save' }).click()
    await page.getByText('Name changed').first().waitFor()
    expect((await userRow(id)).name).toBe('Dee Corrected')

    // Memberships
    const memberships = page.getByRole('region', { name: 'Memberships' })
    await memberships.getByLabel('Plan to grant').click()
    await page.getByRole('option', { name: new RegExp(gold.name) }).click()
    await memberships.getByRole('button', { name: 'Grant' }).click()
    await page.getByText('Membership granted').first().waitFor()
    await memberships.getByRole('button', { name: 'Extend' }).click()
    await page.getByLabel('Months to add').fill('6')
    await page.getByRole('button', { name: 'Extend', exact: true }).last().click()
    await memberships.getByText('upcoming').waitFor()
    expect((await new MembershipService(db).history(id)).map((m) => m.months)).toEqual([6, 12])

    // Role and ban
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Make staff' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Make staff' }).click()
    await page.getByText('Now staff').first().waitFor()
    expect((await userRow(id)).role).toBe('admin')
    await page.getByRole('button', { name: 'More actions' }).click()
    await page.getByRole('menuitem', { name: 'Ban' }).click()
    await page.getByLabel('Reason').fill('Chargebacks')
    await page.getByRole('button', { name: 'Ban', exact: true }).click()
    await page.getByText('Chargebacks').waitFor()
    expect((await userRow(id)).banned).toBe(true)
    await page.getByRole('button', { name: 'Lift ban' }).click()
    await expect.poll(async () => (await userRow(id)).banned).toBe(false)
  })
})

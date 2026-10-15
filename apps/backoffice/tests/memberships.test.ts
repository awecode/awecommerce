import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { describe, expect, test } from 'vitest'
import { membershipPlans } from '@awecommerce/service/apps/membership/schemas'
import { MembershipService } from '@awecommerce/service/apps/membership/services/membership'
import { ProductService } from '@awecommerce/service/apps/product/services/product'
import * as authSchema from '../../../packages/auth/server/db/schema'
import { STAFF_EMAIL, setupBackoffice, signedInPage, url } from './helpers'

describe.skipIf(!url)('memberships', async () => {
  const db = await setupBackoffice()
  const unique = (prefix: string) => `${prefix}-${Date.now()}${Math.floor(Math.random() * 1000)}`
  const memberships = new MembershipService(db)

  const openPage = async (path: string) => {
    const page = await signedInPage(db, STAFF_EMAIL)
    await page.waitForURL('**/products')
    await page.goto(`${process.env.BETTER_AUTH_URL}${path}`)
    return page
  }

  test('creates a plan and links a product variant to it as a term', async () => {
    const productName = unique('Platinum year')
    const product = await new ProductService(db).create({ name: productName, slug: unique('platinum-year'), sku: unique('PLAT'), price: '99', stockQuantity: 0 })
    const page = await openPage('/memberships/plans')
    const name = unique('Platinum')

    await page.getByRole('button', { name: 'New membership plan' }).click()
    await page.getByLabel('Name').fill(name)
    await page.getByLabel('Program').fill('music')
    await page.getByRole('button', { name: /^Save/ }).click()
    await page.getByText(`Created ${name}`).first().waitFor()
    const [plan] = await db.select().from(membershipPlans).where(eq(membershipPlans.name, name))
    expect(plan).toMatchObject({ program: 'music', rank: 1, isActive: true })

    // Terms are added from the plan's panel, and saved at once
    await page.getByPlaceholder('Search…').fill(name)
    await page.getByRole('row', { name: new RegExp(name) }).getByText('Not sold').click()
    await page.getByLabel('Product', { exact: true }).click()
    await page.keyboard.type(productName)
    await page.getByRole('option', { name: productName }).click()
    await page.getByLabel('Months').fill('6')
    await page.getByRole('button', { name: 'Add', exact: true }).click()
    await page.getByText('Term added').first().waitFor()
    await page.getByText('6 months').waitFor()
    expect((await memberships.getPlan(plan!.id))!.terms).toMatchObject([{ months: 6, variantId: product.variants[0]!.id }])
  })

  test('grants a plan, then extends and cancels from the member history', async () => {
    const userId = randomUUID()
    const email = `${unique('dee')}@example.com`
    await db.insert(authSchema.users).values({ id: userId, name: 'Dee Member', email })
    const plan = await memberships.createPlan({ name: unique('Gold'), slug: unique('gold'), program: unique('films'), rank: 1 })
    const page = await openPage('/memberships')

    await page.getByRole('button', { name: 'Grant membership' }).click()
    await page.getByLabel('Customer', { exact: true }).click()
    await page.keyboard.type(email)
    await page.getByRole('option', { name: new RegExp(email) }).click()
    await page.getByRole('dialog').getByLabel('Plan', { exact: true }).click()
    await page.getByRole('option', { name: new RegExp(plan.name) }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Grant', exact: true }).click()
    await page.getByText('Membership granted').first().waitFor()

    await page.getByPlaceholder('Search members…').fill(email)
    await page.waitForURL((u) => u.searchParams.get('q') === email)
    const row = page.getByRole('row', { name: /Dee Member/ })
    await row.getByText('active').waitFor()
    await row.click()

    await page.getByLabel('Months to add').fill('3')
    await page.getByRole('button', { name: 'Extend', exact: true }).click()
    await page.getByText(`${plan.name} extended`).first().waitFor()
    const history = page.getByRole('region', { name: 'History' })
    await history.getByText('upcoming').waitFor()
    expect((await memberships.history(userId)).map((m) => m.months)).toEqual([3, 12])

    await history.getByRole('listitem').filter({ hasText: 'upcoming' }).getByRole('button', { name: 'Cancel' }).click()
    await page.getByLabel('Reason').fill('Granted by mistake')
    await page.getByRole('button', { name: 'Cancel membership' }).click()
    await history.getByText('Cancelled: Granted by mistake').waitFor()
    expect((await memberships.history(userId)).map((m) => m.status)).toEqual(['cancelled', 'active'])
  })
})

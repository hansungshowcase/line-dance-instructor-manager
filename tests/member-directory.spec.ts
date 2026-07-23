import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('keeps member rows compact and reveals passes only after opening the member', async ({ page }) => {
  await page.goto('./?demo')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: '회원', exact: true }).click()

  const card = page.locator('.memberLookupCard').filter({ hasText: '김미영' })
  await expect(card).toBeVisible()
  await expect(card.locator('.enrollLine')).toHaveCount(0)
  await expect(card.getByText('등록 회원', { exact: true })).toHaveCount(0)

  await card.locator('.memberLookupSummary').click({ position: { x: 8, y: 8 } })
  await expect(card.locator('.enrollLine')).toHaveCount(1)
})

test('formats a stored digit-only phone number in the member list', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'line-dance-manager-v3',
      JSON.stringify({
        attendance: {},
        classes: [],
        gigs: [],
        members: [{
          id: 'member-phone',
          name: '번호회원',
          phone: '01055551212',
          status: 'active',
          note: '',
          enrollments: [],
        }],
        passTemplates: [],
        paymentArchive: [],
        waitlistClasses: [],
      }),
    )
  })
  await page.goto('./')
  await page.getByRole('button', { name: '회원', exact: true }).click()

  const card = page.locator('.memberLookupCard').filter({ hasText: '번호회원' })
  await expect(card.getByRole('link', { name: '010-5555-1212' })).toBeVisible()
})

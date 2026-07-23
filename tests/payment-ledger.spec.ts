import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const currentMonth = `${year}-${month}`
    const day = Math.max(2, Math.min(now.getDate(), 20))
    const newestDate = `${currentMonth}-${String(day).padStart(2, '0')}`
    const olderDate = `${currentMonth}-${String(day - 1).padStart(2, '0')}`

    localStorage.setItem(
      'line-dance-manager-v3',
      JSON.stringify({
        attendance: {},
        classes: [
          {
            id: 'class-monday',
            name: '월요 라인댄스 중급반(사당)',
            weekday: 1,
            startTime: '15:20',
            endTime: '16:20',
            location: '사당',
            capacity: 12,
            tuitionFee: 120000,
            level: '중급',
          },
        ],
        gigs: [
          {
            date: `${year}-01-01`,
            endTime: '11:00',
            fee: 100,
            id: 'gig-past',
            name: '완료 강의',
            startTime: '10:00',
          },
          {
            date: `${year}-12-31`,
            endTime: '11:00',
            fee: 200,
            id: 'gig-future',
            name: '예정 강의',
            startTime: '10:00',
          },
        ],
        members: [
          {
            id: 'member-unpaid',
            name: '김세은',
            phone: '010-1111-2222',
            status: 'active',
            note: '',
            enrollments: [
              {
                id: 'enrollment-unpaid',
                passName: '라인댄스 단체반 10회권',
                classIds: ['class-monday'],
                remainingCredits: 0,
                totalCredits: 10,
                paidAmount: 120000,
                lastPaidAt: olderDate,
                nextPaymentDue: '2020-01-01',
                payments: [{ amount: 120000, date: olderDate }],
              },
            ],
          },
          {
            id: 'member-paid',
            name: '이정아',
            phone: '010-3333-4444',
            status: 'active',
            note: '',
            enrollments: [
              {
                id: 'enrollment-paid',
                passName: '개인레슨 10회권',
                classIds: [],
                remainingCredits: 8,
                totalCredits: 10,
                paidAmount: 300000,
                lastPaidAt: newestDate,
                nextPaymentDue: `${year + 1}-01-01`,
                payments: [{ amount: 300000, date: newestDate }],
              },
            ],
          },
        ],
        passTemplates: [],
        paymentArchive: [
          {
            amount: 300,
            date: `${year}-01-02`,
            memberName: '과거회원',
            passName: '과거수강권',
          },
          {
            amount: 500,
            date: `${year + 1}-01-02`,
            memberName: '미래회원',
            passName: '미래수강권',
          },
        ],
        waitlistClasses: [],
      }),
    )
  })
})

test('shows current-month payments newest first with member, pass, class and amount', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: '결제', exact: true }).click()

  const ledger = page.getByRole('region', { name: '이번 달 입금 내역' })
  const rows = ledger.locator('.paymentLogRow')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('이정아')
  await expect(rows.nth(0)).toContainText('개인레슨 10회권')
  await expect(rows.nth(0)).toContainText('개인레슨')
  await expect(rows.nth(0)).toContainText('₩300,000')
  await expect(rows.nth(1)).toContainText('김세은')
  await expect(rows.nth(1)).toContainText('라인댄스 단체반 10회권')
  await expect(rows.nth(1)).toContainText('월요 라인댄스 중급반(사당)')
})

test('excludes future income and preserves payment history when an unpaid course ends', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: '결제', exact: true }).click()

  await expect(page.getByText('올해 실제 수입 ₩420,400')).toBeVisible()
  await expect(page.getByText('예정 수입 ₩200')).toBeVisible()

  const paymentCard = page.locator('.paymentCard').filter({ hasText: '김세은' })
  await paymentCard.locator('details.enrollPayBlock summary').click()
  page.once('dialog', (dialog) => dialog.accept())
  await paymentCard.getByRole('button', { name: '미납 수강 종료' }).click()

  await expect(page.locator('.dueRow').filter({ hasText: '김세은' })).toHaveCount(0)
  await expect(paymentCard.getByText('라인댄스 단체반 10회권')).toHaveCount(0)
  await expect(
    page.getByRole('region', { name: '이번 달 입금 내역' }).locator('.paymentLogRow').filter({
      hasText: '김세은',
    }),
  ).toHaveCount(1)
})

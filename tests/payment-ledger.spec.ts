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

test('keeps a long monthly ledger compact until the instructor opens it', async ({ page }) => {
  await page.addInitScript(() => {
    const saved = localStorage.getItem('line-dance-manager-v3')
    if (!saved) return
    const data = JSON.parse(saved) as {
      paymentArchive: Array<{
        amount: number
        date: string
        memberName: string
        passName: string
      }>
    }
    const today = new Date()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const year = today.getFullYear()
    data.paymentArchive.push(
      {
        amount: 80000,
        date: `${year}-${month}-01`,
        memberName: '박지수',
        passName: '라인댄스 단체반 월수강권',
      },
      {
        amount: 90000,
        date: `${year}-${month}-02`,
        memberName: '서윤아',
        passName: '라틴댄스 단체반 월수강권',
      },
    )
    localStorage.setItem('line-dance-manager-v3', JSON.stringify(data))
  })

  await page.goto('./')
  await page.getByRole('button', { name: '결제', exact: true }).click()

  const ledger = page.getByRole('region', { name: '이번 달 입금 내역' })
  await expect(ledger.getByRole('button', { name: '전체 4건 보기' })).toBeVisible()
  await expect(ledger.locator('details')).toHaveCount(3)

  await ledger.getByRole('button', { name: '전체 4건 보기' }).click()
  await expect(ledger.getByRole('button', { name: '입금 내역 접기' })).toBeVisible()
  await expect(ledger.locator('details')).toHaveCount(4)

  const newestPayment = ledger.locator('details').first()
  await newestPayment.locator('summary').click()
  await expect(newestPayment.getByText('개인레슨 10회권')).toBeVisible()
  await expect(newestPayment.getByText('개인레슨', { exact: true })).toBeVisible()
  await expect(newestPayment.getByRole('button', { name: /수납 기록 삭제/ })).toBeVisible()
})

test('puts a compact financial summary before the ledger and reveals deeper figures on demand', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: '결제', exact: true }).click()

  const summary = page.getByRole('region', { name: '이번 달 재무 요약' })
  const ledger = page.getByRole('region', { name: '이번 달 입금 내역' })
  const [summaryBox, ledgerBox] = await Promise.all([summary.boundingBox(), ledger.boundingBox()])

  expect(summaryBox?.y).toBeLessThan(ledgerBox?.y ?? Number.POSITIVE_INFINITY)
  await expect(summary.getByText('회비 ₩420,000 · 2건')).toBeVisible()
  await expect(summary.getByRole('button', { name: '재무 요약 상세' })).toBeVisible()
  await expect(summary.getByText('올해 실제 수입')).toHaveCount(0)

  await summary.getByRole('button', { name: '재무 요약 상세' }).click()
  await expect(summary.getByText('올해 실제 수입')).toBeVisible()
  await expect(summary.getByText('예정 수입')).toBeVisible()
})

test('corrects a receipt date from the ledger without changing another receipt', async ({ page }) => {
  await page.addInitScript(() => {
    const saved = localStorage.getItem('line-dance-manager-v3')
    if (!saved) return
    const data = JSON.parse(saved) as {
      members: Array<{
        name: string
        enrollments: Array<{
          lastPaidAt: string
          payments: Array<{ amount: number; date: string }>
        }>
      }>
    }
    const member = data.members.find((item) => item.name === '이정아')
    const enrollment = member?.enrollments[0]
    if (!member || !enrollment) return
    member.name = '민지원'
    enrollment.lastPaidAt = '2026-07-15'
    enrollment.payments = [
      { amount: 200000, date: '2026-05-04' },
      { amount: 300000, date: '2026-07-15' },
    ]
    localStorage.setItem('line-dance-manager-v3', JSON.stringify(data))
  })

  await page.goto('./')
  await page.getByRole('button', { name: '결제', exact: true }).click()

  const ledger = page.getByRole('region', { name: '이번 달 입금 내역' })
  const minjiReceipt = ledger.locator('details').filter({ hasText: '민지원' })
  await minjiReceipt.locator('summary').click()
  await minjiReceipt.getByLabel('실제 입금일').fill('2026-05-04')
  await minjiReceipt.getByRole('button', { name: '입금일 저장' }).click()

  await expect(ledger.getByText('민지원')).toHaveCount(0)
  const paymentLogPanel = page.locator('section.panel').filter({ hasText: '수납 내역' })
  await paymentLogPanel.getByRole('button', { name: '전체', exact: true }).click()
  await expect(paymentLogPanel.getByText('26/05/04').filter({ hasText: '26/05/04' })).toHaveCount(2)
})

test('keeps both receipts visible when a date correction would duplicate an amount and date', async ({
  page,
}) => {
  await page.addInitScript(() => {
    const saved = localStorage.getItem('line-dance-manager-v3')
    if (!saved) return
    const data = JSON.parse(saved) as {
      members: Array<{
        name: string
        enrollments: Array<{
          lastPaidAt: string
          payments: Array<{ amount: number; date: string }>
        }>
      }>
    }
    const member = data.members.find((item) => item.name === '이정아')
    const enrollment = member?.enrollments[0]
    if (!member || !enrollment) return
    member.name = '민지원'
    enrollment.lastPaidAt = '2026-07-15'
    enrollment.payments = [
      { amount: 300000, date: '2026-05-04' },
      { amount: 300000, date: '2026-07-15' },
    ]
    localStorage.setItem('line-dance-manager-v3', JSON.stringify(data))
  })

  await page.goto('./')
  await page.getByRole('button', { name: '결제', exact: true }).click()

  const ledger = page.getByRole('region', { name: '이번 달 입금 내역' })
  const minjiReceipt = ledger.locator('details').filter({ hasText: '민지원' })
  await minjiReceipt.locator('summary').click()
  await minjiReceipt.getByLabel('실제 입금일').fill('2026-05-04')
  await minjiReceipt.getByRole('button', { name: '입금일 저장' }).click()

  await expect(page.getByText('같은 날짜·금액의 입금 기록이 이미 있습니다.')).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '결제', exact: true }).click()
  await expect(page.getByRole('region', { name: '이번 달 입금 내역' }).getByText('민지원')).toBeVisible()
})

test('excludes future income and preserves payment history when an unpaid course ends', async ({
  page,
}) => {
  await page.goto('./')
  await page.getByRole('button', { name: '결제', exact: true }).click()

  const summary = page.getByRole('region', { name: '이번 달 재무 요약' })
  await summary.getByRole('button', { name: '재무 요약 상세' }).click()
  await expect(summary.getByText('올해 실제 수입 ₩420,400')).toBeVisible()
  await expect(summary.getByText('예정 수입 ₩200')).toBeVisible()

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

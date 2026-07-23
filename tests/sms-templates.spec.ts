import { expect, test } from '@playwright/test'

test('templates can be added and deleted, and composer fills member, class and fee', async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (sessionStorage.getItem('sms-fixture-seeded')) return
    sessionStorage.setItem('sms-fixture-seeded', 'true')
    localStorage.setItem(
      'line-dance-sms-templates',
      JSON.stringify({
        unpaid: 'old unpaid',
        lowCredit: 'old renewal',
        expiring: 'old expiring',
      }),
    )
    localStorage.setItem(
      'line-dance-manager-v3',
      JSON.stringify({
        attendance: {},
        classes: [
          {
            id: 'class-line',
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
        gigs: [],
        members: [
          {
            id: 'member-kim',
            name: '김세은',
            phone: '010-1111-2222',
            status: 'active',
            note: '',
            enrollments: [
              {
                id: 'enrollment-line',
                passName: '라인댄스 단체반 10회권',
                classIds: ['class-line'],
                remainingCredits: 0,
                totalCredits: 10,
                paidAmount: 120000,
                lastPaidAt: '2026-01-01',
                nextPaymentDue: '2020-01-01',
                payments: [],
              },
            ],
          },
        ],
        passTemplates: [],
        paymentArchive: [],
        waitlistClasses: [],
      }),
    )
  })

  await page.goto('./')
  await page.getByRole('button', { name: /설정/ }).click()
  await page.locator('details.formDrawer').filter({ hasText: '문자 템플릿' }).locator('summary').click()
  await expect(page.getByText('미납 안내', { exact: true })).toHaveCount(0)
  await expect(page.getByText('결제일 임박 안내', { exact: true })).toHaveCount(0)
  await expect(page.locator('.smsTemplateItem input').first()).toHaveValue('재등록 안내')

  const settings = page.locator('.smsTemplateSettings')
  await settings.getByText('새 템플릿 이름').locator('..').getByRole('textbox').fill('수강 안내')
  await settings.getByText('새 문자 내용').locator('..').getByRole('textbox').fill(
    '{이름}님 {수업} 수강료는 {수강료}입니다.',
  )
  await settings.getByRole('button', { name: '템플릿 추가' }).click()
  await settings.getByRole('button', { name: '수강 안내 템플릿 삭제' }).click()
  await settings.getByText('새 템플릿 이름').locator('..').getByRole('textbox').fill('수강 안내')
  await settings.getByText('새 문자 내용').locator('..').getByRole('textbox').fill(
    '{이름}님 {수업} 수강료는 {수강료}입니다.',
  )
  await settings.getByRole('button', { name: '템플릿 추가' }).click()

  await page.getByRole('button', { name: '김세은 문자' }).click()
  const dialog = page.getByRole('dialog', { name: '문자 작성' })
  await dialog.getByText('템플릿').locator('..').getByRole('combobox').selectOption({ label: '수강 안내' })
  const preview = dialog.locator('textarea[readonly]')
  await expect(preview).toHaveValue(/김세은/)
  await expect(preview).toHaveValue(/월요 라인댄스 중급반\(사당\)/)
  await expect(preview).toHaveValue(/₩120,000/)

  await page.reload()
  await page.getByRole('button', { name: /설정/ }).click()
  await page.locator('details.formDrawer').filter({ hasText: '문자 템플릿' }).locator('summary').click()
  const savedTitles = await page
    .locator('.smsTemplateItem input')
    .evaluateAll((inputs) => inputs.map((input) => (input instanceof HTMLInputElement ? input.value : '')))
  expect(savedTitles).toContain('수강 안내')
})

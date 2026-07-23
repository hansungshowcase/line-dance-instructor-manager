import { expect, test } from '@playwright/test'

test('shows only scheduled group weekdays and booked private dates', async ({ page }) => {
  await page.addInitScript(() => {
    const now = new Date()
    const privateDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-15`
    localStorage.setItem(
      'line-dance-manager-v3',
      JSON.stringify({
        attendance: {},
        classes: [
          {
            id: 'class-monday', name: '월요 라인댄스 중급반(사당)', weekday: 1,
            startTime: '15:20', endTime: '16:20', location: '사당', capacity: 12,
            tuitionFee: 120000, level: '중급',
          },
          {
            id: 'private-booking', name: '이정아 개인레슨', weekday: new Date(`${privateDate}T12:00:00`).getDay(),
            startTime: '11:00', endTime: '11:50', location: '개인레슨', capacity: 1,
            tuitionFee: 0, level: '전체', date: privateDate,
          },
        ],
        gigs: [],
        members: [
          {
            id: 'member-kim', name: '김세은', phone: '010-1111-2222', status: 'active', note: '',
            enrollments: [{
              id: 'enrollment-line', passName: '라인댄스 단체반', classIds: ['class-monday'],
              remainingCredits: 10, totalCredits: 10, paidAmount: 120000,
              lastPaidAt: '', nextPaymentDue: '', payments: [],
            }],
          },
          {
            id: 'member-lee', name: '이정아', phone: '010-3333-4444', status: 'active', note: '',
            enrollments: [{
              id: 'enrollment-private', passName: '개인레슨 10회권', classIds: ['private-booking'],
              remainingCredits: 8, totalCredits: 10, paidAmount: 300000,
              lastPaidAt: '', nextPaymentDue: '', payments: [],
            }],
          },
        ],
        passTemplates: [
          {
            id: 'pass-line', type: 'line_group', name: '라인댄스 단체반', sessionCount: 10,
            startTime: '15:20', endTime: '16:20', weekdays: [1], capacity: 12,
            tuitionFee: 120000, classIds: ['class-monday'],
          },
          {
            id: 'pass-private', type: 'private', name: '개인레슨 10회권', sessionCount: 10,
            startTime: '11:00', endTime: '11:50', weekdays: [], capacity: 1,
            tuitionFee: 300000, classIds: [],
          },
        ],
        paymentArchive: [],
        waitlistClasses: [],
      }),
    )
  })

  await page.goto('./')
  await page.getByRole('button', { name: '출석', exact: true }).click()
  await expect(page.locator('.dateStepper')).toHaveCount(0)
  await expect(page.locator('input[type="date"]')).toHaveCount(0)
  const dateButtons = page.locator('.attendanceDateGrid button')
  await expect(dateButtons.first()).toBeVisible()
  const labels = await dateButtons.evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))
  expect(labels.every((label) => label?.endsWith('월요일'))).toBe(true)

  await page.getByRole('tab', { name: '개인레슨' }).click()
  await expect(page.getByRole('button', { name: '이정아', exact: true })).toBeVisible()
  await expect(page.locator('.attendanceDateGrid button')).toHaveCount(1)
  await expect(page.locator('.attendanceDateGrid button')).toHaveAttribute('aria-label', /15/)
  await expect(page.getByText(/개인레슨은 출석 체크 없이/)).toBeVisible()
  await expect(page.locator('.attendanceRow').filter({ hasText: '이정아' }).getByRole('button', { name: '출석' })).toHaveCount(0)
})

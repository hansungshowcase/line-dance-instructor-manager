import { expect, test } from '@playwright/test'

test('past private lesson is charged once without attendance', async ({ page }) => {
  await page.addInitScript(() => {
    const date = new Date()
    date.setDate(date.getDate() - 1)
    const pastDate = [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-')
    localStorage.setItem(
      'line-dance-manager-v3',
      JSON.stringify({
        attendance: {},
        classes: [
          {
            id: 'private-past',
            name: '이정아 개인레슨',
            weekday: date.getDay(),
            startTime: '11:00',
            endTime: '11:50',
            location: '개인레슨',
            capacity: 1,
            tuitionFee: 0,
            level: '전체',
            date: pastDate,
          },
        ],
        gigs: [],
        members: [
          {
            id: 'member-lee',
            name: '이정아',
            phone: '010-3333-4444',
            status: 'active',
            note: '',
            enrollments: [
              {
                id: 'enrollment-private',
                passName: '개인레슨 10회권',
                classIds: ['private-past'],
                remainingCredits: 8,
                totalCredits: 10,
                paidAmount: 300000,
                lastPaidAt: pastDate,
                nextPaymentDue: '',
                payments: [],
              },
            ],
          },
        ],
        passTemplates: [
          {
            id: 'pass-private',
            type: 'private',
            name: '개인레슨 10회권',
            sessionCount: 10,
            startTime: '10:00',
            endTime: '10:50',
            weekdays: [],
            capacity: 1,
            tuitionFee: 300000,
            classIds: [],
          },
        ],
        paymentArchive: [],
        waitlistClasses: [],
      }),
    )
  })

  await page.goto('./')
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('line-dance-manager-v3') ?? '{}')
        return data.members?.[0]?.enrollments?.[0]?.remainingCredits
      }),
    )
    .toBe(7)

  await page.reload()
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem('line-dance-manager-v3') ?? '{}')
        return {
          attendanceCount: Object.keys(data.attendance ?? {}).length,
          chargeCount: Object.keys(data.privateLessonCharges ?? {}).length,
          credits: data.members?.[0]?.enrollments?.[0]?.remainingCredits,
        }
      }),
    )
    .toEqual({ attendanceCount: 0, chargeCount: 1, credits: 7 })
})

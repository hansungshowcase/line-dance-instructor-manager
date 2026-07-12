import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

// 예전 버전(수강권 삭제 연동 이전)이 남긴 흔적 수업:
// 같은 이름의 수강권이 없고 배정 회원도 없는 그룹 수업은 로드 시 자동으로 청소된다
test('흔적 수업(수강권·배정회원 없는 그룹 수업)은 로드 시 자동 청소된다', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => {
    // 시간표는 선택된 요일(기본: 오늘)의 수업만 보여주므로 오늘 요일로 심는다
    const todayWeekday = new Date().getDay()
    localStorage.clear()
    localStorage.setItem(
      'line-dance-manager-v3',
      JSON.stringify({
        members: [],
        classes: [
          {
            id: 'class-orphan-test',
            name: '유령 그룹 수업',
            weekday: todayWeekday,
            startTime: '10:00',
            endTime: '11:00',
            location: '스튜디오',
            capacity: 10,
          },
          {
            id: 'class-private-test',
            name: '홍길동 개인레슨',
            weekday: todayWeekday,
            startTime: '12:00',
            endTime: '12:50',
            location: '개인레슨',
            capacity: 1,
          },
        ],
        passTemplates: [],
        attendance: {},
        gigs: [],
      }),
    )
  })
  await page.reload()
  await page.locator('nav button', { hasText: '시간표' }).click()
  // 흔적 그룹 수업은 사라지고, 개인레슨은 유지된다
  await expect(page.getByText('유령 그룹 수업')).toHaveCount(0)
  await expect(page.getByText('홍길동 개인레슨').first()).toBeVisible()
})

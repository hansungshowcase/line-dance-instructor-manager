import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('데모 모드: 설정을 열면 동기화 서랍이 보이고 데모 안내를 보여준다', async ({ page }) => {
  await page.goto('./?demo')
  await page.getByRole('button', { name: /설정/ }).click()
  const drawer = page.locator('details.syncDrawer')
  await expect(drawer.getByText('연결 안 됨')).toBeVisible()
  await drawer.locator('summary').click()
  await expect(drawer.getByText('데모 모드에서는 기기 동기화를 사용할 수 없어요')).toBeVisible()
})

test('실제 모드: 설정을 열면 동기화 서랍이 연결 안 됨 상태로 보인다', async ({ page }) => {
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.getByRole('button', { name: /설정/ }).click()
  const drawer = page.locator('details.syncDrawer')
  await expect(drawer.getByText('연결 안 됨')).toBeVisible()
  await drawer.locator('summary').click()
  // 서버 설정 전에는 안내 문구, 설정 후에는 코드 만들기 버튼이 보인다
  await expect(drawer.locator('.drawerBody')).toContainText(/동기화/)
})

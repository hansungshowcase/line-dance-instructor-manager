import { expect, test } from '@playwright/test'

const viewports = [
  { height: 812, label: 'mobile-375', width: 375 },
  { height: 1024, label: 'tablet-768', width: 768 },
  { height: 900, label: 'desktop-1280', width: 1280 },
] as const

test('requested workflows stay readable without horizontal overflow', async ({ page }) => {
  test.slow()
  for (const viewport of viewports) {
    await page.setViewportSize({ height: viewport.height, width: viewport.width })
    await page.goto('./?demo')

    await page.getByRole('button', { name: '결제', exact: true }).click()
    await expect(page.getByRole('region', { name: '이번 달 입금 내역' })).toBeVisible()
    await page.screenshot({
      fullPage: true,
      path: `artifacts/qa/${viewport.label}-payments.png`,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)

    await page.getByRole('button', { name: '출석', exact: true }).click()
    await expect(page.getByRole('tab', { name: '라인댄스 단체반' })).toBeVisible()
    await page.screenshot({
      fullPage: true,
      path: `artifacts/qa/${viewport.label}-attendance-group.png`,
    })
    await page.getByRole('tab', { name: '개인레슨' }).click()
    await page.screenshot({
      fullPage: true,
      path: `artifacts/qa/${viewport.label}-attendance-private.png`,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)

    await page.getByRole('button', { name: '홈', exact: true }).click()
    await page.getByRole('button', { name: /문자/ }).first().click()
    await expect(page.getByRole('dialog', { name: '문자 작성' })).toBeVisible()
    await page.screenshot({
      fullPage: true,
      path: `artifacts/qa/${viewport.label}-sms-composer.png`,
    })
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true)
    await page.getByRole('button', { name: '문자 작성 닫기' }).click()
  }
})

import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  await page.goto('./')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
})

test('instructor can manage classes, members, attendance, and payment details', async ({
  page,
}) => {
  await expect(page.getByRole('button', { name: '시간표 보기' })).toBeVisible()
  await expect(page.getByText('오늘 해야 할 수업')).toBeVisible()

  await page.getByRole('button', { name: '시간표', exact: true }).click()
  await expect(page.getByText('10시 이후 시간대별 보기')).toBeVisible()
  await expect(page.getByText('초급 라인댄스').first()).toBeVisible()
  await page.locator('details.classEditor').first().locator('summary').click()
  await page.locator('details.classEditor').first().locator('input[name="tuitionFee"]').fill('95000')
  await page.locator('details.classEditor').first().getByRole('button', { name: '수정 저장' }).click()
  await expect(page.getByText('₩95,000').first()).toBeVisible()

  await page.getByRole('button', { name: '회원', exact: true }).click()
  const memberDrawer = page.locator('details.formDrawer').filter({ hasText: '등록 회원 추가' })
  await memberDrawer.locator('summary').click()
  await page.getByPlaceholder('회원 이름').fill('최하은')
  await memberDrawer.getByPlaceholder('010-0000-0000').fill('010-5555-1212')
  // 수강권을 고르면 수업이 자동 배정된다
  await memberDrawer.locator('select[name="passTemplateId"]').selectOption('pass-beginner-monthly')
  await memberDrawer.locator('input[name="paidAmount"]').fill('95000')
  await memberDrawer.locator('input[name="note"]').fill('오전반 신규')
  await page.getByRole('button', { name: '추가' }).click()
  await expect(page.locator('.memberLookupCard').filter({ hasText: '최하은' })).toBeVisible()

  // 새 수강권을 만들면 등록 회원 추가 폼의 수강권 목록에 즉시 반영되어야 한다
  const passDrawer = page.locator('details.formDrawer').filter({ hasText: '수강권 만들기' })
  await passDrawer.locator('summary').click()
  await passDrawer.locator('input[name="name"]').fill('야간 라틴 8회')
  await passDrawer.getByRole('button', { name: '수강권 저장' }).click()
  await expect(
    memberDrawer.locator('select[name="passTemplateId"] option', { hasText: '야간 라틴 8회' }),
  ).toHaveCount(1)
  await passDrawer.locator('summary').click()
  await page.locator('.memberLookupCard').filter({ hasText: '최하은' }).locator('.editMemberButton').click()
  await expect(page.getByText('₩95,000').first()).toBeVisible()
  await page.locator('.memberLookupCard').filter({ hasText: '최하은' }).locator('textarea[name="note"]').fill('첫 상담 완료, 다음 주 등록 예정')
  await page.locator('.memberLookupCard').filter({ hasText: '최하은' }).getByRole('button', { name: '회원 정보 저장' }).click()
  await page.locator('.memberLookupCard').filter({ hasText: '최하은' }).locator('.editMemberButton').click()
  await expect(
    page.locator('.memberLookupFoot').filter({ hasText: '첫 상담 완료, 다음 주 등록 예정' }),
  ).toBeVisible()

  await page.getByRole('button', { name: '출석', exact: true }).click()
  const newMemberRow = page.locator('.attendanceRow').filter({ hasText: '최하은' })
  await expect(newMemberRow).toBeVisible()
  await newMemberRow.getByRole('button', { name: '출석', exact: true }).click()
  await expect(newMemberRow.getByText('출석 완료')).toBeVisible()
  const statRow = page.locator('.memberStatRow').filter({ hasText: '최하은' })
  await expect(statRow.locator('.statChips .ok')).toHaveText('출석 1')

  // 다음 결제일이 지나면 자동으로 미납 표시
  await page.getByRole('button', { name: '결제', exact: true }).click()
  const paymentCard = page.locator('.paymentCard').filter({ hasText: '최하은' })
  await paymentCard.locator('details.paymentEditor summary').click()
  await paymentCard.locator('input[name="nextPaymentDue"]').fill('2026-01-01')
  await paymentCard.locator('input[name="passUntil"]').fill('2026-01-01')
  await paymentCard.getByRole('button', { name: '저장' }).click()
  await expect(paymentCard.locator('b.unpaid')).toHaveText('미납')

  // 재결제 원클릭: 미납 → 완납, 결제일 갱신, 수납 내역 기록
  await paymentCard.getByRole('button', { name: '재결제 받음 (완납 처리)' }).click()
  await expect(paymentCard.locator('b.paid')).toHaveText('완납')
  await expect(
    page.locator('.paymentLogRow').filter({ hasText: '최하은' }).first(),
  ).toBeVisible()

  // 상담 → 등록 회원 전환
  await page.getByRole('button', { name: '상담', exact: true }).click()
  await page
    .locator('.consultCard')
    .filter({ hasText: '정수진' })
    .getByRole('button', { name: '등록 회원으로 전환' })
    .click()
  await expect(page.locator('.memberLookupCard').filter({ hasText: '정수진' })).toBeVisible()

  // 미체크 회원 전체 출석 처리
  await page.getByRole('button', { name: '출석', exact: true }).click()
  await page.getByRole('button', { name: /전체 출석 처리/ }).click()
  await expect(page.getByText('미체크 0')).toBeVisible()

  // 회원별 날짜별 출석 이력 조회
  const historyRow = page.locator('.memberStatRow').filter({ hasText: '김미영' })
  await historyRow.locator('details.historyDetails summary').click()
  await expect(historyRow.locator('.historyDetails li').first()).toBeVisible()

  // 홈의 오늘 수업을 탭하면 해당 수업 출석부로 바로 이동
  await page.getByRole('button', { name: '홈', exact: true }).click()
  await page.locator('button.rowItem').first().click()
  await expect(page.getByRole('heading', { name: '출석 체크' })).toBeVisible()

  // 시간표 출석 체크: 출석/결석 선택 후 확인을 눌러야 확정
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  const timeCard = page.locator('.timeClassCard').filter({ hasText: '초급 라인댄스' }).first()
  await timeCard.getByRole('button', { name: /출석 체크/ }).click()
  await timeCard
    .locator('.draftRow')
    .filter({ hasText: '박선희' })
    .getByRole('button', { name: '결석' })
    .click()
  await timeCard.getByRole('button', { name: '확인' }).click()
  await expect(timeCard.getByRole('button', { name: /출석 체크/ })).toBeVisible()
})

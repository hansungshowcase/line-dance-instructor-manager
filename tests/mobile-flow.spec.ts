import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test.beforeEach(async ({ page }) => {
  page.on('dialog', (dialog) => dialog.accept())
  // 실사용 배포는 빈 상태로 시작하므로, 테스트는 ?demo 모드의 샘플 데이터를 사용한다
  await page.goto('./?demo')
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

  // 수강권 편집에서 수강료를 바꾸면 연결된 수업에 바로 반영된다
  await page.getByRole('button', { name: '회원', exact: true }).click()
  const manageDrawer = page.locator('details.formDrawer').filter({ hasText: '만든 수강권 관리' })
  await page.getByRole('button', { name: '수강권 관리', exact: true }).click()
  const passEditor = manageDrawer
    .locator('details.classEditor')
    .filter({ hasText: '초급 라인댄스 월수강권' })
  await passEditor.locator('summary').click()
  await passEditor.locator('input[name="tuitionFee"]').fill('95000')
  await passEditor.getByRole('button', { name: '저장', exact: true }).click()
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  await expect(page.getByText('₩95,000').first()).toBeVisible()

  await page.getByRole('button', { name: '회원', exact: true }).click()
  const memberDrawer = page.locator('details.formDrawer').filter({ hasText: '등록 회원 추가' })
  await page.getByRole('button', { name: '회원 등록', exact: true }).click()
  await page.getByPlaceholder('회원 이름').fill('최하은')
  await memberDrawer.getByPlaceholder('010-0000-0000').fill('01055551212')
  // 수강권을 고르면 수업이 자동 배정된다
  await memberDrawer.locator('select[name="passTemplateId"]').selectOption('pass-beginner-monthly')
    await memberDrawer.locator('input[name="note"]').fill('오전반 신규')
  await page.getByRole('button', { name: '추가' }).click()
  const choiCard = page.locator('.memberLookupCard').filter({ hasText: '최하은' })
  await expect(choiCard).toBeVisible()
  await expect(choiCard.getByRole('link', { name: /010-5555-1212/ })).toBeVisible()

  // 새 수강권을 만들면 등록 회원 추가 폼의 수강권 목록에 즉시 반영되어야 한다
  const passDrawer = page.locator('details.formDrawer').filter({ hasText: '수강권 만들기' })
  await page.getByRole('button', { name: '수강권 만들기', exact: true }).click()
  await passDrawer.locator('input[name="name"]').fill('야간 라틴 8회')
  await passDrawer.getByRole('button', { name: '수강권 저장' }).click()
  await expect(
    memberDrawer.locator('select[name="passTemplateId"] option', { hasText: '야간 라틴 8회' }),
  ).toHaveCount(1)
  await page.getByRole('button', { name: '수강권 만들기', exact: true }).click()
  // 카드를 탭하면 상세가 펼쳐진다
  await page
    .locator('.memberLookupCard')
    .filter({ hasText: '최하은' })
    .locator('.memberCardHint')
    .click()
  await page.locator('.memberLookupCard').filter({ hasText: '최하은' }).locator('.editMemberButton').click()
  await expect(page.getByText('₩95,000').first()).toBeVisible()
  await page.locator('.memberLookupCard').filter({ hasText: '최하은' }).locator('textarea[name="note"]').fill('첫 상담 완료, 다음 주 등록 예정')
  await page
    .locator('.memberLookupCard')
    .filter({ hasText: '최하은' })
    .locator('form')
    .filter({ hasText: '기본 정보' })
    .getByRole('button', { name: '저장', exact: true })
    .click()
  await page.locator('.memberLookupCard').filter({ hasText: '최하은' }).locator('.editMemberButton').click()
  await expect(
    page.locator('.memberLookupFoot').filter({ hasText: '첫 상담 완료, 다음 주 등록 예정' }),
  ).toBeVisible()

  await page.getByRole('button', { name: '출석', exact: true }).click()
  await page.getByRole('button', { name: '초급 라인댄스 월수강권', exact: true }).click()
  const newMemberRow = page.locator('.attendanceRow').filter({ hasText: '최하은' })
  await expect(newMemberRow).toBeVisible()
  await newMemberRow.getByRole('button', { name: '출석', exact: true }).click()
  await expect(newMemberRow.getByText('출석 완료')).toBeVisible()
  const statRow = page.locator('.memberStatRow').filter({ hasText: '최하은' })
  await expect(statRow.locator('.statChips .ok')).toHaveText('출석 1')

  // 다음 결제일이 지나면 자동으로 미납 표시
  await page.getByRole('button', { name: '결제', exact: true }).click()
  const paymentCard = page.locator('.paymentCard').filter({ hasText: '최하은' })
  // 수강권 상세는 접혀 있으므로 먼저 펼친다
  await paymentCard.locator('details.enrollPayBlock summary').first().click()
  await paymentCard.getByRole('button', { name: '결제 정보 수정' }).click()
  await paymentCard.locator('input[name="nextPaymentDue"]').fill('2026-01-01')
  await paymentCard.getByRole('button', { name: '저장' }).click()
  await expect(paymentCard.locator('b.unpaid')).toHaveText('미납')

  // 재결제 원클릭: 미납 → 완납, 결제일 갱신, 수납 내역 기록
  await paymentCard.getByRole('button', { name: '재결제 받음 (완납 처리)' }).click()
  await expect(paymentCard.locator('b.paid')).toHaveText('완납')
  await expect(
    page.locator('.paymentLogRow').filter({ hasText: '최하은' }).first(),
  ).toBeVisible()

  // 상담 → 등록 회원 전환 (상담 탭 안에서 수강권 선택까지 완료)
  await page.getByRole('button', { name: '상담', exact: true }).click()
  const consultCard = page.locator('.consultCard').filter({ hasText: '정수진' })
  await consultCard.locator('summary').click()
  await consultCard.getByRole('button', { name: '등록 회원으로 전환' }).click()
  await consultCard.locator('select').selectOption('pass-beginner-monthly')
  await consultCard.getByRole('button', { name: '전환 완료' }).click()
  await page.getByRole('button', { name: '회원', exact: true }).click()
  await expect(page.locator('.memberLookupCard').filter({ hasText: '정수진' })).toBeVisible()

  // 미체크 회원 전체 출석 처리
  await page.getByRole('button', { name: '출석', exact: true }).click()
  await page.getByRole('button', { name: /전체 출석 처리/ }).click()
  await expect(page.getByText('미체크 0')).toBeVisible()

  // 회원별 날짜별 출석 이력 조회 (카드 펼침 → 이력 펼침)
  const historyRow = page.locator('.memberStatRow').filter({ hasText: '김미영' })
  await historyRow.locator('summary.statSummary').click()
  await historyRow.locator('details.historyDetails summary').click()
  await expect(historyRow.locator('.historyDetails li').first()).toBeVisible()

  // 홈의 오늘 수업을 탭하면 시간표의 해당 수업으로 이동
  await page.getByRole('button', { name: '홈', exact: true }).click()
  await page.locator('button.rowItem').first().click()
  await expect(page.getByText('10시 이후 시간대별 보기')).toBeVisible()

  // 시간표 출석 체크: 출석/결석 선택 후 확인을 눌러야 확정
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  const timeCard = page.locator('.timeClassCard').filter({ hasText: '초급 라인댄스' }).first()
  await timeCard.getByRole('button', { name: /출석 (체크|수정)/ }).click()
  await timeCard
    .locator('.draftRow')
    .filter({ hasText: '김미영' })
    .getByRole('button', { name: '결석' })
    .click()
  await timeCard.getByRole('button', { name: '확인' }).click()
  await expect(timeCard.getByRole('button', { name: /출석 (체크|수정)/ })).toBeVisible()
})

test('gig end-time & edit, private lesson quick-add rules, custom waitlist classes', async ({
  page,
}) => {
  // ── 내 스케줄(외부 강의): 종료 시간을 지정해서 추가
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  await page.getByRole('button', { name: '+ 내 스케줄(외부 강의) 추가' }).click()
  const gigForm = page.locator('.timeClassCard.gigCard')
  await gigForm.getByPlaceholder('예: 문화센터 출강').fill('구민회관 특강')
  await gigForm.locator('input[type="time"]').first().fill('15:00')
  await gigForm.locator('input[type="time"]').nth(1).fill('16:20')
  await gigForm.getByRole('button', { name: '스케줄 추가', exact: true }).click()
  const gigCard = page.locator('.gigCard').filter({ hasText: '구민회관 특강' })
  await expect(gigCard.getByText('15:00 - 16:20')).toBeVisible()

  // ── 내 스케줄 수정: 이름·종료 시간 변경
  await gigCard.getByRole('button', { name: '수정', exact: true }).click()
  await gigCard.getByPlaceholder('예: 문화센터 출강').fill('구민회관 저녁 특강')
  await gigCard.locator('input[type="time"]').nth(1).fill('16:40')
  await gigCard.getByRole('button', { name: '저장', exact: true }).click()
  await expect(
    page.locator('.gigCard').filter({ hasText: '구민회관 저녁 특강' }).getByText('15:00 - 16:40'),
  ).toBeVisible()

  // ── 개인레슨 바로 추가: 개인레슨 수강권 보유자(이정아)만 목록에 뜬다
  await page.getByRole('button', { name: '+ 이 날짜에 수업·개인레슨 바로 추가' }).click()
  await expect(page.locator('.pickRow')).toHaveCount(1)
  await page.locator('.pickRow').filter({ hasText: '이정아' }).click()
  await page.getByRole('button', { name: /1명 레슨 만들기/ }).click()
  const privateCard = page.locator('.timeClassCard').filter({ hasText: '이정아 개인레슨' })
  await expect(privateCard).toBeVisible()
  await expect(privateCard.getByRole('button', { name: /출석/ })).toHaveCount(0)

  await page.getByRole('button', { name: '출석', exact: true }).click()
  await page.getByRole('tab', { name: '개인레슨' }).click()
  await page.getByRole('button', { name: '개인레슨 10회권', exact: true }).click()
  await page.getByRole('button', { name: '이정아', exact: true }).click()
  const lessonRow = page.locator('.attendanceRow').filter({ hasText: '이정아' })
  await expect(lessonRow.getByText(/자동 차감 예정/)).toBeVisible()
  await expect(lessonRow.getByRole('button', { name: '출석', exact: true })).toHaveCount(0)

  // ── 시간표에서 레슨을 삭제하면 출석 기록이 없던 일이 되고 잔여도 8회로 복구된다
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  await privateCard.getByRole('button', { name: '수업 시간 변경·삭제' }).click()
  await privateCard.getByRole('button', { name: '삭제', exact: true }).click()
  await expect(privateCard).toHaveCount(0)
  await page.getByRole('button', { name: '출석', exact: true }).click()
  const leeStat = page.locator('.memberStatRow').filter({ hasText: '이정아' })
  await leeStat.locator('summary.statSummary').click()
  await expect(
    leeStat.locator('.statPassLine').filter({ hasText: '개인레슨 10회권' }).locator('b'),
  ).toHaveText('잔여 8/10회')

  await page.getByRole('tab', { name: '라인댄스 단체반' }).click()
  await page.getByRole('button', { name: '초급 라인댄스 월수강권', exact: true }).click()
  let checkedDates = 0
  for (let monthOffset = 0; monthOffset < 4 && checkedDates < 12; monthOffset++) {
    const monthDates = page.locator('.attendanceDateGrid button')
    const count = await monthDates.count()
    for (let index = 0; index < count && checkedDates < 12; index++) {
      await monthDates.nth(index).click()
      const kimRow = page.locator('.attendanceRow').filter({ hasText: '김미영' })
      await kimRow.getByRole('button', { name: '출석', exact: true }).click()
      checkedDates += 1
    }
    if (checkedDates < 12) await page.getByRole('button', { name: '다음 달' }).click()
  }
  expect(checkedDates).toBe(12)
  const kimStat = page.locator('.memberStatRow').filter({ hasText: '김미영' })
  await kimStat.locator('summary.statSummary').click()
  await kimStat.locator('details.historyDetails summary').click()
  await expect(kimStat.locator('.historyDetails li')).toHaveCount(10)
  await kimStat.getByRole('button', { name: /10개 더 보기/ }).click()
  await expect(kimStat.locator('.historyDetails li')).toHaveCount(12)

  // ── 결제 탭 재무 현황: 총 수입 히어로 + 받아야 할 회비 목록 (박선희가 미납)
  await page.getByRole('button', { name: '결제', exact: true }).click()
  await expect(page.getByText('이번 달 총수입')).toBeVisible()
  await expect(page.getByRole('heading', { name: '받아야 할 회비' })).toBeVisible()
  const dueRow = page.locator('.dueRow').filter({ hasText: '박선희' })
  await expect(dueRow).toBeVisible()
  await expect(page.getByRole('heading', { name: '월별 수입' })).toBeVisible()

  // 수납 기록 개별 삭제: 잘못 잡힌 매출을 ✕로 지울 수 있다 (데모 시드 3건 → 2건)
  await page.getByRole('button', { name: '전체', exact: true }).click()
  const paymentLogPanel = page.locator('section.panel').filter({ hasText: '수납 내역' })
  const logRows = paymentLogPanel.locator('.paymentLogRow')
  await expect(logRows).toHaveCount(3)
  await logRows.first().locator('.paymentLogDelete').click()
  await expect(logRows).toHaveCount(2)

  // 결제 정보 수정에서 결제일을 바꾸면 기록이 '이동'하고 중복 추가되지 않는다
  const kimPay = page.locator('.paymentCard').filter({ hasText: '김미영' })
  await kimPay.locator('details.enrollPayBlock summary').first().click()
  await kimPay.getByRole('button', { name: '결제 정보 수정' }).click()
  const movedDate = new Date()
  movedDate.setDate(movedDate.getDate() - 5)
  const movedDateKey = `${movedDate.getFullYear()}-${String(movedDate.getMonth() + 1).padStart(2, '0')}-${String(movedDate.getDate()).padStart(2, '0')}`
  await kimPay.locator('input[name="lastPaidAt"]').fill(movedDateKey)
  await kimPay.getByRole('button', { name: '저장' }).click()
  await expect(logRows).toHaveCount(2)

  // ── 대기 현황: 수강권과 별개인 대기 수업을 직접 만든다
  await page.getByRole('button', { name: '상담', exact: true }).click()
  await page.getByRole('button', { name: '+ 대기 수업 추가' }).click()
  await page.getByPlaceholder('예: 토요일 초급반').fill('토요 왕초보반')
  await page.locator('.waitClassForm input[type="number"]').fill('2')
  await page.locator('.waitClassForm').getByRole('button', { name: '추가', exact: true }).click()
  const waitGroup = page.locator('.waitGroup').filter({ hasText: '토요 왕초보반' })
  await expect(waitGroup.getByText('0/2명')).toBeVisible()

  // ── 상담 등록: 관심 수업 항목은 없고, '현재 대기'를 고르면 대기 수업 목록이 뜬다
  const consultDrawer = page.locator('details.formDrawer').filter({ hasText: '상담 등록' })
  await consultDrawer.locator('summary').click()
  await expect(consultDrawer.getByText('관심 수업 종류')).toHaveCount(0)
  await consultDrawer.getByPlaceholder('상담 회원 이름').fill('한지원')
  await consultDrawer.getByPlaceholder('010-0000-0000').fill('010-1234-9999')
  await consultDrawer.locator('select[name="status"]').selectOption('waitlist')
  await consultDrawer.locator('select[name="interest"]').selectOption('토요 왕초보반')
  await consultDrawer.getByRole('button', { name: '추가', exact: true }).click()
  await expect(waitGroup.getByText('1/2명')).toBeVisible()
  await expect(waitGroup.locator('.waitNameChip').filter({ hasText: '한지원' })).toBeVisible()
})

test('deleting a pass removes its classes from the timetable and pickers', async ({ page }) => {
  // 삭제 전: 시간표와 출석 수업 선택에 초급 라인댄스가 있다
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  await expect(
    page.locator('.timeClassCard').filter({ hasText: '초급 라인댄스' }),
  ).toHaveCount(1)

  // 만든 수강권 관리에서 초급 수강권 삭제
  await page.getByRole('button', { name: '회원', exact: true }).click()
  const manageDrawer = page.locator('details.formDrawer').filter({ hasText: '만든 수강권 관리' })
  await page.getByRole('button', { name: '수강권 관리', exact: true }).click()
  const passEditor = manageDrawer
    .locator('details.classEditor')
    .filter({ hasText: '초급 라인댄스 월수강권' })
  await passEditor.locator('summary').click()
  await passEditor.getByRole('button', { name: '삭제', exact: true }).click()

  // 시간표에서 사라진다
  await page.getByRole('button', { name: '시간표', exact: true }).click()
  await expect(
    page.locator('.timeClassCard').filter({ hasText: '초급 라인댄스' }),
  ).toHaveCount(0)

  // 출석 탭 수업 선택란에서도 사라진다
  await page.getByRole('button', { name: '출석', exact: true }).click()
  await expect(page.getByRole('button', { name: '초급 라인댄스 월수강권', exact: true })).toHaveCount(0)
})

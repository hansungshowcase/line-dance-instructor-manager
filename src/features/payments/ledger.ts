export type PaymentSourceRef =
  | {
      readonly kind: 'member'
      readonly memberId: string
      readonly enrollmentId: string
      readonly paymentIndex: number
    }
  | { readonly kind: 'archive'; readonly index: number }

export type PaymentLedgerRow = {
  readonly amount: number
  readonly classNames: readonly string[]
  readonly date: string
  readonly memberName: string
  readonly passName: string
  readonly ref: PaymentSourceRef
  readonly sourceOrder: number
}

type LedgerClass = {
  readonly id: string
  readonly name: string
}

type LedgerPayment = {
  readonly amount: number
  readonly date: string
}

type LedgerEnrollment = {
  readonly classIds: readonly string[]
  readonly id: string
  readonly passName: string
  readonly payments: readonly LedgerPayment[]
}

type LedgerMember = {
  readonly enrollments: readonly LedgerEnrollment[]
  readonly id: string
  readonly name: string
}

type LedgerArchivePayment = LedgerPayment & {
  readonly classNames?: readonly string[]
  readonly memberName: string
  readonly passName: string
}

type IncomeGig = {
  readonly date: string
  readonly fee: number
}

export type IncomeSummary = {
  readonly futureScheduledTotal: number
  readonly monthGigTotal: number
  readonly monthPaymentTotal: number
  readonly yearActualTotal: number
  readonly yearGigTotal: number
  readonly yearPaymentTotal: number
}

function fallbackClassNames(passName: string): readonly string[] {
  return passName.includes('개인') ? ['개인레슨'] : ['수업 정보 없음']
}

export function buildPaymentLedger(
  members: readonly LedgerMember[],
  paymentArchive: readonly LedgerArchivePayment[],
  classes: readonly LedgerClass[],
): readonly PaymentLedgerRow[] {
  const classNamesById = new Map(classes.map((danceClass) => [danceClass.id, danceClass.name]))
  const rows: PaymentLedgerRow[] = []
  let sourceOrder = 0

  for (const member of members) {
    for (const enrollment of member.enrollments) {
      const mappedClassNames = enrollment.classIds.flatMap((classId) => {
        const className = classNamesById.get(classId)
        return className ? [className] : []
      })
      const classNames = mappedClassNames.length
        ? [...new Set(mappedClassNames)]
        : fallbackClassNames(enrollment.passName)
      for (const [paymentIndex, payment] of enrollment.payments.entries()) {
        rows.push({
          ...payment,
          classNames,
          memberName: member.name,
          passName: enrollment.passName,
          ref: {
            kind: 'member',
            memberId: member.id,
            enrollmentId: enrollment.id,
            paymentIndex,
          },
          sourceOrder,
        })
        sourceOrder += 1
      }
    }
  }

  paymentArchive.forEach((payment, index) => {
    rows.push({
      ...payment,
      classNames:
        payment.classNames?.filter((className) => className.trim().length > 0) ??
        fallbackClassNames(payment.passName),
      ref: { kind: 'archive', index },
      sourceOrder,
    })
    sourceOrder += 1
  })

  return rows.sort(
    (left, right) =>
      right.date.localeCompare(left.date) || right.sourceOrder - left.sourceOrder,
  )
}

export function calculateIncomeSummary(
  rows: readonly PaymentLedgerRow[],
  gigs: readonly IncomeGig[],
  todayKey: string,
): IncomeSummary {
  const monthKey = todayKey.slice(0, 7)
  const yearKey = todayKey.slice(0, 4)
  const receivedRows = rows.filter((row) => row.date <= todayKey)
  const completedGigs = gigs.filter((gig) => gig.date <= todayKey)
  const futureGigs = gigs.filter((gig) => gig.date > todayKey)
  const monthPaymentTotal = receivedRows
    .filter((row) => row.date.startsWith(monthKey))
    .reduce((sum, row) => sum + row.amount, 0)
  const monthGigTotal = completedGigs
    .filter((gig) => gig.date.startsWith(monthKey))
    .reduce((sum, gig) => sum + gig.fee, 0)
  const yearPaymentTotal = receivedRows
    .filter((row) => row.date.startsWith(yearKey))
    .reduce((sum, row) => sum + row.amount, 0)
  const yearGigTotal = completedGigs
    .filter((gig) => gig.date.startsWith(yearKey))
    .reduce((sum, gig) => sum + gig.fee, 0)

  return {
    futureScheduledTotal: futureGigs.reduce((sum, gig) => sum + gig.fee, 0),
    monthGigTotal,
    monthPaymentTotal,
    yearActualTotal: yearPaymentTotal + yearGigTotal,
    yearGigTotal,
    yearPaymentTotal,
  }
}

export type PrivateLessonCharge = {
  readonly classId: string
  readonly enrollmentId: string
  readonly memberId: string
}

export type PrivateLessonChargeBook = Record<string, PrivateLessonCharge>

type ChargeClass = {
  readonly date?: string
  readonly id: string
  readonly location: string
}

type ChargeEnrollment = {
  readonly classIds: readonly string[]
  readonly id: string
  readonly totalCredits: number
}

type ChargeMember = {
  readonly enrollments: readonly ChargeEnrollment[]
  readonly id: string
}

export type PrivateLessonCreditChange = {
  readonly enrollmentId: string
  readonly memberId: string
}

export function privateLessonChargeKey(classId: string, memberId: string): string {
  return `${classId}|${memberId}`
}

function isPrivateLesson(danceClass: ChargeClass): boolean {
  return Boolean(danceClass.date) && danceClass.location === '개인레슨'
}

export function reconcilePrivateLessonCharges(input: {
  readonly attendance: Readonly<Record<string, string>>
  readonly charges: PrivateLessonChargeBook
  readonly classes: readonly ChargeClass[]
  readonly members: readonly ChargeMember[]
  readonly todayKey: string
}): {
  readonly charges: PrivateLessonChargeBook
  readonly changed: boolean
  readonly deductions: readonly PrivateLessonCreditChange[]
} {
  let changed = false
  const charges: PrivateLessonChargeBook = { ...input.charges }
  const deductions: PrivateLessonCreditChange[] = []

  for (const danceClass of input.classes) {
    if (!isPrivateLesson(danceClass) || !danceClass.date || danceClass.date >= input.todayKey) continue
    for (const member of input.members) {
      const key = privateLessonChargeKey(danceClass.id, member.id)
      if (charges[key]) continue
      const enrollment = member.enrollments.find(
        (item) => item.totalCredits > 0 && item.classIds.includes(danceClass.id),
      )
      if (!enrollment) continue
      const legacyStatus = input.attendance[`${danceClass.date}|${danceClass.id}|${member.id}`]
      const wasAlreadyDeducted = legacyStatus === 'present' || legacyStatus === 'makeup'
      if (!wasAlreadyDeducted) {
        deductions.push({ enrollmentId: enrollment.id, memberId: member.id })
      }
      charges[key] = {
        classId: danceClass.id,
        enrollmentId: enrollment.id,
        memberId: member.id,
      }
      changed = true
    }
  }

  return { charges, changed, deductions }
}

export function refundPrivateLessonCharges(input: {
  readonly charges: PrivateLessonChargeBook
  readonly classId: string
}): {
  readonly charges: PrivateLessonChargeBook
  readonly refunds: readonly PrivateLessonCreditChange[]
} {
  const refunds = Object.entries(input.charges).filter(
    ([, charge]) => charge.classId === input.classId,
  )
  if (!refunds.length) return { charges: input.charges, refunds: [] }
  const refundedKeys = new Set(refunds.map(([key]) => key))
  const charges = Object.fromEntries(
    Object.entries(input.charges).filter(([key]) => !refundedKeys.has(key)),
  )
  return {
    charges,
    refunds: refunds.map(([, charge]) => ({
      enrollmentId: charge.enrollmentId,
      memberId: charge.memberId,
    })),
  }
}

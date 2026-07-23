import {
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Download,
  Home,
  MapPin,
  MessageCircle,
  Phone,
  PhoneCall,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Users,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import './App.css'
import { firebaseReady } from './firebase'
import { datesForWeekdays, shiftMonth } from './features/attendance/date-options'
import {
  buildPaymentLedger,
  calculateIncomeSummary,
  type PaymentSourceRef,
} from './features/payments/ledger'
import {
  reconcilePrivateLessonCharges,
  refundPrivateLessonCharges,
  type PrivateLessonChargeBook,
} from './features/private-lessons/reconcile'
import { SmsComposer } from './features/sms/SmsComposer'
import { SmsTemplateSettings } from './features/sms/SmsTemplateSettings'
import {
  loadSmsTemplates,
  type SmsTemplate,
} from './features/sms/templates'
import { generateSyncCode, isValidSyncCode, pushSync, subscribeSync } from './sync'

type Tab = 'home' | 'schedule' | 'members' | 'consultations' | 'attendance' | 'payments'
type MemberStatus = 'active' | 'prospect' | 'waitlist'
type PaymentStatus = 'paid' | 'unpaid' | 'soon'
type AttendanceStatus = 'present' | 'absent' | 'makeup'
type LessonType = 'line_group' | 'latin_group' | 'private'

type DanceClass = {
  id: string
  name: string
  weekday: number
  startTime: string
  endTime: string
  location: string
  capacity: number
  tuitionFee: number
  level: string
  // 값이 있으면 매주 반복이 아니라 그 날짜 하루만 열리는 수업(개인레슨)
  date?: string
}

// 강사 개인의 외부 강의 스케줄 (회원 관리와 무관, 수입 집계용)
type Gig = {
  id: string
  date: string
  startTime: string
  endTime: string
  name: string
  fee: number
}

// 대기 현황 전용 수업 — 수강권·시간표와 완전히 별개인 임시 수업.
// 상담 등록에서 '현재 대기'를 고르면 이 목록에서 대기 수업을 선택한다.
type WaitlistClass = {
  id: string
  name: string
  capacity: number
}

type PassTemplate = {
  id: string
  type: LessonType
  name: string
  sessionCount: number
  startTime: string
  endTime: string
  weekdays: number[]
  capacity: number
  tuitionFee: number
  classIds: string[]
}

type PaymentRecord = {
  date: string
  amount: number
}

// 수강권·회원을 삭제해도 매출(정산) 기록은 지워지지 않도록 옮겨 담는 보존 장부
type ArchivedPayment = PaymentRecord & {
  memberName: string
  passName: string
  classNames?: string[]
}

// 회원이 보유한 수강권 1개 — 결제일·잔여횟수·결제내역이 수강권마다 독립적이다
type Enrollment = {
  id: string
  passName: string
  classIds: string[]
  remainingCredits: number
  totalCredits: number
  paidAmount: number
  lastPaidAt: string
  nextPaymentDue: string
  payments: PaymentRecord[]
}

type Member = {
  id: string
  name: string
  phone: string
  status: MemberStatus
  note: string
  consultedAt?: string
  interest?: string
  // 유입경로 (문자·전화·비즈니스 파트너 등)
  source?: string
  enrollments: Enrollment[]
}

type AttendanceBook = Record<string, AttendanceStatus>

type SyncStatus = 'off' | 'connecting' | 'live' | 'error'
type SyncControls = {
  ready: boolean
  demo: boolean
  code: string
  status: SyncStatus
  onStart: () => void
  onConnect: (code: string) => void
  onDisconnect: () => void
}

const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const today = new Date()
const todayKey = toDateKey(today)
// v4: 회원이 수강권을 여러 개 보유하는 구조 (v3 데이터는 자동 변환)
const storageKey = 'line-dance-manager-v3'
const backupKey = 'line-dance-backup-at'
const smsTemplateKey = 'line-dance-sms-templates'
// 기기 동기화 코드(연결된 경우)를 이 기기에 기억해 둔다
const syncCodeKey = 'line-dance-sync-code'
// 동기화 이력(미전송 편집 여부, 마지막 편집/동기화 시각)을 이 기기에 기억해 둔다
const syncMetaKey = 'line-dance-sync-meta'
// 기기 시계 오차 허용치: 이보다 더 오래된 원격 데이터만 '과거로의 회귀'로 판정한다
const clockSkewMs = 5 * 60 * 1000

type SyncMeta = {
  // 아직 서버에 확정 저장되지 못한 로컬 편집이 있는지 (탭이 닫혀도 기억되어 다음 접속 때 복구)
  dirty: boolean
  lastLocalEditAt: number
  lastSyncedAt: number
}

function loadSyncMeta(): SyncMeta {
  const fallback: SyncMeta = { dirty: false, lastLocalEditAt: 0, lastSyncedAt: 0 }
  if (isDemoMode) return fallback
  try {
    const raw = localStorage.getItem(syncMetaKey)
    if (!raw) return fallback
    const parsed = JSON.parse(raw) as Partial<SyncMeta>
    return {
      dirty: parsed.dirty === true,
      lastLocalEditAt: typeof parsed.lastLocalEditAt === 'number' ? parsed.lastLocalEditAt : 0,
      lastSyncedAt: typeof parsed.lastSyncedAt === 'number' ? parsed.lastSyncedAt : 0,
    }
  } catch {
    return fallback
  }
}

const startHour = 10
// 주소 뒤에 ?demo 를 붙였을 때만 연습용 샘플 데이터가 보인다
const isDemoMode =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')

function toDateKey(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function addDays(days: number) {
  const date = new Date()
  date.setDate(date.getDate() + days)
  return toDateKey(date)
}

function addMonthsFrom(dateKey: string, months: number) {
  const [year, month, day] = (dateKey || todayKey).split('-').map(Number)
  return toDateKey(new Date(year, month - 1 + months, day))
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`
}

function attendanceKey(date: string, classId: string, memberId: string) {
  return `${date}|${classId}|${memberId}`
}

function formatMonthDay(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}`
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('ko-KR', {
    currency: 'KRW',
    maximumFractionDigits: 0,
    style: 'currency',
  }).format(amount)
}

function daysUntil(dateKey: string) {
  if (!dateKey) return null
  return Math.ceil((new Date(dateKey).getTime() - today.getTime()) / 86400000)
}

// 수강권 상태 자동 판정: 횟수 소진/기간 경과 → 미납, 임박(7일·2회 이하) → 임박
function enrollmentStatus(enrollment: Enrollment): PaymentStatus {
  if (enrollment.totalCredits > 0 && enrollment.remainingCredits <= 0) return 'unpaid'
  if (!enrollment.nextPaymentDue) {
    if (enrollment.totalCredits > 0) {
      return enrollment.remainingCredits <= 2 ? 'soon' : 'paid'
    }
    return 'paid'
  }
  const daysLeft = daysUntil(enrollment.nextPaymentDue) ?? 0
  if (daysLeft < 0) return 'unpaid'
  if (daysLeft <= 7) return 'soon'
  return 'paid'
}

// 회원 대표 상태 = 보유 수강권 중 가장 급한 상태
function memberWorstStatus(member: Member): PaymentStatus {
  if (member.enrollments.some((e) => enrollmentStatus(e) === 'unpaid')) return 'unpaid'
  if (member.enrollments.some((e) => enrollmentStatus(e) === 'soon')) return 'soon'
  return 'paid'
}

function memberClassIds(member: Member) {
  return member.enrollments.flatMap((enrollment) => enrollment.classIds)
}

function enrollmentForClass(member: Member, classId: string) {
  return member.enrollments.find((enrollment) => enrollment.classIds.includes(classId))
}

function enrollmentSummaryLabel(enrollment: Enrollment) {
  if (enrollment.totalCredits > 0) {
    return enrollment.remainingCredits < 0
      ? `${-enrollment.remainingCredits}회 초과`
      : `잔여 ${enrollment.remainingCredits}/${enrollment.totalCredits}회`
  }
  const days = daysUntil(enrollment.nextPaymentDue)
  if (days === null) return '기간 없음'
  return days < 0 ? `${-days}일 지남` : `${days}일 남음`
}

function startOfWeek(date: Date) {
  const copy = new Date(date)
  const diff = copy.getDay() === 0 ? -6 : 1 - copy.getDay()
  copy.setDate(copy.getDate() + diff)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function getWeekDates(date: Date) {
  const start = startOfWeek(date)
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

function getMonthDates(date: Date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const start = new Date(first)
  start.setDate(first.getDate() - first.getDay())
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return day
  })
}

function hourFromTime(time: string) {
  return Number(time.split(':')[0] ?? startHour)
}

function minutesFromTime(time: string) {
  const [hour, minute] = time.split(':').map(Number)
  return (hour || 0) * 60 + (minute || 0)
}

function timeFromMinutes(totalMinutes: number) {
  const bounded = Math.max(0, Math.min(23 * 60 + 59, totalMinutes))
  return `${String(Math.floor(bounded / 60)).padStart(2, '0')}:${String(bounded % 60).padStart(2, '0')}`
}

// 'YYYY-MM-DD' 문자열의 요일 (시간대 문제를 피하려고 직접 파싱)
function weekdayOfDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split('-').map(Number)
  return new Date(year || 2026, (month || 1) - 1, day || 1).getDay()
}

// 개인레슨은 시간표에서 직접 관리하고, 수업 관리 목록에는 그룹 수업만 둔다
function isPrivateClass(danceClass: DanceClass) {
  return danceClass.location === '개인레슨' || danceClass.name.includes('개인레슨')
}

// 회원 탭 도구 서랍(수강권 만들기·관리·회원 등록)은 한 번에 하나만 펼친다
const memberToolDrawerIds = ['drawer-pass', 'drawer-pass-manage', 'drawer-member'] as const
function toggleMemberTool(id: (typeof memberToolDrawerIds)[number]) {
  for (const drawerId of memberToolDrawerIds) {
    const drawer = document.getElementById(drawerId) as HTMLDetailsElement | null
    if (!drawer) continue
    if (drawerId === id) {
      drawer.open = !drawer.open
      if (drawer.open) drawer.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } else {
      drawer.open = false
    }
  }
}

// 수강권을 삭제한 뒤 시간표에 남은 흔적 수업을 걷어낸다.
// 같은 이름의 수강권이 없고 배정 회원도 없는 그룹 수업은 출석할 방법이 없는 죽은
// 데이터다 (삭제 연동이 없던 예전 버전이 남긴 것). 로컬 로드·백업 복원·원격 수신
// 모든 경로에 적용해, 어떤 기기가 옛 데이터를 다시 올려도 결국 청소된 상태로 수렴한다.
// 한 수업이 같은 회원의 여러 수강권에 중복 소속되면 출석 차감이 먼저 걸리는
// 수강권에서 일어나 잔여 횟수가 엉킨다. 수업 이름과 같은 이름의 수강권이 있으면
// 그 수강권이 주인이고, 없으면 먼저 나온 수강권만 유지한다.
function dedupeClassOwnership(members: Member[], classes: DanceClass[]): Member[] {
  const classNameById = new Map(classes.map((danceClass) => [danceClass.id, danceClass.name]))
  return members.map((member) => {
    const counts = new Map<string, number>()
    for (const enrollment of member.enrollments)
      for (const id of enrollment.classIds) counts.set(id, (counts.get(id) ?? 0) + 1)
    if (![...counts.values()].some((count) => count > 1)) return member
    const claimed = new Set<string>()
    return {
      ...member,
      enrollments: member.enrollments.map((enrollment) => ({
        ...enrollment,
        classIds: enrollment.classIds.filter((id) => {
          if ((counts.get(id) ?? 0) <= 1) return true
          const className = classNameById.get(id)
          const nameOwner = member.enrollments.find(
            (candidate) =>
              candidate.passName === className && candidate.classIds.includes(id),
          )
          if (nameOwner) return nameOwner.id === enrollment.id
          if (claimed.has(id)) return false
          claimed.add(id)
          return true
        }),
      })),
    }
  })
}

function sweepOrphanClasses(
  classes: DanceClass[],
  members: Member[],
  passTemplates: PassTemplate[],
): DanceClass[] {
  const passNames = new Set(passTemplates.map((pass) => pass.name))
  const assignedClassIds = new Set<string>()
  for (const member of members)
    for (const enrollment of member.enrollments)
      for (const id of enrollment.classIds) assignedClassIds.add(id)
  return classes.filter(
    (danceClass) =>
      isPrivateClass(danceClass) ||
      passNames.has(danceClass.name) ||
      assignedClassIds.has(danceClass.id),
  )
}

// 대한민국 공휴일 — 2026년은 대체공휴일 포함, 그 외 연도는 양력 고정 공휴일만
const KR_HOLIDAYS_2026 = new Set([
  '2026-01-01',
  '2026-02-16',
  '2026-02-17',
  '2026-02-18',
  '2026-03-01',
  '2026-03-02',
  '2026-05-05',
  '2026-05-24',
  '2026-05-25',
  '2026-06-03',
  '2026-06-06',
  '2026-07-17',
  '2026-08-15',
  '2026-08-17',
  '2026-09-24',
  '2026-09-25',
  '2026-09-26',
  '2026-09-28',
  '2026-10-03',
  '2026-10-05',
  '2026-10-09',
  '2026-12-25',
])
const KR_FIXED_HOLIDAYS = new Set([
  '01-01',
  '03-01',
  '05-05',
  '06-06',
  '07-17', // 제헌절 — 2026년부터 공휴일 재지정 (18년 만에 부활, 대체공휴일 적용)
  '08-15',
  '10-03',
  '10-09',
  '12-25',
])

// 인터넷 공휴일 API(Nager.Date)에서 받아 보강한 날짜들 (localStorage 캐시에서 즉시 복원).
// 법이 바뀌어 공휴일이 늘거나 대체공휴일이 생겨도 자동으로 따라온다.
// 오프라인이거나 API가 죽어도 위 내장 목록만으로 동작하므로 앱은 항상 뜬다.
const holidayCacheKey = 'line-dance-holiday-cache-v1'
const fetchedHolidays = new Set<string>()
try {
  const cached = JSON.parse(localStorage.getItem(holidayCacheKey) ?? 'null') as {
    dates?: string[]
  } | null
  for (const date of cached?.dates ?? []) fetchedHolidays.add(date)
} catch {
  // 캐시가 깨졌으면 내장 목록으로만 동작
}

function isHoliday(dateKey: string) {
  return (
    KR_HOLIDAYS_2026.has(dateKey) ||
    KR_FIXED_HOLIDAYS.has(dateKey.slice(5)) ||
    fetchedHolidays.has(dateKey)
  )
}

// 그 날짜에 열리는 수업: 매주 반복 수업 + 그 날짜 전용(1회성) 수업
function classesOnDate(allClasses: DanceClass[], date: Date) {
  const dateKey = toDateKey(date)
  return allClasses.filter((danceClass) =>
    danceClass.date ? danceClass.date === dateKey : danceClass.weekday === date.getDay(),
  )
}

function smsHref(phone: string, body: string) {
  const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`
}

// 수강권에서 새 등록(Enrollment)을 만든다: 그룹 3개월 유효, 개인레슨은 기간 없음
function enrollmentFromPass(pass: PassTemplate): Enrollment {
  return {
    id: makeId('enr'),
    passName: pass.name,
    classIds: [...pass.classIds],
    remainingCredits: pass.sessionCount,
    totalCredits: pass.sessionCount,
    paidAmount: pass.tuitionFee,
    lastPaidAt: todayKey,
    nextPaymentDue: pass.type === 'private' ? '' : addMonthsFrom(todayKey, 3),
    payments: pass.tuitionFee > 0 ? [{ amount: pass.tuitionFee, date: todayKey }] : [],
  }
}

const seedClasses: DanceClass[] = [
  {
    id: 'class-beginner-mon',
    name: '초급 라인댄스',
    weekday: today.getDay(),
    startTime: '10:00',
    endTime: '10:50',
    location: '문화센터 2층',
    capacity: 16,
    tuitionFee: 90000,
    level: '초급',
  },
  {
    id: 'class-intermediate-evening',
    name: '중급 라인댄스',
    weekday: (today.getDay() + 2) % 7,
    startTime: '19:30',
    endTime: '20:30',
    location: '스튜디오 A',
    capacity: 18,
    tuitionFee: 120000,
    level: '중급',
  },
  {
    id: 'class-practice-sat',
    name: '작품 연습반',
    weekday: 6,
    startTime: '13:00',
    endTime: '14:10',
    location: '연습실 B',
    capacity: 12,
    tuitionFee: 70000,
    level: '전체',
  },
]

const seedPassTemplates: PassTemplate[] = [
  {
    id: 'pass-beginner-monthly',
    type: 'line_group',
    name: '초급 라인댄스 월수강권',
    sessionCount: 8,
    startTime: '10:00',
    endTime: '10:50',
    weekdays: [today.getDay()],
    capacity: 16,
    tuitionFee: 90000,
    classIds: ['class-beginner-mon'],
  },
  {
    id: 'pass-private-10',
    type: 'private',
    name: '개인레슨 10회권',
    sessionCount: 10,
    startTime: '14:00',
    endTime: '14:50',
    weekdays: [2],
    capacity: 1,
    tuitionFee: 350000,
    classIds: [],
  },
]

const seedMembers: Member[] = [
  {
    id: 'member-kim',
    name: '김미영',
    phone: '010-2345-1100',
    status: 'active',
    note: '무릎 무리 금지',
    enrollments: [
      {
        id: 'enr-kim-1',
        passName: '초급 라인댄스 월수강권',
        classIds: ['class-beginner-mon'],
        remainingCredits: 0,
        totalCredits: 0,
        paidAmount: 90000,
        lastPaidAt: addDays(-21),
        nextPaymentDue: addDays(9),
        payments: [{ amount: 90000, date: addDays(-21) }],
      },
    ],
  },
  {
    id: 'member-lee',
    name: '이정아',
    phone: '010-8821-3344',
    status: 'active',
    note: '댄스스포츠 경험 있음',
    enrollments: [
      {
        id: 'enr-lee-1',
        passName: '중급 라인댄스 10회권',
        classIds: ['class-intermediate-evening'],
        remainingCredits: 3,
        totalCredits: 10,
        paidAmount: 120000,
        lastPaidAt: addDays(-18),
        nextPaymentDue: addDays(21),
        payments: [{ amount: 120000, date: addDays(-18) }],
      },
      {
        id: 'enr-lee-2',
        passName: '개인레슨 10회권',
        classIds: [],
        remainingCredits: 8,
        totalCredits: 10,
        paidAmount: 350000,
        lastPaidAt: addDays(-10),
        nextPaymentDue: '',
        payments: [{ amount: 350000, date: addDays(-10) }],
      },
    ],
  },
  {
    id: 'member-park',
    name: '박선희',
    phone: '010-7199-2477',
    status: 'active',
    note: '이번 주 재등록 안내',
    enrollments: [
      {
        id: 'enr-park-1',
        passName: '초급 라인댄스 월수강권',
        classIds: ['class-beginner-mon'],
        remainingCredits: 0,
        totalCredits: 0,
        paidAmount: 90000,
        lastPaidAt: addDays(-34),
        nextPaymentDue: addDays(-2),
        payments: [],
      },
    ],
  },
  {
    id: 'member-choi',
    name: '최하은',
    phone: '010-5555-1212',
    status: 'prospect',
    note: '무릎 부담이 적은 반 문의',
    consultedAt: todayKey,
    interest: '오전 초급반',
    enrollments: [],
  },
  {
    id: 'member-jung',
    name: '정수진',
    phone: '010-4321-7788',
    status: 'waitlist',
    note: '자리가 나면 바로 연락',
    consultedAt: todayKey,
    interest: '토요일 초급반 대기',
    enrollments: [],
  },
]

// 예전 구조(회원당 수강권 1개)의 저장 데이터를 새 구조로 변환한다
type LegacyMember = {
  id: string
  name: string
  phone: string
  status: MemberStatus
  note?: string
  consultedAt?: string
  interest?: string
  source?: string
  enrollments?: Enrollment[]
  classIds?: string[]
  passType?: string
  remainingCredits?: number
  totalCredits?: number
  paidAmount?: number
  payments?: PaymentRecord[]
  lastPaidAt?: string
  nextPaymentDue?: string
  passUntil?: string
}

function normalizeMember(raw: LegacyMember): Member {
  const base = {
    id: raw.id,
    name: raw.name,
    phone: raw.phone,
    status: raw.status,
    note: raw.note ?? '',
    consultedAt: raw.consultedAt,
    interest: raw.interest,
    source: raw.source,
  }
  if (Array.isArray(raw.enrollments)) {
    return { ...base, enrollments: raw.enrollments }
  }
  const hasLegacyPass =
    (raw.classIds?.length ?? 0) > 0 ||
    (raw.totalCredits ?? 0) > 0 ||
    (raw.payments?.length ?? 0) > 0 ||
    Boolean(raw.lastPaidAt)
  return {
    ...base,
    enrollments: hasLegacyPass
      ? [
          {
            id: makeId('enr'),
            passName:
              raw.passType && !['상담', '대기'].includes(raw.passType) ? raw.passType : '수강권',
            classIds: raw.classIds ?? [],
            remainingCredits: raw.remainingCredits ?? 0,
            totalCredits: raw.totalCredits ?? 0,
            paidAmount: raw.paidAmount ?? 0,
            lastPaidAt: raw.lastPaidAt ?? '',
            nextPaymentDue: raw.nextPaymentDue || raw.passUntil || '',
            payments: raw.payments ?? [],
          },
        ]
      : [],
  }
}

function useStoredData() {
  const [members, setMembers] = useState<Member[]>(isDemoMode ? seedMembers : [])
  const [classes, setClasses] = useState<DanceClass[]>(isDemoMode ? seedClasses : [])
  const [passTemplates, setPassTemplates] = useState<PassTemplate[]>(
    isDemoMode ? seedPassTemplates : [],
  )
  const [attendance, setAttendance] = useState<AttendanceBook>({})
  const [gigs, setGigs] = useState<Gig[]>([])
  const [paymentArchive, setPaymentArchive] = useState<ArchivedPayment[]>([])
  const [privateLessonCharges, setPrivateLessonCharges] =
    useState<PrivateLessonChargeBook>({})
  const [waitlistClasses, setWaitlistClasses] = useState<WaitlistClass[]>([])
  // 저장된 데이터를 불러오는 첫 로드가 끝났는지 (동기화가 '로드'와 '편집'을 구분하는 데 쓴다)
  const [hydrated, setHydrated] = useState(isDemoMode)

  useEffect(() => {
    if (isDemoMode) return
    const raw = localStorage.getItem(storageKey)
    if (raw) {
      try {
        const saved = JSON.parse(raw) as {
          members?: LegacyMember[]
          classes?: DanceClass[]
          passTemplates?: PassTemplate[]
          attendance?: AttendanceBook
          gigs?: Gig[]
          paymentArchive?: ArchivedPayment[]
          privateLessonCharges?: PrivateLessonChargeBook
          waitlistClasses?: WaitlistClass[]
        }
        const loadedMembers = dedupeClassOwnership(
          (saved.members ?? []).map(normalizeMember),
          saved.classes ?? [],
        )
        if (loadedMembers.length) setMembers(loadedMembers)
        if (saved.classes?.length)
          setClasses(sweepOrphanClasses(saved.classes, loadedMembers, saved.passTemplates ?? []))
        if (saved.passTemplates?.length) setPassTemplates(saved.passTemplates)
        if (saved.attendance) setAttendance(saved.attendance)
        if (saved.gigs?.length) setGigs(saved.gigs)
        if (saved.paymentArchive?.length) setPaymentArchive(saved.paymentArchive)
        if (saved.privateLessonCharges) setPrivateLessonCharges(saved.privateLessonCharges)
        if (saved.waitlistClasses?.length) setWaitlistClasses(saved.waitlistClasses)
      } catch {
        localStorage.removeItem(storageKey)
      }
    }
    setHydrated(true)
  }, [])

  useEffect(() => {
    if (isDemoMode) return
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        members,
        classes,
        passTemplates,
        attendance,
        gigs,
        paymentArchive,
        privateLessonCharges,
        waitlistClasses,
      }),
    )
  }, [
    members,
    classes,
    passTemplates,
    attendance,
    gigs,
    paymentArchive,
    privateLessonCharges,
    waitlistClasses,
  ])

  return {
    attendance,
    classes,
    gigs,
    hydrated,
    members,
    passTemplates,
    paymentArchive,
    privateLessonCharges,
    setAttendance,
    setClasses,
    setGigs,
    setMembers,
    setPassTemplates,
    setPaymentArchive,
    setPrivateLessonCharges,
    setWaitlistClasses,
    waitlistClasses,
  }
}

function App() {
  const {
    attendance,
    classes,
    gigs,
    hydrated,
    members,
    passTemplates,
    paymentArchive,
    privateLessonCharges,
    setAttendance,
    setClasses,
    setGigs,
    setMembers,
    setPassTemplates,
    setPaymentArchive,
    setPrivateLessonCharges,
    setWaitlistClasses,
    waitlistClasses,
  } = useStoredData()
  const [tab, setTab] = useState<Tab>('home')
  const [query, setQuery] = useState('')
  // 공휴일 최신화: 올해·내년 공휴일을 API에서 받아 캐시한다 (30일마다 갱신).
  // 실패해도 조용히 내장 목록으로 동작한다.
  const [, setHolidayTick] = useState(0)
  useEffect(() => {
    const year = today.getFullYear()
    try {
      const cached = JSON.parse(localStorage.getItem(holidayCacheKey) ?? 'null') as {
        fetchedAt?: number
        years?: number[]
      } | null
      if (
        cached?.fetchedAt &&
        Date.now() - cached.fetchedAt < 30 * 86400000 &&
        cached.years?.includes(year) &&
        cached.years?.includes(year + 1)
      )
        return
    } catch {
      // 캐시가 깨졌으면 새로 받는다
    }
    let cancelled = false
    void (async () => {
      try {
        const years = [year, year + 1]
        const dates: string[] = []
        for (const targetYear of years) {
          const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${targetYear}/KR`)
          if (!res.ok) return
          const list = (await res.json()) as Array<{ date?: string }>
          for (const item of list) {
            if (typeof item?.date === 'string') dates.push(item.date)
          }
        }
        if (cancelled || !dates.length) return
        localStorage.setItem(
          holidayCacheKey,
          JSON.stringify({ dates, fetchedAt: Date.now(), years }),
        )
        for (const date of dates) fetchedHolidays.add(date)
        setHolidayTick((tick) => tick + 1)
      } catch {
        // 오프라인 등 — 내장 목록으로 동작
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])
  const [selectedClassId, setSelectedClassId] = useState(isDemoMode ? seedClasses[0].id : '')
  const [attendanceDate, setAttendanceDate] = useState(todayKey)
  const [convertedMemberId, setConvertedMemberId] = useState<string | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState(() => localStorage.getItem(backupKey) ?? '')
  const [toast, setToast] = useState<string | null>(null)
  const [smsTemplates, setSmsTemplates] = useState<readonly SmsTemplate[]>(() =>
    loadSmsTemplates(localStorage.getItem(smsTemplateKey)),
  )
  const [smsComposerMemberId, setSmsComposerMemberId] = useState<string | null>(null)

  useEffect(() => {
    if (!hydrated) return
    const result = reconcilePrivateLessonCharges({
      attendance,
      charges: privateLessonCharges,
      classes,
      members,
      todayKey,
    })
    if (!result.changed) return
    if (result.deductions.length) {
      setMembers((current) =>
        current.map((member) => ({
          ...member,
          enrollments: member.enrollments.map((enrollment) => {
            const deductionCount = result.deductions.filter(
              (change) =>
                change.memberId === member.id && change.enrollmentId === enrollment.id,
            ).length
            return deductionCount
              ? {
                  ...enrollment,
                  remainingCredits: enrollment.remainingCredits - deductionCount,
                }
              : enrollment
          }),
        })),
      )
    }
    setPrivateLessonCharges(result.charges)
  }, [
    attendance,
    classes,
    hydrated,
    members,
    privateLessonCharges,
    setMembers,
    setPrivateLessonCharges,
  ])

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(timer)
  }, [toast])

  function notify(message: string) {
    setToast(message)
  }

  function saveSmsTemplates(next: readonly SmsTemplate[]) {
    setSmsTemplates(next)
    localStorage.setItem(smsTemplateKey, JSON.stringify(next))
  }

  function copyText(text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => notify('복사되었습니다'))
      .catch(() => notify('복사에 실패했어요. 문구를 길게 눌러 복사해 주세요.'))
  }

  // ---------- 기기 동기화 (Firebase Firestore) ----------
  // 전체 앱 데이터를 JSON 문자열 하나로 /sync/{code} 문서에 저장한다.
  // 서버가 확정한 스냅샷만 믿고 판단하며, 편집 시각(updatedAt)을 비교해 더 최신 쪽이
  // 이긴다(last-write-wins). 미전송 편집은 dirty 기록으로 남겨 다음 접속 때 복구한다.
  const syncJson = JSON.stringify({
    attendance,
    classes,
    gigs,
    members,
    passTemplates,
    paymentArchive,
    privateLessonCharges,
    waitlistClasses,
  })
  const [syncCode, setSyncCode] = useState(() =>
    isDemoMode ? '' : localStorage.getItem(syncCodeKey) ?? '',
  )
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('off')
  // 구독 오류 시 5초 뒤 재구독을 일으키는 카운터
  const [syncRetryTick, setSyncRetryTick] = useState(0)
  // 구독 콜백에서 최신 로컬 데이터를 읽기 위한 참조
  const syncJsonRef = useRef(syncJson)
  useEffect(() => {
    syncJsonRef.current = syncJson
  }, [syncJson])
  // 구독 콜백에서 최신 notify를 부르기 위한 참조 (의존성에 넣으면 매 렌더 재구독되므로)
  const notifyRef = useRef(notify)
  useEffect(() => {
    notifyRef.current = notify
  })
  // 서버와 마지막으로 맞춰진 JSON (null이면 아직 기준선이 없어 업로드를 보류한다)
  const lastSyncedJsonRef = useRef<string | null>(null)
  // 편집 감지용 기준선: 저장 데이터의 첫 로드와 실제 사용자 편집을 구분한다
  const editBaselineRef = useRef<string | null>(null)
  // 이 세션에서 사용자가 직접 입력해 연결한 코드인지 (오타로 빈 공유를 시작하는 사고 방지)
  const enteredCodeRef = useRef(false)
  // 업로드 디바운스 타이머 (원격 스냅샷이 일으키는 리렌더에 취소되지 않도록 ref로 관리)
  const pushTimerRef = useRef<number | null>(null)
  // 동기화 이력 (localStorage에 유지)
  const [initialSyncMeta] = useState(loadSyncMeta)
  const syncMetaRef = useRef(initialSyncMeta)

  const persistSyncMeta = useCallback(() => {
    if (isDemoMode) return
    localStorage.setItem(syncMetaKey, JSON.stringify(syncMetaRef.current))
  }, [])

  const clearPushTimer = useCallback(() => {
    if (pushTimerRef.current !== null) {
      window.clearTimeout(pushTimerRef.current)
      pushTimerRef.current = null
    }
  }, [])

  // 현재 로컬 데이터를 즉시 업로드한다. updatedAt은 호출 시각으로 기록되므로,
  // 오프라인에서 큐잉된 쓰기가 뒤늦게 도착해도 수신 기기가 과거 데이터로 판별할 수 있다.
  const pushSyncNow = useCallback(
    (code: string) => {
      clearPushTimer()
      const json = syncJsonRef.current
      const at = Date.now()
      lastSyncedJsonRef.current = json
      editBaselineRef.current = json
      syncMetaRef.current.dirty = true
      persistSyncMeta()
      pushSync(code, json, at)
        .then(() => {
          // 서버가 확정해 준 뒤에만 '전송 완료'로 기록한다
          syncMetaRef.current.lastSyncedAt = Math.max(syncMetaRef.current.lastSyncedAt, at)
          if (syncJsonRef.current === json) syncMetaRef.current.dirty = false
          persistSyncMeta()
        })
        .catch(() => setSyncStatus('error'))
    },
    [clearPushTimer, persistSyncMeta],
  )

  // 원격 → 로컬 (실시간 구독). 오류 시 5초 뒤 자동 재구독한다.
  useEffect(() => {
    if (isDemoMode || !firebaseReady || !syncCode) {
      setSyncStatus('off')
      return
    }

    function applyRemoteData(json: string, updatedAt: number) {
      try {
        const parsed = JSON.parse(json) as {
          members?: LegacyMember[]
          classes?: DanceClass[]
          passTemplates?: PassTemplate[]
          attendance?: AttendanceBook
          gigs?: Gig[]
          paymentArchive?: ArchivedPayment[]
          privateLessonCharges?: PrivateLessonChargeBook
          waitlistClasses?: WaitlistClass[]
        }
        // syncJson과 같은 키 순서·같은 객체로 직렬화해 다음 렌더의 syncJson과 정확히
        // 일치시킨다 (어긋나면 방금 받은 데이터를 곧바로 되올리는 왕복이 생긴다)
        // 흔적 수업 청소·중복 소속 정리는 여기서도 적용해 어떤 기기 데이터든 수렴시킨다
        const rawMembers = (parsed.members ?? []).map(normalizeMember)
        const remoteMembers = dedupeClassOwnership(rawMembers, parsed.classes ?? [])
        const next = {
          attendance: parsed.attendance ?? {},
          classes: sweepOrphanClasses(
            parsed.classes ?? [],
            remoteMembers,
            parsed.passTemplates ?? [],
          ),
          gigs: parsed.gigs ?? [],
          members: remoteMembers,
          passTemplates: parsed.passTemplates ?? [],
          paymentArchive: parsed.paymentArchive ?? [],
          privateLessonCharges: parsed.privateLessonCharges ?? {},
          waitlistClasses: parsed.waitlistClasses ?? [],
        }
        setMembers(next.members)
        setClasses(next.classes)
        setPassTemplates(next.passTemplates)
        setAttendance(next.attendance)
        setGigs(next.gigs)
        setPaymentArchive(next.paymentArchive)
        setPrivateLessonCharges(next.privateLessonCharges)
        setWaitlistClasses(next.waitlistClasses)
        clearPushTimer()
        // 기준선은 '서버에 실제로 있던 값'으로 잡는다. 청소·정리로 로컬이 달라졌다면
        // 다음 렌더에서 편집으로 감지되어 정리된 데이터가 자동으로 서버에 올라간다.
        const serialized = JSON.stringify({
          ...next,
          classes: parsed.classes ?? [],
          members: rawMembers,
        })
        lastSyncedJsonRef.current = serialized
        editBaselineRef.current = serialized
        syncMetaRef.current = {
          dirty: false,
          lastLocalEditAt: 0,
          lastSyncedAt: Math.max(syncMetaRef.current.lastSyncedAt, updatedAt),
        }
        persistSyncMeta()
      } catch {
        // 잘못된 원격 데이터는 무시한다
      }
    }

    setSyncStatus('connecting')
    let retryTimer: number | null = null
    const unsubscribe = subscribeSync(
      syncCode,
      (snap) => {
        // 서버가 확정하지 않은(캐시·전송 대기) 스냅샷으로는 아무것도 판단하지 않는다
        if (!snap.confirmed) return
        setSyncStatus('live')
        if (snap.json === null) {
          if (enteredCodeRef.current) {
            // 사용자가 입력한 코드인데 서버에 데이터가 없다 → 오타일 가능성이 높으니
            // 빈 문서를 만들지 말고 연결을 되돌린다
            enteredCodeRef.current = false
            localStorage.removeItem(syncCodeKey)
            localStorage.removeItem(syncMetaKey)
            setSyncCode('')
            notifyRef.current('이 코드로 저장된 데이터가 없어요. 코드를 다시 확인해 주세요.')
            return
          }
          // 이 기기에서 만든 코드 → 이 기기 데이터가 시작점이 된다
          pushSyncNow(syncCode)
          return
        }
        enteredCodeRef.current = false
        if (snap.json === lastSyncedJsonRef.current) {
          // 우리가 올린 데이터의 메아리 → 동기화 시각만 기록
          syncMetaRef.current.lastSyncedAt = Math.max(
            syncMetaRef.current.lastSyncedAt,
            snap.updatedAt,
          )
          persistSyncMeta()
          return
        }
        if (snap.updatedAt < syncMetaRef.current.lastSyncedAt - clockSkewMs) {
          // 원격이 우리가 이미 본 상태보다 한참 과거로 돌아갔다 (다른 기기의 오프라인
          // 쓰기가 뒤늦게 도착한 경우) → 우리 쪽 최신 데이터로 복원한다
          pushSyncNow(syncCode)
          return
        }
        if (syncMetaRef.current.dirty && syncMetaRef.current.lastLocalEditAt > snap.updatedAt) {
          // 아직 전송하지 못한 우리 편집이 원격보다 최신 → 우리 편집을 올린다
          pushSyncNow(syncCode)
          return
        }
        applyRemoteData(snap.json, snap.updatedAt)
      },
      () => {
        setSyncStatus('error')
        retryTimer = window.setTimeout(() => setSyncRetryTick((tick) => tick + 1), 5000)
      },
    )
    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer)
      unsubscribe()
    }
    // useState의 setter들은 항상 동일한 함수라 재구독을 일으키지 않는다
  }, [
    syncCode,
    syncRetryTick,
    clearPushTimer,
    persistSyncMeta,
    pushSyncNow,
    setAttendance,
    setClasses,
    setGigs,
    setMembers,
    setPassTemplates,
    setPaymentArchive,
    setPrivateLessonCharges,
    setWaitlistClasses,
  ])

  // 로컬 편집 감지: 연결 상태와 무관하게 '미전송 편집 있음'을 기기에 기억해 둔다.
  // 오프라인에서 편집하고 앱을 닫아도 이 기록의 시각 비교로 다음 접속 때 복구된다.
  useEffect(() => {
    if (isDemoMode || !firebaseReady || !syncCode || !hydrated) return
    if (editBaselineRef.current === null) {
      // 하이드레이션 직후의 첫 값은 저장돼 있던 데이터이지 편집이 아니다
      editBaselineRef.current = syncJson
      return
    }
    if (syncJson === editBaselineRef.current) return
    editBaselineRef.current = syncJson
    syncMetaRef.current.dirty = true
    syncMetaRef.current.lastLocalEditAt = Date.now()
    persistSyncMeta()
  }, [syncJson, syncCode, hydrated, persistSyncMeta])

  // 로컬 → 원격 (변경 시 0.6초 디바운스 후 업로드)
  // 첫 서버 확정 스냅샷을 받기 전에는 업로드하지 않는다 — 연결 직후 로컬 데이터가
  // 원격 데이터를 덮어쓰는 사고를 막는다.
  useEffect(() => {
    if (isDemoMode || !firebaseReady || !syncCode || syncStatus !== 'live') return
    if (lastSyncedJsonRef.current === null || syncJson === lastSyncedJsonRef.current) return
    clearPushTimer()
    pushTimerRef.current = window.setTimeout(() => {
      pushTimerRef.current = null
      pushSyncNow(syncCode)
    }, 600)
  }, [syncJson, syncCode, syncStatus, clearPushTimer, pushSyncNow])

  // 앱 전환·탭 닫기 직전, 디바운스 대기 중인 변경을 즉시 밀어 넣는다 (최선의 시도).
  // 실패해도 dirty 기록이 남아 있어 다음 접속 때 복구된다.
  useEffect(() => {
    if (isDemoMode || !firebaseReady || !syncCode) return
    const flush = () => {
      if (pushTimerRef.current !== null) pushSyncNow(syncCode)
    }
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [syncCode, pushSyncNow])

  const resetSyncTracking = useCallback(() => {
    clearPushTimer()
    lastSyncedJsonRef.current = null
    editBaselineRef.current = null
    syncMetaRef.current = { dirty: false, lastLocalEditAt: 0, lastSyncedAt: 0 }
    persistSyncMeta()
  }, [clearPushTimer, persistSyncMeta])

  function startSync() {
    // 새 코드의 원격 문서는 비어 있으므로, 첫 스냅샷에서 이 기기 데이터가 시작점으로 올라간다
    const code = generateSyncCode()
    enteredCodeRef.current = false
    resetSyncTracking()
    localStorage.setItem(syncCodeKey, code)
    setSyncCode(code)
    notify('동기화 코드를 만들었어요. 다른 기기에 입력하세요.')
  }

  function connectSync(rawCode: string) {
    const code = rawCode.trim().toLowerCase()
    if (!isValidSyncCode(code)) {
      notify('코드는 영문·숫자 20자 이상이어야 해요')
      return
    }
    if (code === syncCode) {
      notify('이미 이 코드로 연결돼 있어요')
      return
    }
    const hasData =
      members.length > 0 ||
      classes.length > 0 ||
      passTemplates.length > 0 ||
      gigs.length > 0 ||
      waitlistClasses.length > 0 ||
      Object.keys(attendance).length > 0
    if (!isDemoMode && hasData) {
      const ok = window.confirm(
        '이 기기의 데이터가 동기화 코드의 데이터로 바뀔 수 있어요. 계속할까요?',
      )
      if (!ok) return
    }
    enteredCodeRef.current = true
    resetSyncTracking()
    localStorage.setItem(syncCodeKey, code)
    setSyncCode(code)
    notify('기기 동기화를 연결했어요')
  }

  function disconnectSync() {
    enteredCodeRef.current = false
    resetSyncTracking()
    localStorage.removeItem(syncCodeKey)
    localStorage.removeItem(syncMetaKey)
    setSyncCode('')
    setSyncStatus('off')
    notify('기기 동기화를 해제했어요')
  }

  // URL에 ?connect=코드 가 있으면 코드 입력 없이 바로 연결한다.
  // (다른 기기에서 만든 코드를 링크로 전달받아 원터치 연결하는 용도)
  const connectSyncRef = useRef(connectSync)
  connectSyncRef.current = connectSync
  useEffect(() => {
    if (isDemoMode || !firebaseReady || !hydrated) return
    const params = new URLSearchParams(window.location.search)
    const code = params.get('connect')
    if (!code) return
    params.delete('connect')
    const rest = params.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${rest ? `?${rest}` : ''}`,
    )
    connectSyncRef.current(code)
  }, [hydrated])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  // 안드로이드 뒤로가기가 앱을 닫지 않고 이전 탭으로 이동하도록 한다
  const skipHistoryPushRef = useRef(false)
  useEffect(() => {
    if (skipHistoryPushRef.current) {
      skipHistoryPushRef.current = false
      return
    }
    window.history.pushState({ tab }, '')
  }, [tab])
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      skipHistoryPushRef.current = true
      setTab(((event.state as { tab?: Tab } | null)?.tab as Tab) ?? 'home')
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const activeMembers = members.filter((member) => member.status === 'active')
  const consultationMembers = members.filter((member) => member.status === 'prospect')
  const waitlistMembers = members.filter((member) => member.status === 'waitlist')
  // 대기 현황에서 만든 대기 수업의 대기자가 정원을 채우면 개강 알림을 띄운다
  const waitlistAlerts = waitlistClasses
    .filter((waitClass) => waitClass.capacity > 0)
    .map((waitClass) => ({
      capacity: waitClass.capacity,
      count: waitlistMembers.filter((member) => member.interest === waitClass.name).length,
      passName: waitClass.name,
    }))
    .filter((alert) => alert.count >= alert.capacity)
  const todayClasses = classesOnDate(classes, today)

  // 홈 알림은 수강권 단위로 만든다 (한 회원이 여러 건일 수 있음)
  type AlertItem = { member: Member; enrollment: Enrollment }
  const unpaidItems: AlertItem[] = []
  const lowCreditItems: AlertItem[] = []
  const expiringItems: AlertItem[] = []
  activeMembers.forEach((member) => {
    member.enrollments.forEach((enrollment) => {
      const status = enrollmentStatus(enrollment)
      if (status === 'unpaid') {
        unpaidItems.push({ enrollment, member })
        return
      }
      if (enrollment.totalCredits > 0 && enrollment.remainingCredits <= 2) {
        lowCreditItems.push({ enrollment, member })
        return
      }
      if (enrollment.nextPaymentDue) {
        const daysLeft = daysUntil(enrollment.nextPaymentDue) ?? 99
        if (daysLeft <= 10) expiringItems.push({ enrollment, member })
      }
    })
  })

  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? classes[0]
  const classMembers = selectedClass
    ? activeMembers.filter((member) => {
        if (!memberClassIds(member).includes(selectedClass.id)) return false
        // 그 날짜에 출석 기록이 이미 있으면 항상 보인다 — 지금 만료됐더라도
        // 날짜별 이력과 명단이 어긋나면 안 되기 때문
        if (attendance[attendanceKey(attendanceDate, selectedClass.id, member.id)]) return true
        const enrollment = enrollmentForClass(member, selectedClass.id)
        if (!enrollment) return true
        // 기간 만료·횟수 소진, 또는 수강 시작 전(결제일 이전 날짜)에는 명단에 뜨지 않는다
        if (enrollmentStatus(enrollment) === 'unpaid') return false
        if (enrollment.lastPaidAt && attendanceDate < enrollment.lastPaidAt) return false
        return true
      })
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
    : []
  const hasRealData = !isDemoMode && members.length > 0
  const backupAgeDays = lastBackupAt
    ? Math.floor((today.getTime() - new Date(lastBackupAt).getTime()) / 86400000)
    : null
  const backupOverdue = hasRealData && (backupAgeDays === null || backupAgeDays >= 14)
  const fabDrawerId = {
    home: null,
    schedule: null,
    members: 'drawer-member',
    consultations: 'drawer-consult',
    attendance: null,
    payments: null,
  }[tab]

  function addMember(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    const passTemplateId = String(formData.get('passTemplateId') ?? '')
    const selectedPass = passTemplates.find((pass) => pass.id === passTemplateId)
    if (!name || !phone) {
      notify('이름과 전화번호를 입력해 주세요')
      return
    }
    setMembers((current) => [
      {
        id: makeId('member'),
        name,
        phone,
        status: 'active',
        note: String(formData.get('note') ?? ''),
        enrollments: selectedPass ? [enrollmentFromPass(selectedPass)] : [],
      },
      ...current,
    ])
    notify('회원이 등록되었습니다')
  }

  function addEnrollment(memberId: string, passTemplateId: string) {
    const pass = passTemplates.find((item) => item.id === passTemplateId)
    if (!pass) return
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              status: 'active' as MemberStatus,
              // 새 수강권의 수업이 기존 수강권에 붙어 있었다면 떼어낸다
              // (한 수업이 두 수강권에 있으면 출석 차감이 엉뚱한 곳에서 일어남)
              enrollments: [
                ...member.enrollments.map((enrollment) => ({
                  ...enrollment,
                  classIds: enrollment.classIds.filter((id) => !pass.classIds.includes(id)),
                })),
                enrollmentFromPass(pass),
              ],
            }
          : member,
      ),
    )
    notify(`'${pass.name}' 수강권이 추가되었습니다`)
  }

  function updateEnrollment(memberId: string, enrollmentId: string, formData: FormData) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member
        return {
          ...member,
          enrollments: member.enrollments.map((enrollment) => {
            if (enrollment.id !== enrollmentId) return enrollment
            const paidAmount = Number(formData.get('paidAmount') ?? enrollment.paidAmount)
            const lastPaidAt = String(formData.get('lastPaidAt') ?? enrollment.lastPaidAt)
            // '결제 정보 수정'은 마지막 결제 기록을 고쳐 적는 것 — 날짜를 바꿀 때마다
            // 새 기록을 추가하면 같은 결제가 두 번 잡혀 매출이 부풀어난다
            let payments = enrollment.payments
            if (paidAmount > 0 && lastPaidAt) {
              const atNewDate = payments.findIndex((payment) => payment.date === lastPaidAt)
              const previousRecord = payments.findIndex(
                (payment) =>
                  payment.date === enrollment.lastPaidAt &&
                  payment.amount === enrollment.paidAmount,
              )
              if (atNewDate >= 0) {
                // 같은 날짜 기록이 이미 있으면 금액만 고쳐 적는다
                payments = payments.map((payment, index) =>
                  index === atNewDate ? { ...payment, amount: paidAmount } : payment,
                )
              } else if (lastPaidAt !== enrollment.lastPaidAt && previousRecord >= 0) {
                // 결제일을 고친 경우: 직전 결제 기록을 새 날짜로 옮긴다
                payments = payments.map((payment, index) =>
                  index === previousRecord ? { amount: paidAmount, date: lastPaidAt } : payment,
                )
              } else {
                payments = [...payments, { amount: paidAmount, date: lastPaidAt }]
              }
            }
            return {
              ...enrollment,
              passName: String(formData.get('passName') || enrollment.passName),
              totalCredits: Number(formData.get('totalCredits') ?? enrollment.totalCredits),
              remainingCredits: Number(
                formData.get('remainingCredits') ?? enrollment.remainingCredits,
              ),
              paidAmount,
              lastPaidAt,
              nextPaymentDue: String(
                formData.get('nextPaymentDue') ?? enrollment.nextPaymentDue,
              ),
              payments,
            }
          }),
        }
      }),
    )
    notify('수강권 정보가 저장되었습니다')
  }

  function removeEnrollment(memberId: string, enrollmentId: string) {
    // 매출(정산) 기록은 지우지 않는다 — 결제 내역을 보존 장부로 옮긴 뒤 수강권만 제거
    const owner = members.find((member) => member.id === memberId)
    const target = owner?.enrollments.find((enrollment) => enrollment.id === enrollmentId)
    if (owner && target && target.payments.length) {
      const classNames = target.classIds.flatMap((classId) => {
        const danceClass = classes.find((item) => item.id === classId)
        return danceClass ? [danceClass.name] : []
      })
      setPaymentArchive((current) => [
        ...current,
        ...target.payments.map((payment) => ({
          ...payment,
          classNames: classNames.length
            ? [...new Set(classNames)]
            : target.passName.includes('개인')
              ? ['개인레슨']
              : ['수업 정보 없음'],
          memberName: owner.name,
          passName: target.passName,
        })),
      ])
    }
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              enrollments: member.enrollments.filter(
                (enrollment) => enrollment.id !== enrollmentId,
              ),
            }
          : member,
      ),
    )
    notify('수강을 종료했습니다 (입금·출석 이력은 보존됩니다)')
  }

  // 잘못 기록된 수납 1건을 지운다 (수강권 등록·수정 실수로 매출이 부풀었을 때 정리용)
  function removePaymentRecord(ref: PaymentSourceRef) {
    if (ref.kind === 'archive') {
      setPaymentArchive((current) => current.filter((_, index) => index !== ref.index))
    } else {
      setMembers((current) =>
        current.map((member) => {
          if (member.id !== ref.memberId) return member
          return {
            ...member,
            enrollments: member.enrollments.map((enrollment) => {
              if (enrollment.id !== ref.enrollmentId) return enrollment
              return {
                ...enrollment,
                payments: enrollment.payments.filter((_, index) => index !== ref.paymentIndex),
              }
            }),
          }
        }),
      )
    }
    notify('수납 기록 1건을 삭제했습니다')
  }

  function updatePaymentDate(ref: PaymentSourceRef, record: PaymentRecord, date: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date === record.date) return
    if (ref.kind === 'archive') {
      setPaymentArchive((current) =>
        current.map((payment, index) => (index === ref.index ? { ...payment, date } : payment)),
      )
    } else {
      const enrollment = members
        .find((member) => member.id === ref.memberId)
        ?.enrollments.find((item) => item.id === ref.enrollmentId)
      const createsDuplicate = enrollment?.payments.some(
        (payment, index) =>
          index !== ref.paymentIndex && payment.date === date && payment.amount === record.amount,
      )
      if (createsDuplicate) {
        notify('같은 날짜·금액의 입금 기록이 이미 있습니다.')
        return
      }
      setMembers((current) =>
        current.map((member) => {
          if (member.id !== ref.memberId) return member
          return {
            ...member,
            enrollments: member.enrollments.map((enrollment) => {
              if (enrollment.id !== ref.enrollmentId) return enrollment
              const payments = enrollment.payments.map((payment, index) =>
                index === ref.paymentIndex ? { ...payment, date } : payment,
              )
              const lastPaidAt = payments.reduce(
                (latest, payment) => (payment.date > latest ? payment.date : latest),
                '',
              )
              return { ...enrollment, lastPaidAt, payments }
            }),
          }
        }),
      )
    }
    notify('실제 입금일을 수정했습니다')
  }

  function quickRenew(memberId: string, enrollmentId: string) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member
        return {
          ...member,
          enrollments: member.enrollments.map((enrollment) => {
            if (enrollment.id !== enrollmentId) return enrollment
            // 월회비 +1개월, 그룹 회수권 +3개월, 개인레슨(기간 없음)은 횟수만 충전
            const nextDue =
              enrollment.totalCredits > 0
                ? enrollment.nextPaymentDue
                  ? addMonthsFrom(todayKey, 3)
                  : ''
                : addMonthsFrom(todayKey, 1)
            return {
              ...enrollment,
              lastPaidAt: todayKey,
              nextPaymentDue: nextDue,
              // 초과 사용분(음수 잔여)은 새 충전에서 차감된다
              remainingCredits:
                enrollment.totalCredits > 0
                  ? enrollment.totalCredits + Math.min(0, enrollment.remainingCredits)
                  : enrollment.remainingCredits,
              payments: [
                ...enrollment.payments.filter((payment) => payment.date !== todayKey),
                { amount: enrollment.paidAmount, date: todayKey },
              ],
            }
          }),
        }
      }),
    )
    notify('재결제 처리되었습니다')
  }

  function addPassTemplate(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    if (!name) {
      notify('수강권 이름을 입력해 주세요')
      return
    }
    const type = String(formData.get('type') ?? 'line_group') as LessonType
    const selectedWeekdays = formData
      .getAll('weekdays')
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value))
    const templateWeekdays = selectedWeekdays.length ? selectedWeekdays : [today.getDay()]
    const startTime = String(formData.get('startTime') ?? '10:00')
    const endTime = String(formData.get('endTime') ?? '10:50')
    const capacity = type === 'private' ? 1 : Number(formData.get('capacity') ?? 12)
    const tuitionFee = Number(formData.get('tuitionFee') ?? 0)
    // 개인레슨 수강권은 정해진 요일 수업을 만들지 않는다 (시간표에서 실시간 추가)
    const classIds = type === 'private' ? [] : templateWeekdays.map(() => makeId('class'))
    const newClasses =
      type === 'private'
        ? []
        : templateWeekdays.map((weekday, index) => ({
            id: classIds[index],
            name,
            weekday,
            startTime,
            endTime,
            location: '스튜디오',
            capacity,
            tuitionFee,
            level: '전체',
          }))
    if (newClasses.length) setClasses((current) => [...newClasses, ...current])
    setPassTemplates((current) => [
      {
        id: makeId('pass'),
        type,
        name,
        sessionCount: Number(formData.get('sessionCount') ?? 0),
        startTime,
        endTime,
        weekdays: templateWeekdays,
        capacity,
        tuitionFee,
        classIds,
      },
      ...current,
    ])
    notify('수강권이 저장되었습니다')
  }

  function updatePassTemplate(passId: string, formData: FormData) {
    const pass = passTemplates.find((item) => item.id === passId)
    if (!pass) return
    const name = String(formData.get('name') || pass.name)
    const sessionCount = Number(formData.get('sessionCount') ?? pass.sessionCount)
    if (pass.type === 'private') {
      const fee = Number(formData.get('tuitionFee') ?? pass.tuitionFee)
      setPassTemplates((current) =>
        current.map((item) =>
          item.id === passId ? { ...item, name, sessionCount, tuitionFee: fee } : item,
        ),
      )
      notify('수강권이 수정되었습니다')
      return
    }
    const startTime = String(formData.get('startTime') || pass.startTime)
    const endTime = String(formData.get('endTime') || pass.endTime)
    const capacity = Number(formData.get('capacity') || pass.capacity)
    const tuitionFee = Number(formData.get('tuitionFee') ?? pass.tuitionFee)
    const pickedWeekdays = formData
      .getAll('weekdays')
      .map(Number)
      .filter((value) => Number.isFinite(value))
    const nextWeekdays = pickedWeekdays.length ? pickedWeekdays : pass.weekdays

    // 수강권의 시간·요일을 바꾸면 연결된 수업들이 같이 바뀐다
    const linkedClasses = classes.filter((item) => pass.classIds.includes(item.id))
    const defaultLocation = linkedClasses[0]?.location ?? '스튜디오'
    const keptIds: string[] = []
    const createdClasses: DanceClass[] = []
    nextWeekdays.forEach((weekday) => {
      const existing = linkedClasses.find((item) => item.weekday === weekday)
      if (existing) {
        keptIds.push(existing.id)
      } else {
        const id = makeId('class')
        keptIds.push(id)
        createdClasses.push({
          id,
          name,
          weekday,
          startTime,
          endTime,
          location: defaultLocation,
          capacity,
          tuitionFee,
          level: '전체',
        })
      }
    })
    const removedIds = linkedClasses
      .filter((item) => !nextWeekdays.includes(item.weekday))
      .map((item) => item.id)

    setClasses((current) => [
      ...createdClasses,
      ...current
        .filter((item) => !removedIds.includes(item.id))
        .map((item) =>
          keptIds.includes(item.id)
            ? { ...item, name, startTime, endTime, capacity, tuitionFee }
            : item,
        ),
    ])
    setMembers((current) =>
      current.map((member) => ({
        ...member,
        enrollments: member.enrollments.map((enrollment) => {
          const hadPassClass = enrollment.classIds.some((id) => pass.classIds.includes(id))
          let nextIds = enrollment.classIds.filter((id) => !removedIds.includes(id))
          if (hadPassClass) {
            createdClasses.forEach((created) => {
              if (!nextIds.includes(created.id)) nextIds = [...nextIds, created.id]
            })
          }
          return { ...enrollment, classIds: nextIds }
        }),
      })),
    )
    setPassTemplates((current) =>
      current.map((item) =>
        item.id === passId
          ? {
              ...item,
              name,
              sessionCount,
              startTime,
              endTime,
              weekdays: nextWeekdays,
              capacity,
              tuitionFee,
              classIds: keptIds,
            }
          : item,
      ),
    )
    notify('수강권이 수정되었습니다')
  }

  function removePassTemplate(passId: string) {
    const pass = passTemplates.find((item) => item.id === passId)
    if (!pass) return
    // 수강권을 지우면 연결된 수업도 시간표·회원 배정에서 함께 정리한다.
    // 예전 데이터에서 연결이 끊긴 경우를 대비해, 수강권과 이름이 같은 그룹 수업도 함께 지운다.
    const removedIds = classes
      .filter(
        (danceClass) =>
          pass.classIds.includes(danceClass.id) ||
          (!isPrivateClass(danceClass) && danceClass.name === pass.name),
      )
      .map((danceClass) => danceClass.id)
    if (removedIds.length) {
      setClasses((current) =>
        current.filter((danceClass) => !removedIds.includes(danceClass.id)),
      )
      setMembers((current) =>
        current.map((member) => ({
          ...member,
          enrollments: member.enrollments.map((enrollment) => ({
            ...enrollment,
            classIds: enrollment.classIds.filter((id) => !removedIds.includes(id)),
          })),
        })),
      )
    }
    setPassTemplates((current) => current.filter((item) => item.id !== passId))
    notify('수강권과 연결된 수업이 삭제되었습니다')
  }

  function updateMember(memberId: string, formData: FormData) {
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              name: String(formData.get('name') ?? member.name),
              phone: String(formData.get('phone') ?? member.phone),
              status: String(formData.get('status') ?? member.status) as MemberStatus,
              interest: String(formData.get('interest') ?? member.interest ?? ''),
              note: String(formData.get('note') ?? member.note),
            }
          : member,
      ),
    )
    notify('회원 정보가 저장되었습니다')
  }

  function addConsultation(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    if (!name || !phone) {
      notify('이름과 전화번호를 입력해 주세요')
      return
    }
    // '현재 대기'로 등록하면 대기 현황에서 만든 대기 수업 이름이 interest에 담긴다
    const interest = String(formData.get('interest') ?? '')
    const sourceChoice = String(formData.get('sourceChoice') ?? '')
    const source =
      sourceChoice === '기타' ? String(formData.get('sourceCustom') ?? '').trim() : sourceChoice
    setMembers((current) => [
      {
        id: makeId('prospect'),
        name,
        phone,
        status: String(formData.get('status') ?? 'prospect') as MemberStatus,
        note: String(formData.get('note') ?? ''),
        consultedAt: String(formData.get('consultedAt') ?? todayKey),
        interest,
        source,
        enrollments: [],
      },
      ...current,
    ])
    notify('상담이 등록되었습니다')
  }

  // 상담 탭에서 바로 전환 + 수강권 적용까지 끝낸다 (탭 이동 없음)
  function convertToMember(memberId: string, passId?: string) {
    const pass = passTemplates.find((item) => item.id === passId)
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member
        if (!pass) return { ...member, status: 'active' as MemberStatus }
        return {
          ...member,
          status: 'active' as MemberStatus,
          enrollments: [
            ...member.enrollments.map((enrollment) => ({
              ...enrollment,
              classIds: enrollment.classIds.filter((id) => !pass.classIds.includes(id)),
            })),
            enrollmentFromPass(pass),
          ],
        }
      }),
    )
    notify(
      pass
        ? `등록 회원 전환 완료 — '${pass.name}' 수강권이 적용되었습니다`
        : '등록 회원으로 전환되었습니다. 회원 탭에서 수강권을 추가해 주세요.',
    )
  }

  // 이미 등록한 상담 내역 수정 (이름·연락처·상담일·구분·관심수업·유입경로·메모)
  function updateConsultation(memberId: string, formData: FormData) {
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              name: String(formData.get('name') ?? member.name).trim() || member.name,
              phone: String(formData.get('phone') ?? member.phone),
              status: String(formData.get('status') ?? member.status) as MemberStatus,
              consultedAt: String(formData.get('consultedAt') ?? member.consultedAt ?? ''),
              interest: String(formData.get('interest') ?? member.interest ?? ''),
              source: String(formData.get('source') ?? member.source ?? ''),
              note: String(formData.get('note') ?? member.note),
            }
          : member,
      ),
    )
    notify('상담 내역이 수정되었습니다')
  }

  // 대기 현황 전용 수업 추가·삭제 (수강권과 무관)
  function addWaitlistClass(name: string, capacity: number) {
    const trimmed = name.trim()
    if (!trimmed) {
      notify('대기 수업명을 입력해 주세요')
      return
    }
    if (waitlistClasses.some((waitClass) => waitClass.name === trimmed)) {
      notify('같은 이름의 대기 수업이 이미 있어요')
      return
    }
    setWaitlistClasses((current) => [
      ...current,
      { id: makeId('wait'), name: trimmed, capacity: Math.max(0, capacity) },
    ])
    notify('대기 수업이 추가되었습니다')
  }

  function removeWaitlistClass(waitClassId: string) {
    setWaitlistClasses((current) =>
      current.filter((waitClass) => waitClass.id !== waitClassId),
    )
    notify('대기 수업이 삭제되었습니다 (대기 회원은 상담 내역에 남아요)')
  }

  function markAttendance(
    date: string,
    classId: string,
    memberId: string,
    status: AttendanceStatus,
  ) {
    const previous = attendance[attendanceKey(date, classId, memberId)]
    if (previous !== status) {
      const wasCounted = previous === 'present' || previous === 'makeup'
      const willCount = status === 'present' || status === 'makeup'
      const delta = (wasCounted ? 1 : 0) - (willCount ? 1 : 0)
      if (delta !== 0) {
        setMembers((current) =>
          current.map((member) => {
            if (member.id !== memberId) return member
            // 그 수업이 속한 회수권에서만 차감한다
            const countEnrollments = member.enrollments.filter((e) => e.totalCredits > 0)
            const target =
              countEnrollments.find((e) => e.classIds.includes(classId)) ??
              (countEnrollments.length === 1 ? countEnrollments[0] : undefined)
            if (!target) return member
            return {
              ...member,
              enrollments: member.enrollments.map((enrollment) =>
                enrollment.id === target.id
                  ? {
                      ...enrollment,
                      // 초과 사용(음수 잔여)을 허용해서 재등록 때 초과분을 차감할 수 있게 한다
                      remainingCredits: Math.min(
                        enrollment.totalCredits,
                        enrollment.remainingCredits + delta,
                      ),
                    }
                  : enrollment,
              ),
            }
          }),
        )
      }
    }
    setAttendance((current) => ({
      ...current,
      [attendanceKey(date, classId, memberId)]: status,
    }))
  }

  function setAttendanceStatus(memberId: string, status: AttendanceStatus) {
    if (!selectedClass) return
    markAttendance(attendanceDate, selectedClass.id, memberId, status)
  }

  function markAllPresent() {
    if (!selectedClass) return
    classMembers.forEach((member) => {
      const key = attendanceKey(attendanceDate, selectedClass.id, member.id)
      if (!attendance[key]) {
        markAttendance(attendanceDate, selectedClass.id, member.id, 'present')
      }
    })
    notify('전체 출석 처리되었습니다')
  }

  function saveClassAttendance(
    date: string,
    classId: string,
    marks: Record<string, AttendanceStatus>,
  ) {
    Object.entries(marks).forEach(([memberId, status]) => {
      if (attendance[attendanceKey(date, classId, memberId)] !== status) {
        markAttendance(date, classId, memberId, status)
      }
    })
    notify('출석이 저장되었습니다')
  }

  // 회원에게 수업 하나를 붙인다: 개인레슨형 수강권 우선, 없으면 첫 수강권, 그것도 없으면 새로 만든다
  function attachClassToMember(member: Member, classId: string): Member {
    if (memberClassIds(member).includes(classId)) {
      return { ...member, status: 'active' as MemberStatus }
    }
    const target =
      member.enrollments.find((e) => e.totalCredits > 0 && !e.nextPaymentDue) ??
      member.enrollments[0]
    if (target) {
      return {
        ...member,
        status: 'active' as MemberStatus,
        enrollments: member.enrollments.map((enrollment) =>
          enrollment.id === target.id
            ? { ...enrollment, classIds: [...enrollment.classIds, classId] }
            : enrollment,
        ),
      }
    }
    return {
      ...member,
      status: 'active' as MemberStatus,
      enrollments: [
        {
          id: makeId('enr'),
          passName: '수강권 미지정',
          classIds: [classId],
          remainingCredits: 0,
          totalCredits: 0,
          paidAmount: 0,
          lastPaidAt: '',
          nextPaymentDue: '',
          payments: [],
        },
      ],
    }
  }

  function createSlotClass(
    dateKey: string,
    startTime: string,
    endTime: string,
    memberIds: string[],
  ) {
    const classId = makeId('class')
    const pickedMembers = members.filter((member) => memberIds.includes(member.id))
    // 2:1·3:1 레슨은 참여 회원 이름을 모두 담는다 (예: "김미영·이정아 개인레슨")
    const className = pickedMembers.length
      ? `${pickedMembers.map((member) => member.name).join('·')} 개인레슨`
      : '개인레슨'
    const startMinutes = minutesFromTime(startTime)
    const endMinutes = minutesFromTime(endTime)
    const [year, month, day] = dateKey.split('-').map(Number)
    setClasses((current) => [
      {
        id: classId,
        name: className,
        weekday: new Date(year, month - 1, day).getDay(),
        startTime: timeFromMinutes(startMinutes),
        // 종료가 시작보다 빠르면 기본 50분짜리로 만든다
        endTime: timeFromMinutes(
          endMinutes > startMinutes ? endMinutes : startMinutes + 50,
        ),
        location: '개인레슨',
        capacity: Math.max(1, memberIds.length),
        tuitionFee: 0,
        level: '전체',
        // 매주 반복되지 않고 이 날짜에만 열린다
        date: dateKey,
      },
      ...current,
    ])
    setMembers((current) =>
      current.map((member) =>
        memberIds.includes(member.id) ? attachClassToMember(member, classId) : member,
      ),
    )
    notify(`${timeFromMinutes(startMinutes)} 수업이 만들어졌습니다`)
  }

  function addGig(
    date: string,
    startTime: string,
    endTime: string,
    name: string,
    fee: number,
    repeatUntil?: string,
    skipHolidays?: boolean,
  ) {
    const startMinutes = minutesFromTime(startTime)
    const endMinutes = minutesFromTime(endTime)
    // 매주 반복: 시작 날짜부터 종료일까지 같은 요일로 생성 (공휴일 제외 옵션)
    const dates: string[] = []
    const [year, month, day] = date.split('-').map(Number)
    const cursor = new Date(year, month - 1, day)
    const limit = repeatUntil && repeatUntil > date ? repeatUntil : date
    let guard = 0
    while (toDateKey(cursor) <= limit && guard < 60) {
      const key = toDateKey(cursor)
      if (!(skipHolidays && isHoliday(key))) dates.push(key)
      cursor.setDate(cursor.getDate() + 7)
      guard += 1
    }
    if (!dates.length) {
      notify('추가할 날짜가 없어요 (공휴일 제외 조건 확인)')
      return
    }
    setGigs((current) => [
      ...current,
      ...dates.map((dateKey) => ({
        id: makeId('gig'),
        date: dateKey,
        startTime: timeFromMinutes(startMinutes),
        // 종료가 시작보다 빠르면 기본 50분짜리로 만든다
        endTime: timeFromMinutes(
          endMinutes > startMinutes ? endMinutes : startMinutes + 50,
        ),
        name: name.trim() || '외부 강의',
        fee,
      })),
    ])
    notify(
      dates.length > 1 ? `${dates.length}회 스케줄이 추가되었습니다` : '내 스케줄이 추가되었습니다',
    )
  }

  // 내 스케줄(외부 강의) 수정 — applyToSeries면 같은 묶음(같은 이름·시작 시간)의
  // 이 날짜 이후 반복 전체에 적용한다 (지난 일정은 정산 기록이라 건드리지 않음)
  function updateGig(
    gigId: string,
    data: { endTime: string; fee: number; name: string; startTime: string },
    applyToSeries: boolean,
  ) {
    const target = gigs.find((gig) => gig.id === gigId)
    if (!target) return
    const inSeries = (gig: Gig) =>
      gig.id === gigId ||
      (applyToSeries &&
        gig.name === target.name &&
        gig.startTime === target.startTime &&
        gig.date >= target.date)
    const startMinutes = minutesFromTime(data.startTime)
    const endMinutes = minutesFromTime(data.endTime)
    const name = data.name.trim() || target.name
    setGigs((current) =>
      current.map((gig) =>
        inSeries(gig)
          ? {
              ...gig,
              name,
              startTime: timeFromMinutes(startMinutes),
              endTime: timeFromMinutes(
                endMinutes > startMinutes ? endMinutes : startMinutes + 50,
              ),
              fee: data.fee,
            }
          : gig,
      ),
    )
    notify(applyToSeries ? '이후 반복 스케줄이 모두 수정되었습니다' : '스케줄이 수정되었습니다')
  }

  function removeGig(gigId: string) {
    setGigs((current) => current.filter((gig) => gig.id !== gigId))
    notify('스케줄이 삭제되었습니다')
  }

  // 매주 반복으로 만든 외부 강의 삭제 (같은 이름 + 같은 시작 시간 = 한 묶음).
  // 선택한 날짜부터 이후 것만 지운다 — 지난 일정은 정산·수입 기록이라 남겨둔다.
  function removeGigSeries(gigId: string) {
    const target = gigs.find((gig) => gig.id === gigId)
    if (!target) return
    const inSeriesFromDate = (gig: Gig) =>
      gig.name === target.name && gig.startTime === target.startTime && gig.date >= target.date
    const count = gigs.filter(inSeriesFromDate).length
    setGigs((current) => current.filter((gig) => !inSeriesFromDate(gig)))
    notify(`반복 스케줄 ${count}개가 삭제되었습니다 (지난 일정은 유지)`)
  }

  function updateClassTime(classId: string, startTime: string) {
    setClasses((current) =>
      current.map((danceClass) => {
        if (danceClass.id !== classId) return danceClass
        const duration =
          minutesFromTime(danceClass.endTime) - minutesFromTime(danceClass.startTime) || 50
        const startMinutes = minutesFromTime(startTime)
        return {
          ...danceClass,
          startTime: timeFromMinutes(startMinutes),
          endTime: timeFromMinutes(startMinutes + duration),
        }
      }),
    )
    notify('수업 시간이 변경되었습니다')
  }

  function removeClass(classId: string) {
    const target = classes.find((danceClass) => danceClass.id === classId)
    const refundResult = refundPrivateLessonCharges({
      charges: privateLessonCharges,
      classId,
    })
    if (refundResult.charges !== privateLessonCharges) {
      setPrivateLessonCharges(refundResult.charges)
    }
    if (target && isPrivateClass(target)) {
      setAttendance((current) =>
        Object.fromEntries(
          Object.entries(current).filter(([key]) => key.split('|')[1] !== classId),
        ),
      )
    }
    notify('수업이 삭제되었습니다')
    setClasses((current) => current.filter((danceClass) => danceClass.id !== classId))
    setMembers((current) =>
      current.map((member) => ({
        ...member,
        enrollments: member.enrollments.map((enrollment) => {
          const refundCount = refundResult.refunds.filter(
            (change) =>
              change.memberId === member.id && change.enrollmentId === enrollment.id,
          ).length
          return {
            ...enrollment,
            classIds: enrollment.classIds.filter((id) => id !== classId),
            remainingCredits: refundCount
              ? Math.min(
                  enrollment.totalCredits,
                  enrollment.remainingCredits + refundCount,
                )
              : enrollment.remainingCredits,
          }
        }),
      })),
    )
    setPassTemplates((current) =>
      current.map((pass) =>
        pass.classIds.includes(classId)
          ? { ...pass, classIds: pass.classIds.filter((id) => id !== classId) }
          : pass,
      ),
    )
  }

  function removeMember(memberId: string) {
    // 회원을 지워도 매출(정산) 기록은 보존 장부로 옮겨 남긴다
    const target = members.find((member) => member.id === memberId)
    const payments = target
      ? target.enrollments.flatMap((enrollment) =>
          enrollment.payments.map((payment) => {
            const classNames = enrollment.classIds.flatMap((classId) => {
              const danceClass = classes.find((item) => item.id === classId)
              return danceClass ? [danceClass.name] : []
            })
            return {
              ...payment,
              classNames: classNames.length
                ? [...new Set(classNames)]
                : enrollment.passName.includes('개인')
                  ? ['개인레슨']
                  : ['수업 정보 없음'],
              memberName: target.name,
              passName: enrollment.passName,
            }
          }),
        )
      : []
    if (payments.length) setPaymentArchive((current) => [...current, ...payments])
    notify(payments.length ? '회원이 삭제되었습니다 (결제 기록은 수납 내역에 보존)' : '회원이 삭제되었습니다')
    setMembers((current) => current.filter((member) => member.id !== memberId))
    setAttendance((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.endsWith(`|${memberId}`)),
      ),
    )
  }

  function exportData() {
    const payload = JSON.stringify(
      {
        members,
        classes,
        passTemplates,
        attendance,
        gigs,
        paymentArchive,
        privateLessonCharges,
        waitlistClasses,
      },
      null,
      2,
    )
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `라인댄스-백업-${todayKey}.json`
    link.click()
    URL.revokeObjectURL(url)
    localStorage.setItem(backupKey, todayKey)
    setLastBackupAt(todayKey)
    notify('백업 파일을 내보냈습니다')
  }

  function exportCsv() {
    const header = [
      '이름',
      '전화번호',
      '구분',
      '수강권',
      '잔여횟수',
      '총횟수',
      '누적결제액',
      '최근결제일',
      '다음결제일',
      '출석',
      '결석',
      '메모',
    ]
    const rows: Array<Array<string | number>> = []
    members.forEach((member) => {
      let present = 0
      let absent = 0
      for (const [key, status] of Object.entries(attendance)) {
        if (!key.endsWith(`|${member.id}`)) continue
        if (status === 'absent') absent += 1
        else present += 1
      }
      const target = member.enrollments.length
        ? member.enrollments
        : [
            {
              passName: '-',
              remainingCredits: 0,
              totalCredits: 0,
              lastPaidAt: '',
              nextPaymentDue: '',
              payments: [] as PaymentRecord[],
            },
          ]
      target.forEach((enrollment) => {
        rows.push([
          member.name,
          member.phone,
          memberStatusLabel(member.status),
          enrollment.passName,
          enrollment.remainingCredits,
          enrollment.totalCredits,
          enrollment.payments.reduce((sum, payment) => sum + payment.amount, 0),
          enrollment.lastPaidAt,
          enrollment.nextPaymentDue,
          present,
          absent,
          member.note.replaceAll('\n', ' '),
        ])
      })
    })
    const csv =
      '﻿' +
      [header, ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
        .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `라인댄스-회원명단-${todayKey}.csv`
    link.click()
    URL.revokeObjectURL(url)
    notify('엑셀 파일로 내보냈습니다')
  }

  function importData(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const saved = JSON.parse(String(reader.result)) as {
          members?: LegacyMember[]
          classes?: DanceClass[]
          passTemplates?: PassTemplate[]
          attendance?: AttendanceBook
          gigs?: Gig[]
          paymentArchive?: ArchivedPayment[]
          privateLessonCharges?: PrivateLessonChargeBook
          waitlistClasses?: WaitlistClass[]
        }
        if (!saved.members?.length && !saved.classes?.length) {
          window.alert('백업 파일 형식이 아닙니다.')
          return
        }
        if (!window.confirm('현재 데이터를 백업 파일 내용으로 교체할까요?')) return
        const importedMembers = dedupeClassOwnership(
          (saved.members ?? []).map(normalizeMember),
          saved.classes ?? [],
        )
        if (importedMembers.length) setMembers(importedMembers)
        if (saved.classes?.length)
          setClasses(sweepOrphanClasses(saved.classes, importedMembers, saved.passTemplates ?? []))
        if (saved.passTemplates?.length) setPassTemplates(saved.passTemplates)
        if (saved.attendance) setAttendance(saved.attendance)
        if (saved.gigs?.length) setGigs(saved.gigs)
        if (saved.paymentArchive?.length) setPaymentArchive(saved.paymentArchive)
        if (saved.privateLessonCharges) setPrivateLessonCharges(saved.privateLessonCharges)
        if (saved.waitlistClasses?.length) setWaitlistClasses(saved.waitlistClasses)
        notify('백업 가져오기가 완료되었습니다')
      } catch {
        window.alert('파일을 읽을 수 없습니다. 이 앱에서 내보낸 백업 파일인지 확인해 주세요.')
      }
    }
    reader.readAsText(file)
  }

  function openScheduleClass(classId: string) {
    setTab('schedule')
    setTimeout(() => {
      const target =
        document.getElementById(`class-card-${classId}`) ??
        document.getElementById('timeline-view')
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  }

  return (
    <main className={`appShell tab-${tab}`}>
      {tab === 'home' && (
        <HomeView
          backupAgeDays={backupAgeDays}
          backupOverdue={backupOverdue}
          expiringItems={expiringItems}
          lowCreditItems={lowCreditItems}
          members={members}
          onCopyText={copyText}
          onExport={exportData}
          onExportCsv={exportCsv}
          onImport={importData}
          onOpenSms={setSmsComposerMemberId}
          onOpenSchedule={openScheduleClass}
          onSaveSmsTemplates={saveSmsTemplates}
          setTab={setTab}
          smsTemplates={smsTemplates}
          sync={{
            code: syncCode,
            demo: isDemoMode,
            onConnect: connectSync,
            onDisconnect: disconnectSync,
            onStart: startSync,
            ready: firebaseReady && !isDemoMode,
            status: syncStatus,
          }}
          todayClasses={todayClasses}
          todayGigs={gigs.filter((gig) => gig.date === todayKey)}
          unpaidItems={unpaidItems}
          waitlistAlerts={waitlistAlerts}
        />
      )}
      {tab === 'schedule' && (
        <ScheduleView
          attendance={attendance}
          classes={classes}
          gigs={gigs}
          members={members}
          onAddGig={addGig}
          onCreateSlotClass={createSlotClass}
          onRemoveClass={removeClass}
          onRemoveGig={removeGig}
          onRemoveGigSeries={removeGigSeries}
          onSaveAttendance={saveClassAttendance}
          onUpdateClassTime={updateClassTime}
          onUpdateGig={updateGig}
          passTemplates={passTemplates}
        />
      )}
      {tab === 'members' && (
        <MembersView
          attendance={attendance}
          convertedMemberId={convertedMemberId}
          members={members}
          passTemplates={passTemplates}
          onAddEnrollment={addEnrollment}
          onAddMember={addMember}
          onAddPassTemplate={addPassTemplate}
          onConvertHandled={() => setConvertedMemberId(null)}
          onRemoveEnrollment={removeEnrollment}
          onRemoveMember={removeMember}
          onRemovePassTemplate={removePassTemplate}
          onUpdateEnrollment={updateEnrollment}
          onUpdateMember={updateMember}
          onUpdatePassTemplate={updatePassTemplate}
          query={query}
          setQuery={setQuery}
        />
      )}
      {tab === 'consultations' && (
        <ConsultationsView
          consultationMembers={consultationMembers}
          passTemplates={passTemplates}
          onAddConsultation={addConsultation}
          onAddWaitlistClass={addWaitlistClass}
          onConvertMember={convertToMember}
          onRemoveMember={removeMember}
          onRemoveWaitlistClass={removeWaitlistClass}
          onUpdateConsultation={updateConsultation}
          waitlistClasses={waitlistClasses}
          waitlistMembers={waitlistMembers}
        />
      )}
      {tab === 'attendance' && (
        <AttendanceView
          allMembers={activeMembers}
          attendance={attendance}
          attendanceDate={attendanceDate}
          classMembers={classMembers}
          classes={classes}
          onMarkAllPresent={markAllPresent}
          passTemplates={passTemplates}
          selectedClassId={selectedClass?.id ?? selectedClassId}
          setAttendanceDate={setAttendanceDate}
          setAttendanceStatus={setAttendanceStatus}
          setSelectedClassId={setSelectedClassId}
        />
      )}
      {tab === 'payments' && (
        <PaymentsView
          classes={classes}
          gigs={gigs}
          members={activeMembers}
          paymentArchive={paymentArchive}
          onNotify={notify}
          onOpenSms={setSmsComposerMemberId}
          onEndEnrollment={removeEnrollment}
          onQuickRenew={quickRenew}
          onRemovePayment={removePaymentRecord}
          onUpdatePaymentDate={updatePaymentDate}
          onUpdateEnrollment={updateEnrollment}
        />
      )}

      {fabDrawerId && (
        <button
          type="button"
          className="fab"
          aria-label="빠른 등록"
          onClick={() => {
            const drawer = document.getElementById(fabDrawerId) as HTMLDetailsElement | null
            if (!drawer) return
            drawer.open = true
            drawer.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }}
        >
          <Plus size={23} />
        </button>
      )}

      {smsComposerMemberId !== null && (
        <SmsComposer
          classes={classes}
          initialMemberId={smsComposerMemberId}
          members={activeMembers}
          onClose={() => setSmsComposerMemberId(null)}
          onCopy={copyText}
          smsHref={smsHref}
          templates={smsTemplates}
        />
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}

      <nav className="bottomNav" aria-label="주요 메뉴">
        <NavButton active={tab === 'home'} icon={<Home />} label="홈" onClick={() => setTab('home')} />
        <NavButton
          active={tab === 'schedule'}
          icon={<CalendarDays />}
          label="시간표"
          onClick={() => setTab('schedule')}
        />
        <NavButton
          active={tab === 'members'}
          icon={<Users />}
          label="회원"
          onClick={() => setTab('members')}
        />
        <NavButton
          active={tab === 'consultations'}
          icon={<ClipboardList />}
          label="상담"
          onClick={() => setTab('consultations')}
        />
        <NavButton
          active={tab === 'attendance'}
          icon={<CheckCircle2 />}
          label="출석"
          onClick={() => setTab('attendance')}
        />
        <NavButton
          active={tab === 'payments'}
          icon={<CircleDollarSign />}
          label="결제"
          onClick={() => setTab('payments')}
        />
      </nav>
    </main>
  )
}

function HomeView({
  backupAgeDays,
  backupOverdue,
  expiringItems,
  lowCreditItems,
  members,
  onCopyText,
  onExport,
  onExportCsv,
  onImport,
  onOpenSms,
  onOpenSchedule,
  onSaveSmsTemplates,
  setTab,
  smsTemplates,
  sync,
  todayClasses,
  todayGigs,
  unpaidItems,
  waitlistAlerts,
}: {
  backupAgeDays: number | null
  backupOverdue: boolean
  expiringItems: Array<{ member: Member; enrollment: Enrollment }>
  lowCreditItems: Array<{ member: Member; enrollment: Enrollment }>
  members: Member[]
  onCopyText: (text: string) => void
  onExport: () => void
  onExportCsv: () => void
  onImport: (file: File) => void
  onOpenSchedule: (classId: string) => void
  onOpenSms: (memberId: string) => void
  onSaveSmsTemplates: (templates: readonly SmsTemplate[]) => void
  setTab: (tab: Tab) => void
  smsTemplates: readonly SmsTemplate[]
  sync: SyncControls
  todayClasses: DanceClass[]
  todayGigs: Gig[]
  unpaidItems: Array<{ member: Member; enrollment: Enrollment }>
  waitlistAlerts: Array<{ capacity: number; count: number; passName: string }>
}) {
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  // 홈은 최대한 깔끔하게: 백업·동기화·문자 템플릿은 '설정'을 눌러야 보인다
  const [showTools, setShowTools] = useState(false)
  const sortedToday = [...todayClasses].sort((a, b) => a.startTime.localeCompare(b.startTime))
  // 회원 수업 + 내 스케줄(외부 강의)을 합쳐서 오늘 일정으로 본다
  const todayItems: Array<
    | { kind: 'class'; danceClass: DanceClass }
    | { kind: 'gig'; gig: Gig }
  > = [
    ...sortedToday.map((danceClass) => ({ danceClass, kind: 'class' as const })),
    ...todayGigs.map((gig) => ({ gig, kind: 'gig' as const })),
  ].sort((a, b) => {
    const aStart = a.kind === 'class' ? a.danceClass.startTime : a.gig.startTime
    const bStart = b.kind === 'class' ? b.danceClass.startTime : b.gig.startTime
    return aStart.localeCompare(bStart)
  })
  const timeSpans = todayItems.map((item) =>
    item.kind === 'class'
      ? { end: item.danceClass.endTime, name: item.danceClass.name, start: item.danceClass.startTime }
      : { end: item.gig.endTime, name: item.gig.name, start: item.gig.startTime },
  )
  const ongoingSpan = timeSpans.find(
    (item) =>
      minutesFromTime(item.start) <= nowMinutes && nowMinutes < minutesFromTime(item.end),
  )
  const upcomingSpan = timeSpans.find((item) => minutesFromTime(item.start) > nowMinutes)
  const ongoingClass = sortedToday.find(
    (item) =>
      minutesFromTime(item.startTime) <= nowMinutes &&
      nowMinutes < minutesFromTime(item.endTime),
  )
  const heroMessage = ongoingSpan
    ? `지금 진행 중 · ${ongoingSpan.name} ${ongoingSpan.start}~${ongoingSpan.end}`
    : upcomingSpan
      ? `다음 일정 ${upcomingSpan.start} · ${upcomingSpan.name}`
      : timeSpans.length
        ? '오늘 일정이 모두 끝났어요'
        : '오늘은 예정된 일정이 없어요'

  return (
    <section className="screen">
      <section className="heroBand">
        <div className="heroInfo">
          <p>
            {today.getMonth() + 1}월 {today.getDate()}일 {weekdays[today.getDay()]}요일
          </p>
          <strong>오늘 일정 {todayItems.length}개</strong>
          <span>{heroMessage}</span>
        </div>
        <button type="button" onClick={() => setTab('schedule')}>
          시간표 보기
          <ChevronRight size={15} />
        </button>
      </section>

      {/* 새 기기(빈 데이터)에서 처음 열었을 때: 동기화 연결을 바로 안내 */}
      {sync.ready && !sync.code && members.length === 0 && (
        <section className="panel syncStarterCard">
          <strong>다른 기기에서 쓰던 데이터가 있나요?</strong>
          <p className="hint">동기화 코드를 넣으면 회원·수업이 그대로 불러와져요.</p>
          <button
            type="button"
            className="primaryButton"
            onClick={() => {
              setShowTools(true)
              window.setTimeout(() => {
                const drawer = document.getElementById('drawer-sync') as HTMLDetailsElement | null
                if (drawer) {
                  drawer.open = true
                  drawer.scrollIntoView({ behavior: 'smooth', block: 'center' })
                }
              }, 60)
            }}
          >
            동기화 코드 입력하기
          </button>
        </section>
      )}

      <section className="panel">
        <h2>오늘 해야 할 수업</h2>
        <div className="listStack">
          {todayItems.map((item) => {
            if (item.kind === 'gig') {
              const gig = item.gig
              return (
                <button
                  type="button"
                  className="rowItem gigRow"
                  onClick={() => onOpenSchedule('')}
                  key={gig.id}
                >
                  <div className="rowTime gigTime">
                    <b>{gig.startTime}</b>
                    <span>{gig.endTime}</span>
                  </div>
                  <div className="rowBody">
                    <strong>{gig.name}</strong>
                    <small>내 스케줄(외부 강의) · {formatCurrency(gig.fee)}</small>
                  </div>
                  <ChevronRight size={16} className="rowChevron" />
                </button>
              )
            }
            const danceClass = item.danceClass
            const assigned = members.filter((member) =>
              memberClassIds(member).includes(danceClass.id),
            ).length
            const isLive = ongoingClass?.id === danceClass.id
            return (
              <button
                type="button"
                className={isLive ? 'rowItem live' : 'rowItem'}
                onClick={() => onOpenSchedule(danceClass.id)}
                key={danceClass.id}
              >
                <div className="rowTime">
                  <b>{danceClass.startTime}</b>
                  <span>{danceClass.endTime}</span>
                </div>
                <div className="rowBody">
                  <strong>
                    {danceClass.name}
                    {isLive && <em className="liveDot">진행 중</em>}
                  </strong>
                  <small>
                    <MapPin size={12} /> {danceClass.location} · 탭하면 시간표
                  </small>
                </div>
                <b className="rowCount">
                  {assigned}
                  <span>/{danceClass.capacity}</span>
                </b>
                <ChevronRight size={16} className="rowChevron" />
              </button>
            )
          })}
          {!todayItems.length && <p className="emptyText">오늘 등록된 수업이 없습니다.</p>}
        </div>
      </section>

      {unpaidItems.length > 0 && (
        <section className="panel unpaidPanel">
          <h2>🚨 미납 {unpaidItems.length}건</h2>
          <div className="listStack">
            {unpaidItems.map(({ enrollment, member }) => (
              <article className="taskRow danger" key={enrollment.id}>
                <div className="taskAvatar">{member.name.slice(0, 1)}</div>
                <div className="taskBody">
                  <strong>{member.name}</strong>
                  <span>{enrollment.passName} · {enrollmentSummaryLabel(enrollment)}</span>
                </div>
                <button
                  type="button"
                  className="smsButton"
                  onClick={() => onOpenSms(member.id)}
                  aria-label={`${member.name} 문자`}
                >
                  <MessageCircle size={17} />
                </button>
                <a className="callButton" href={`tel:${member.phone}`} aria-label={`${member.name} 전화`}>
                  <PhoneCall size={17} />
                </a>
              </article>
            ))}
          </div>
        </section>
      )}

      <section className="panel">
        <h2>우선 확인</h2>
        <div className="listStack">
          {/* 대기 정원이 찬 수업 — 개강 타이밍을 놓치지 않도록 맨 위에 알림 */}
          {waitlistAlerts.map((alert) => (
            <article className="taskRow danger" key={`wait-${alert.passName}`}>
              <div className="taskAvatar">
                <Users size={17} />
              </div>
              <div className="taskBody">
                <strong>대기 정원 참 — 개강 가능!</strong>
                <span>
                  {alert.passName} · 대기 {alert.count}/{alert.capacity}명
                </span>
              </div>
              <button
                type="button"
                className="callButton"
                onClick={() => setTab('consultations')}
                aria-label="대기 현황 보기"
              >
                <ChevronRight size={17} />
              </button>
            </article>
          ))}
          {lowCreditItems.map(({ enrollment, member }) => (
            <article className="taskRow warn" key={enrollment.id}>
              <div className="taskAvatar">{member.name.slice(0, 1)}</div>
              <div className="taskBody">
                <strong>{member.name}</strong>
                <span>
                  {enrollment.passName} · 잔여 {enrollment.remainingCredits}회 · 재결제 안내
                </span>
              </div>
              <button
                type="button"
                className="smsButton"
                onClick={() => onOpenSms(member.id)}
                aria-label={`${member.name} 문자`}
              >
                <MessageCircle size={17} />
              </button>
              <a className="callButton" href={`tel:${member.phone}`} aria-label={`${member.name} 전화`}>
                <PhoneCall size={17} />
              </a>
            </article>
          ))}
          {expiringItems.map(({ enrollment, member }) => (
            <article className="taskRow warn" key={enrollment.id}>
              <div className="taskAvatar">{member.name.slice(0, 1)}</div>
              <div className="taskBody">
                <strong>{member.name}</strong>
                <span>
                  {enrollment.passName} · 다음 결제 {enrollment.nextPaymentDue}
                </span>
              </div>
              <button
                type="button"
                className="smsButton"
                onClick={() => onOpenSms(member.id)}
                aria-label={`${member.name} 문자`}
              >
                <MessageCircle size={17} />
              </button>
              <a className="callButton" href={`tel:${member.phone}`} aria-label={`${member.name} 전화`}>
                <PhoneCall size={17} />
              </a>
            </article>
          ))}
          {backupOverdue && (
            <article className="taskRow warn" key="backup-task">
              <div className="taskAvatar">
                <Download size={17} />
              </div>
              <div className="taskBody">
                <strong>데이터 백업</strong>
                <span>
                  {backupAgeDays === null
                    ? '아직 백업한 적이 없어요'
                    : `마지막 백업 후 ${backupAgeDays}일 지남`}
                </span>
              </div>
              <button type="button" className="callButton" onClick={onExport} aria-label="지금 백업">
                <Download size={17} />
              </button>
            </article>
          )}
          {!expiringItems.length &&
            !lowCreditItems.length &&
            !backupOverdue &&
            !waitlistAlerts.length && <p className="emptyText">확인할 항목이 없습니다.</p>}
        </div>
      </section>

      {!showTools && (
        <button type="button" className="homeToolsToggle" onClick={() => setShowTools(true)}>
          <Settings2 size={14} /> 설정 (백업 · 동기화 · 문자 템플릿)
        </button>
      )}

      <div hidden={!showTools}>
      <details className="formDrawer">
        <summary>
          <span>
            <strong>문자 템플릿</strong>
            <small>추가·수정·삭제</small>
          </span>
          <i className="drawerIcon" aria-hidden="true">
            <ChevronRight size={16} />
          </i>
        </summary>
        <div className="drawerBody">
          <SmsTemplateSettings templates={smsTemplates} onChange={onSaveSmsTemplates} />
        </div>
      </details>

      <details className="formDrawer">
        <summary>
          <span>
            <strong>데이터 백업</strong>
            <small>
              {backupAgeDays === null
                ? '백업 기록 없음'
                : `마지막 백업: ${backupAgeDays === 0 ? '오늘' : `${backupAgeDays}일 전`}`}
            </small>
          </span>
          <i className="drawerIcon static" aria-hidden="true">
            <Download size={16} />
          </i>
        </summary>
        <div className="drawerBody">
          <p className="hint ruleHint">
            복원용 백업 = 실수로 지웠을 때 되돌리는 보험. 엑셀 = 회원 명단 공유용.
          </p>
          <div className="split backupActions">
            <button type="button" className="secondaryButton" onClick={onExport}>
              복원용 백업 저장
            </button>
            <label className="secondaryButton importButton">
              백업 불러오기
              <input
                type="file"
                accept="application/json,.json"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) onImport(file)
                  event.target.value = ''
                }}
              />
            </label>
            <button type="button" className="secondaryButton" onClick={onExportCsv}>
              엑셀로 내보내기
            </button>
          </div>
        </div>
      </details>

      <SyncDrawer sync={sync} onCopy={onCopyText} />
      </div>
    </section>
  )
}

function SyncDrawer({ sync, onCopy }: { sync: SyncControls; onCopy: (text: string) => void }) {
  const statusLabel = !sync.code
    ? '연결 안 됨'
    : sync.status === 'live'
      ? '실시간 동기화 중'
      : sync.status === 'connecting'
        ? '연결 중…'
        : sync.status === 'error'
          ? '연결 오류 (잠시 후 자동 재시도)'
          : '대기 중'

  return (
    <details className="formDrawer syncDrawer" id="drawer-sync">
      <summary>
        <span>
          <strong>기기 동기화</strong>
          <small>{statusLabel}</small>
        </span>
        <i className="drawerIcon static" aria-hidden="true">
          <RefreshCw size={16} />
        </i>
      </summary>
      <div className="drawerBody">
        {!sync.ready ? (
          <p className="hint ruleHint">
            {sync.demo
              ? '데모 모드에서는 기기 동기화를 사용할 수 없어요. 실제 모드에서 이용해 주세요.'
              : '아직 동기화 서버가 설정되지 않았어요. 설정을 마치면 폰과 PC에서 같은 데이터를 실시간으로 함께 볼 수 있어요. 지금은 이 기기에만 저장돼요.'}
          </p>
        ) : !sync.code ? (
          <>
            <p className="hint ruleHint">
              폰과 PC에서 같은 데이터를 보려면, 한 기기에서 코드를 만들고 다른 기기에 그 코드를
              입력하세요.
            </p>
            <button type="button" className="primaryButton" onClick={sync.onStart}>
              이 기기에서 동기화 코드 만들기
            </button>
            <form
              className="split syncConnectForm"
              onSubmit={(event) => {
                event.preventDefault()
                const input = event.currentTarget.elements.namedItem('code') as HTMLInputElement
                sync.onConnect(input.value)
                input.value = ''
              }}
            >
              <input
                name="code"
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="다른 기기의 코드 입력"
              />
              <button type="submit" className="secondaryButton">
                연결
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="hint ruleHint">
              이 코드를 다른 기기의 "코드 입력"에 넣으면 같은 데이터를 실시간으로 함께 봐요.
            </p>
            <div className="syncCodeRow">
              <code className="syncCode">{sync.code}</code>
              <button type="button" className="secondaryButton" onClick={() => onCopy(sync.code)}>
                코드 복사
              </button>
            </div>
            <button type="button" className="secondaryButton" onClick={sync.onDisconnect}>
              동기화 해제
            </button>
          </>
        )}
      </div>
    </details>
  )
}

function ScheduleView({
  attendance,
  classes,
  gigs,
  members,
  onAddGig,
  onCreateSlotClass,
  onRemoveClass,
  onRemoveGig,
  onRemoveGigSeries,
  onSaveAttendance,
  onUpdateClassTime,
  onUpdateGig,
  passTemplates,
}: {
  attendance: AttendanceBook
  classes: DanceClass[]
  gigs: Gig[]
  members: Member[]
  onAddGig: (
    date: string,
    startTime: string,
    endTime: string,
    name: string,
    fee: number,
    repeatUntil?: string,
    skipHolidays?: boolean,
  ) => void
  onCreateSlotClass: (
    dateKey: string,
    startTime: string,
    endTime: string,
    memberIds: string[],
  ) => void
  onRemoveClass: (classId: string) => void
  onRemoveGig: (gigId: string) => void
  onRemoveGigSeries: (gigId: string) => void
  onSaveAttendance: (
    date: string,
    classId: string,
    marks: Record<string, AttendanceStatus>,
  ) => void
  onUpdateClassTime: (classId: string, startTime: string) => void
  onUpdateGig: (
    gigId: string,
    data: { endTime: string; fee: number; name: string; startTime: string },
    applyToSeries: boolean,
  ) => void
  passTemplates: PassTemplate[]
}) {
  const weekDates = getWeekDates(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMonth, setViewMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const monthDates = getMonthDates(viewMonth)
  const selectedWeekday = selectedDate.getDay()
  const selectedDateKey = toDateKey(selectedDate)
  const selectedDayClasses = classesOnDate(classes, selectedDate)
  const selectedDayGigs = gigs.filter((gig) => gig.date === selectedDateKey)
  const dayClassHours = [
    ...new Set([
      ...selectedDayClasses.map((danceClass) => hourFromTime(danceClass.startTime)),
      ...selectedDayGigs.map((gig) => hourFromTime(gig.startTime)),
    ]),
  ].sort((a, b) => a - b)
  const classColorIndex = new Map(classes.map((danceClass, index) => [danceClass.id, index % 6]))

  return (
    <section className="screen">
      <section className="panel schedulePanel">
        <div className="scheduleHeader">
          <div>
            <h2>이번 주 시간표</h2>
            <p>{formatMonthDay(weekDates[0])} - {formatMonthDay(weekDates[6])}</p>
          </div>
          <span>10시 이후</span>
        </div>

        <div className="dayStrip">
          {weekDates.map((date) => {
            const count =
              classesOnDate(classes, date).length +
              gigs.filter((gig) => gig.date === toDateKey(date)).length
            const isSelected = toDateKey(date) === selectedDateKey
            const isRed = date.getDay() === 0 || isHoliday(toDateKey(date))
            return (
              <button
                type="button"
                className={`${toDateKey(date) === todayKey ? 'today' : ''} ${
                  isSelected ? 'selected' : ''
                } ${isRed ? 'redday' : ''}`}
                onClick={() => setSelectedDate(date)}
                key={toDateKey(date)}
              >
                <strong>{weekdays[date.getDay()]}</strong>
                <span>{formatMonthDay(date)}</span>
                <b>{count}</b>
              </button>
            )
          })}
        </div>

        <div className="monthCalendar">
          <div className="monthCalendarHead">
            <div className="monthNav">
              <button
                type="button"
                aria-label="이전 달"
                onClick={() =>
                  setViewMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() - 1, 1),
                  )
                }
              >
                ‹
              </button>
              <strong>
                {viewMonth.getFullYear()}.{String(viewMonth.getMonth() + 1).padStart(2, '0')}
              </strong>
              <button
                type="button"
                aria-label="다음 달"
                onClick={() =>
                  setViewMonth(
                    (current) => new Date(current.getFullYear(), current.getMonth() + 1, 1),
                  )
                }
              >
                ›
              </button>
            </div>
            <span>{formatMonthDay(selectedDate)} {weekdays[selectedWeekday]}요일 선택됨</span>
          </div>
          <div className="monthWeekdays">
            {weekdays.map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="monthGrid">
            {monthDates.map((date) => {
              const dateKey = toDateKey(date)
              const dayClasses = classesOnDate(classes, date).sort((a, b) =>
                a.startTime.localeCompare(b.startTime),
              )
              const dayGigCount = gigs.filter((gig) => gig.date === dateKey).length
              return (
                <button
                  type="button"
                  className={`${date.getMonth() !== viewMonth.getMonth() ? 'outside' : ''} ${
                    dateKey === todayKey ? 'today' : ''
                  } ${dateKey === selectedDateKey ? 'selected' : ''} ${
                    date.getDay() === 0 || isHoliday(dateKey) ? 'redday' : ''
                  }`}
                  onClick={() => {
                    setSelectedDate(date)
                    document
                      .getElementById('timeline-view')
                      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  key={dateKey}
                >
                  <b>{date.getDate()}</b>
                  <span className="dotRow">
                    {dayClasses.slice(0, 4).map((danceClass) => (
                      <i
                        className={`dot chip-${classColorIndex.get(danceClass.id) ?? 0}`}
                        key={danceClass.id}
                      />
                    ))}
                    {dayGigCount > 0 && dayClasses.length < 4 && <i className="dot gigDot" />}
                    {dayClasses.length > 4 && <em className="dotMore">+{dayClasses.length - 4}</em>}
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        <div className="timelineTitle" id="timeline-view">
          <strong>10시 이후 시간대별 보기</strong>
          <span>{weekdays[selectedWeekday]}요일 {formatMonthDay(selectedDate)} 수업만 보기</span>
        </div>
        <div className="hourTimeline">
          {dayClassHours.map((hour) => {
            const rowClasses = selectedDayClasses
              .filter((danceClass) => hourFromTime(danceClass.startTime) === hour)
              .sort((a, b) => a.startTime.localeCompare(b.startTime))
            const rowGigs = selectedDayGigs.filter(
              (gig) => hourFromTime(gig.startTime) === hour,
            )
            return (
              <article className="hourRow hasClass" key={hour}>
                <div className="hourStamp">{hour}:00</div>
                <div className="hourCards">
                  {rowClasses.map((danceClass) => (
                    <TimeClassCard
                      attendance={attendance}
                      danceClass={danceClass}
                      dateKey={selectedDateKey}
                      members={members}
                      onRemoveClass={onRemoveClass}
                      onSaveAttendance={onSaveAttendance}
                      onUpdateClassTime={onUpdateClassTime}
                      key={danceClass.id}
                    />
                  ))}
                  {rowGigs.map((gig) => (
                    <GigTimeCard
                      gig={gig}
                      seriesCount={
                        gigs.filter(
                          (item) =>
                            item.name === gig.name &&
                            item.startTime === gig.startTime &&
                            item.date >= gig.date,
                        ).length
                      }
                      onRemoveGig={onRemoveGig}
                      onRemoveGigSeries={onRemoveGigSeries}
                      onUpdateGig={onUpdateGig}
                      key={gig.id}
                    />
                  ))}
                </div>
              </article>
            )
          })}
          {!dayClassHours.length && (
            <p className="emptyText">이 날은 확정된 수업이 없어요.</p>
          )}
          <QuickAddClass
            members={members}
            passTemplates={passTemplates}
            onCreate={(startTime, endTime, memberIds) =>
              onCreateSlotClass(selectedDateKey, startTime, endTime, memberIds)
            }
          />
          <QuickAddGig
            baseDateKey={selectedDateKey}
            onCreate={(startTime, endTime, name, fee, repeatUntil, skipHolidays) =>
              onAddGig(selectedDateKey, startTime, endTime, name, fee, repeatUntil, skipHolidays)
            }
          />
        </div>
      </section>
    </section>
  )
}

// 내 스케줄(외부 강의) 카드. 수정 버튼으로 이름·시간·비용을 고칠 수 있고,
// 매주 반복으로 만든 스케줄이면 수정·삭제 시 "이 날짜만 / 이후 반복 전체"를 선택하게 한다.
function GigTimeCard({
  gig,
  seriesCount,
  onRemoveGig,
  onRemoveGigSeries,
  onUpdateGig,
}: {
  gig: Gig
  seriesCount: number
  onRemoveGig: (gigId: string) => void
  onRemoveGigSeries: (gigId: string) => void
  onUpdateGig: (
    gigId: string,
    data: { endTime: string; fee: number; name: string; startTime: string },
    applyToSeries: boolean,
  ) => void
}) {
  const [choosing, setChoosing] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(gig.name)
  const [draftStart, setDraftStart] = useState(gig.startTime)
  const [draftEnd, setDraftEnd] = useState(gig.endTime)
  const [draftFee, setDraftFee] = useState(String(gig.fee))

  function startEditing() {
    setDraftName(gig.name)
    setDraftStart(gig.startTime)
    setDraftEnd(gig.endTime)
    setDraftFee(String(gig.fee))
    setChoosing(false)
    setEditing(true)
  }

  function saveEditing(applyToSeries: boolean) {
    onUpdateGig(
      gig.id,
      { endTime: draftEnd, fee: Number(draftFee) || 0, name: draftName, startTime: draftStart },
      applyToSeries,
    )
    setEditing(false)
  }

  return (
    <div className="timeClassCard gigCard">
      <div className="timeClassTop">
        <div>
          <b className="gigBadge">내 스케줄</b>
          <strong>{gig.name}</strong>
          <span>{gig.startTime} - {gig.endTime}</span>
        </div>
        <small>{formatCurrency(gig.fee)}</small>
      </div>
      {editing && (
        <div className="draftRoster slotRoster">
          <Field label="수업명">
            <input
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="예: 문화센터 출강"
            />
          </Field>
          <div className="split">
            <Field label="시작 시간">
              <input
                type="time"
                value={draftStart}
                onChange={(event) => {
                  const nextStart = event.target.value
                  setDraftStart(nextStart)
                  // 시작을 옮기면 종료도 같은 길이만큼 따라간다
                  const duration =
                    minutesFromTime(draftEnd) - minutesFromTime(draftStart) || 50
                  setDraftEnd(timeFromMinutes(minutesFromTime(nextStart) + duration))
                }}
              />
            </Field>
            <Field label="종료 시간">
              <input
                type="time"
                value={draftEnd}
                onChange={(event) => setDraftEnd(event.target.value)}
              />
            </Field>
          </div>
          <Field label="회당 비용">
            <input
              type="number"
              min="0"
              value={draftFee}
              onChange={(event) => setDraftFee(event.target.value)}
            />
          </Field>
          {seriesCount > 1 ? (
            <div className="gigDeleteChoice">
              <p>매주 반복으로 등록된 스케줄이에요. 어디까지 적용할까요?</p>
              <div className="choiceButtons">
                <button
                  type="button"
                  className="secondaryButton"
                  onClick={() => saveEditing(false)}
                >
                  이 날짜만 저장
                </button>
                <button type="button" className="draftConfirm" onClick={() => saveEditing(true)}>
                  이후 반복 모두 저장 ({seriesCount}개)
                </button>
              </div>
              <button type="button" className="draftCancel" onClick={() => setEditing(false)}>
                취소
              </button>
            </div>
          ) : (
            <div className="draftFoot">
              <button type="button" className="draftCancel" onClick={() => setEditing(false)}>
                취소
              </button>
              <button type="button" className="draftConfirm" onClick={() => saveEditing(false)}>
                저장
              </button>
            </div>
          )}
        </div>
      )}
      {!editing && !choosing && (
        <div className="cardActions gigActions">
          <button type="button" className="timeSaveButton gigEdit" onClick={startEditing}>
            수정
          </button>
          <button
            type="button"
            className="timeDeleteButton gigDelete"
            onClick={() => {
              if (seriesCount > 1) {
                setChoosing(true)
              } else if (window.confirm(`'${gig.name}' 스케줄을 삭제할까요?`)) {
                onRemoveGig(gig.id)
              }
            }}
          >
            삭제
          </button>
        </div>
      )}
      {!editing && choosing && (
        <div className="gigDeleteChoice">
          <p>매주 반복으로 등록된 스케줄이에요. 지난 일정은 정산 기록으로 남습니다.</p>
          <div className="choiceButtons">
            <button type="button" className="secondaryButton" onClick={() => onRemoveGig(gig.id)}>
              이 날짜만 삭제
            </button>
            <button
              type="button"
              className="dangerButton"
              onClick={() => {
                if (
                  window.confirm(
                    `'${gig.name}' ${gig.date}부터 이후 반복 ${seriesCount}개를 삭제할까요?\n(지난 일정은 남습니다)`,
                  )
                ) {
                  onRemoveGigSeries(gig.id)
                }
              }}
            >
              이후 반복 삭제 ({seriesCount}개)
            </button>
          </div>
          <button type="button" className="draftCancel" onClick={() => setChoosing(false)}>
            취소
          </button>
        </div>
      )}
    </div>
  )
}

function TimeClassCard({
  attendance,
  danceClass,
  dateKey,
  members,
  onRemoveClass,
  onSaveAttendance,
  onUpdateClassTime,
}: {
  attendance: AttendanceBook
  danceClass: DanceClass
  dateKey: string
  members: Member[]
  onRemoveClass: (classId: string) => void
  onSaveAttendance: (
    date: string,
    classId: string,
    marks: Record<string, AttendanceStatus>,
  ) => void
  onUpdateClassTime: (classId: string, startTime: string) => void
}) {
  const [mode, setMode] = useState<'idle' | 'check'>('idle')
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({})
  // 시간 변경·삭제는 자주 쓰지 않으므로 톱니 버튼을 눌렀을 때만 펼친다 (카드 높이 절약)
  const [showEdit, setShowEdit] = useState(false)
  const [timeValue, setTimeValue] = useState(danceClass.startTime)
  // 기간 만료·횟수 소진, 또는 수강 시작 전(결제일 이전 날짜)의 회원은 명단에 뜨지 않는다.
  // 단, 그 날짜에 출석 기록이 이미 있으면 항상 보인다 (날짜별 이력과 시간표 일치 보장)
  const assignedMembers = members
    .filter((member) => {
      if (!memberClassIds(member).includes(danceClass.id)) return false
      if (attendance[attendanceKey(dateKey, danceClass.id, member.id)]) return true
      if (member.status !== 'active') return false
      const enrollment = enrollmentForClass(member, danceClass.id)
      if (!enrollment) return true
      if (enrollmentStatus(enrollment) === 'unpaid') return false
      if (enrollment.lastPaidAt && dateKey < enrollment.lastPaidAt) return false
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const checkedCount = assignedMembers.filter(
    (member) => attendance[attendanceKey(dateKey, danceClass.id, member.id)],
  ).length

  function startChecking() {
    const initial: Record<string, AttendanceStatus> = {}
    assignedMembers.forEach((member) => {
      const status = attendance[attendanceKey(dateKey, danceClass.id, member.id)]
      if (status) initial[member.id] = status === 'makeup' ? 'present' : status
    })
    setDraft(initial)
    setMode('check')
  }

  function confirmChecking() {
    onSaveAttendance(dateKey, danceClass.id, draft)
    setMode('idle')
  }

  return (
    <div className="timeClassCard" id={`class-card-${danceClass.id}`}>
      <div className="timeClassTop">
        <div>
          <b>{weekdays[danceClass.weekday]}</b>
          <strong>{danceClass.name}</strong>
          <span>{danceClass.startTime} - {danceClass.endTime}</span>
        </div>
        <small>
          {assignedMembers.length}/{danceClass.capacity}명
          {danceClass.tuitionFee > 0 && <> · {formatCurrency(danceClass.tuitionFee)}</>}
        </small>
      </div>

      {mode === 'idle' && (
        <div className="cardActions">
          {/* 개인레슨은 여기서 출석 체크하지 않는다 — 횟수 차감은 출석 탭에서만 */}
          {!isPrivateClass(danceClass) && (
            <button type="button" className="checkStartButton" onClick={startChecking}>
              {checkedCount > 0 ? '출석 수정' : '출석 체크'}
              {assignedMembers.length > 0 && ` (${checkedCount}/${assignedMembers.length})`}
            </button>
          )}
          {isPrivateClass(danceClass) && (
            <>
              <span className="privateHint">출석은 출석 탭에서</span>
              <button
                type="button"
                className={showEdit ? 'cardEditToggle on' : 'cardEditToggle'}
                aria-label="수업 시간 변경·삭제"
                onClick={() => setShowEdit((current) => !current)}
              >
                <Settings2 size={17} />
              </button>
            </>
          )}
        </div>
      )}

      {/* 개인레슨만 여기서 시간 변경·삭제. 단체반 수업의 시간·삭제는 '수강권 관리'에서 */}
      {mode === 'idle' && showEdit && isPrivateClass(danceClass) && (
        <div className="privateActions">
          <input
            type="time"
            value={timeValue}
            onChange={(event) => setTimeValue(event.target.value)}
            aria-label="수업 시작 시간"
          />
          <button
            type="button"
            className="timeSaveButton"
            onClick={() => onUpdateClassTime(danceClass.id, timeValue)}
          >
            시간 변경
          </button>
          <button
            type="button"
            className="timeDeleteButton"
            onClick={() => {
              if (
                window.confirm(
                    `'${danceClass.name}' 수업을 시간표에서 삭제할까요?${isPrivateClass(danceClass) ? ' (이미 자동 차감된 횟수는 복구됩니다)' : ' (수강권은 유지됩니다)'}`,
                )
              ) {
                onRemoveClass(danceClass.id)
              }
            }}
          >
            삭제
          </button>
        </div>
      )}

      {mode === 'check' && (
        <div className="draftRoster">
          {assignedMembers.map((member) => (
            <div className="draftRow" key={member.id}>
              <span>{member.name}</span>
              <div className="draftButtons">
                <button
                  type="button"
                  className={draft[member.id] === 'present' ? 'on' : ''}
                  onClick={() =>
                    setDraft((current) => ({ ...current, [member.id]: 'present' }))
                  }
                >
                  출석
                </button>
                <button
                  type="button"
                  className={draft[member.id] === 'absent' ? 'on absent' : ''}
                  onClick={() =>
                    setDraft((current) => ({ ...current, [member.id]: 'absent' }))
                  }
                >
                  결석
                </button>
              </div>
            </div>
          ))}
          {!assignedMembers.length && <em className="draftEmpty">배정된 회원 없음</em>}
          <div className="draftFoot">
            <button type="button" className="draftCancel" onClick={() => setMode('idle')}>
              취소
            </button>
            <button type="button" className="draftConfirm" onClick={confirmChecking}>
              확인
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

function QuickAddClass({
  members,
  onCreate,
  passTemplates,
}: {
  members: Member[]
  onCreate: (startTime: string, endTime: string, memberIds: string[]) => void
  passTemplates: PassTemplate[]
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const [endTime, setEndTime] = useState('10:50')
  const pickedCount = Object.values(picked).filter(Boolean).length
  // 여기서 만드는 건 개인레슨뿐이므로, 개인레슨 수강권을 가진 회원만 보여준다
  const privatePassNames = new Set(
    passTemplates.filter((pass) => pass.type === 'private').map((pass) => pass.name),
  )
  const privateMembers = members
    .filter((member) =>
      member.enrollments.some((enrollment) => privatePassNames.has(enrollment.passName)),
    )
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const searched = searchTerm
    ? privateMembers.filter((member) =>
        `${member.name} ${member.phone}`.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : privateMembers

  if (!open) {
    return (
      <button
        type="button"
        className="emptySlotButton"
        onClick={() => {
          setPicked({})
          setSearchTerm('')
          setOpen(true)
        }}
      >
        + 이 날짜에 수업·개인레슨 바로 추가
      </button>
    )
  }

  return (
    <div className="timeClassCard">
      <div className="draftRoster slotRoster">
        <div className="split">
          <Field label="시작 시간">
            <input
              type="time"
              value={startTime}
              onChange={(event) => {
                const nextStart = event.target.value
                setStartTime(nextStart)
                // 시작을 옮기면 종료도 같은 길이만큼 따라간다
                const duration = minutesFromTime(endTime) - minutesFromTime(startTime) || 50
                setEndTime(timeFromMinutes(minutesFromTime(nextStart) + duration))
              }}
            />
          </Field>
          <Field label="종료 시간">
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </Field>
        </div>
        <p className="draftGuide">
          개인레슨 수강권이 있는 회원만 보여요 · 최대 3명(2:1·3:1 레슨)까지 선택
        </p>
        <input
          type="search"
          className="pickSearch"
          placeholder="이름·전화번호 검색"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
        {searched.map((member) => (
          <button
            type="button"
            className={picked[member.id] ? 'pickRow on' : 'pickRow'}
            onClick={() =>
              setPicked((current) => {
                // 최대 3명까지만 (2:1·3:1 레슨)
                if (!current[member.id] && pickedCount >= 3) return current
                return { ...current, [member.id]: !current[member.id] }
              })
            }
            key={member.id}
          >
            <span className="pickInfo">
              <strong>
                {member.name}
                {member.status !== 'active' && (
                  <em className="pickStatus">{memberStatusLabel(member.status)}</em>
                )}
              </strong>
              <small>
                {member.phone}
                {member.enrollments[0] && ` · ${member.enrollments[0].passName}`}
              </small>
            </span>
            <b>{picked[member.id] ? '선택됨' : '선택'}</b>
          </button>
        ))}
        {!searched.length && (
          <em className="draftEmpty">
            {searchTerm
              ? '검색 결과가 없습니다'
              : '개인레슨 수강권을 가진 회원이 없어요. 회원 탭에서 개인레슨 수강권을 먼저 추가해 주세요.'}
          </em>
        )}
        <div className="draftFoot">
          <button type="button" className="draftCancel" onClick={() => setOpen(false)}>
            취소
          </button>
          <button
            type="button"
            className="draftConfirm"
            disabled={!pickedCount}
            onClick={() => {
              onCreate(
                startTime,
                endTime,
                Object.entries(picked)
                  .filter(([, isPicked]) => isPicked)
                  .map(([memberId]) => memberId),
              )
              setOpen(false)
            }}
          >
            {pickedCount ? `${startTime}에 ${pickedCount}명 레슨 만들기` : '회원을 선택하세요'}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuickAddGig({
  baseDateKey,
  onCreate,
}: {
  baseDateKey: string
  onCreate: (
    startTime: string,
    endTime: string,
    name: string,
    fee: number,
    repeatUntil?: string,
    skipHolidays?: boolean,
  ) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('14:00')
  const [endTime, setEndTime] = useState('14:50')
  const [fee, setFee] = useState('60000')
  const [repeat, setRepeat] = useState<'none' | 'weekly' | 'weeklyNoHoliday'>('none')
  const [repeatUntil, setRepeatUntil] = useState(addMonthsFrom(baseDateKey, 2))
  const repeatWeekly = repeat !== 'none'

  if (!open) {
    return (
      <button type="button" className="emptySlotButton" onClick={() => setOpen(true)}>
        + 내 스케줄(외부 강의) 추가
      </button>
    )
  }

  return (
    <div className="timeClassCard gigCard">
      <div className="draftRoster slotRoster">
        <Field label="수업명">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 문화센터 출강"
          />
        </Field>
        <div className="split">
          <Field label="시작 시간">
            <input
              type="time"
              value={startTime}
              onChange={(event) => {
                const nextStart = event.target.value
                setStartTime(nextStart)
                // 시작을 옮기면 종료도 같은 길이만큼 따라간다
                const duration = minutesFromTime(endTime) - minutesFromTime(startTime) || 50
                setEndTime(timeFromMinutes(minutesFromTime(nextStart) + duration))
              }}
            />
          </Field>
          <Field label="종료 시간">
            <input
              type="time"
              value={endTime}
              onChange={(event) => setEndTime(event.target.value)}
            />
          </Field>
        </div>
        <Field label="회당 비용">
          <input
            type="number"
            min="0"
            value={fee}
            onChange={(event) => setFee(event.target.value)}
          />
        </Field>
        <div className="field">
          <span>반복</span>
          <div className="paymentFilters categoryChips" role="tablist" aria-label="반복">
            {(
              [
                { label: '안 함', value: 'none' },
                { label: '매주', value: 'weekly' },
                { label: '매주 · 빨간날 제외', value: 'weeklyNoHoliday' },
              ] as const
            ).map((option) => (
              <button
                type="button"
                className={repeat === option.value ? 'active' : ''}
                onClick={() => setRepeat(option.value)}
                key={option.value}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
        {repeatWeekly && (
          <Field
            label={`반복 종료일 (${Number(baseDateKey.slice(5, 7))}월 ${Number(baseDateKey.slice(8, 10))}일부터 이 날짜까지 매주)`}
          >
            <input
              type="date"
              value={repeatUntil}
              min={baseDateKey}
              onChange={(event) => setRepeatUntil(event.target.value)}
            />
          </Field>
        )}
        <div className="draftFoot">
          <button type="button" className="draftCancel" onClick={() => setOpen(false)}>
            취소
          </button>
          <button
            type="button"
            className="draftConfirm"
            onClick={() => {
              onCreate(
                startTime,
                endTime,
                name,
                Number(fee) || 0,
                repeatWeekly ? repeatUntil : undefined,
                repeat === 'weeklyNoHoliday',
              )
              setOpen(false)
              setName('')
            }}
          >
            {repeatWeekly ? '매주 반복으로 추가' : '스케줄 추가'}
          </button>
        </div>
      </div>
    </div>
  )
}

function MembersView({
  attendance,
  convertedMemberId,
  members,
  passTemplates,
  onAddEnrollment,
  onAddMember,
  onAddPassTemplate,
  onConvertHandled,
  onRemoveEnrollment,
  onRemoveMember,
  onRemovePassTemplate,
  onUpdateEnrollment,
  onUpdateMember,
  onUpdatePassTemplate,
  query,
  setQuery,
}: {
  attendance: AttendanceBook
  convertedMemberId: string | null
  members: Member[]
  passTemplates: PassTemplate[]
  onAddEnrollment: (memberId: string, passTemplateId: string) => void
  onAddMember: (formData: FormData) => void
  onAddPassTemplate: (formData: FormData) => void
  onConvertHandled: () => void
  onRemoveEnrollment: (memberId: string, enrollmentId: string) => void
  onRemoveMember: (memberId: string) => void
  onRemovePassTemplate: (passId: string) => void
  onUpdateEnrollment: (memberId: string, enrollmentId: string, formData: FormData) => void
  onUpdateMember: (memberId: string, formData: FormData) => void
  onUpdatePassTemplate: (passId: string, formData: FormData) => void
  query: string
  setQuery: (query: string) => void
}) {
  const [editingMemberId, setEditingMemberId] = useState<string | null>(convertedMemberId)
  const [openMemberId, setOpenMemberId] = useState<string | null>(convertedMemberId)
  const [quickFilter, setQuickFilter] = useState<'all' | 'unpaid' | 'soon' | 'low'>('all')
  const [passFormType, setPassFormType] = useState<LessonType>('line_group')
  // 시작 시간을 고르면 종료 시간은 자동으로 1시간 뒤 (직접 수정 가능)
  const [passStart, setPassStart] = useState('10:00')
  const [passEnd, setPassEnd] = useState('11:00')
  const [passCategory, setPassCategory] = useState<LessonType | 'all'>('all')
  const passCategories: Array<{ label: string; value: LessonType | 'all' }> = [
    { label: '전체', value: 'all' },
    { label: '라인댄스', value: 'line_group' },
    { label: '라틴댄스', value: 'latin_group' },
    { label: '개인레슨', value: 'private' },
  ]
  const visiblePasses =
    passCategory === 'all'
      ? passTemplates
      : passTemplates.filter((pass) => pass.type === passCategory)

  useEffect(() => {
    if (convertedMemberId) onConvertHandled()
  }, [convertedMemberId, onConvertHandled])

  const filtered = members
    .filter((member) => {
      // 회원 목록에는 등록 회원만 — 상담(상담만/대기) 상태는 상담 탭에서 관리한다
      if (member.status !== 'active') return false
      if (query) {
        const haystack = `${member.name} ${member.phone} ${member.note}`.toLowerCase()
        return haystack.includes(query.toLowerCase())
      }
      const worst = memberWorstStatus(member)
      if (quickFilter === 'unpaid' && worst !== 'unpaid') return false
      if (quickFilter === 'soon' && worst !== 'soon') return false
      if (
        quickFilter === 'low' &&
        !member.enrollments.some(
          (enrollment) => enrollment.totalCredits > 0 && enrollment.remainingCredits <= 2,
        )
      )
        return false
      return true
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const quickFilters: Array<{ label: string; value: typeof quickFilter }> = [
    { label: '전체', value: 'all' },
    { label: '미납', value: 'unpaid' },
    { label: '임박', value: 'soon' },
    { label: '잔여 부족', value: 'low' },
  ]

  return (
    <section className="screen memberDirectory">
      <section className="memberDirectoryHero">
        <div className="memberHeroTitle">
          <span>조건별 회원 조회</span>
          <strong>필요한 회원을 빠르게 찾기</strong>
        </div>
        <div className="searchBox memberSearchBox">
          <Search size={18} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="회원명, 전화번호, 메모 검색"
          />
        </div>
      </section>

      <section className="memberDirectorySheet">
        <div className="memberQuickFilters paymentFilters">
          {quickFilters.map((filter) => (
            <button
              type="button"
              className={quickFilter === filter.value ? 'active' : ''}
              onClick={() => setQuickFilter(filter.value)}
              key={filter.value}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="memberResultBar">
          <span>총 <b>{filtered.length}</b>명</span>
          <small>가나다순 · 카드를 누르면 상세</small>
        </div>
      </section>

      {/* 수강권·회원 관리 도구: 세로로 쌓지 않고 가로 버튼 한 줄, 누른 것만 아래에 펼침 */}
      <div className="memberToolsRow" role="group" aria-label="회원 관리 도구">
        <button type="button" onClick={() => toggleMemberTool('drawer-pass')}>
          수강권 만들기
        </button>
        <button
          type="button"
          disabled={passTemplates.length === 0}
          onClick={() => toggleMemberTool('drawer-pass-manage')}
        >
          수강권 관리
        </button>
        <button type="button" onClick={() => toggleMemberTool('drawer-member')}>
          회원 등록
        </button>
      </div>

      <FormDrawer
        id="drawer-pass"
        className="toolDrawer"
        title="수강권 만들기"
        hint="라인댄스 단체반 / 라틴댄스 단체반 / 개인레슨으로 세분화"
        action={onAddPassTemplate}
        submitLabel="수강권 저장"
      >
        <div className="split">
          <Field label="수업 종류">
            <select
              name="type"
              value={passFormType}
              onChange={(event) => setPassFormType(event.target.value as LessonType)}
            >
              <option value="line_group">라인댄스 단체반</option>
              <option value="latin_group">라틴댄스 단체반</option>
              <option value="private">개인레슨</option>
            </select>
          </Field>
          <Field label="수업 횟수">
            <input name="sessionCount" type="number" min="1" defaultValue="10" />
          </Field>
        </div>
        <Field label="수강권 이름">
          <input name="name" placeholder="예: 김세은 월 14시 라인댄스 중급반 (사당)" required />
        </Field>
        {passFormType !== 'private' && (
          <>
            <div className="split">
              <Field label="시작 시간">
                <input
                  name="startTime"
                  type="time"
                  value={passStart}
                  onChange={(event) => {
                    setPassStart(event.target.value)
                    setPassEnd(timeFromMinutes(minutesFromTime(event.target.value) + 60))
                  }}
                />
              </Field>
              <Field label="종료 시간 (자동 +1시간)">
                <input
                  name="endTime"
                  type="time"
                  value={passEnd}
                  onChange={(event) => setPassEnd(event.target.value)}
                />
              </Field>
            </div>
            <div className="field">
              <span>매주 수업 요일</span>
              <div className="weekdayPicker" aria-label="매주 수업 요일">
                {weekdays.map((day, index) => (
                  <label key={day}>
                    <input name="weekdays" type="checkbox" value={index} />
                    <span>{day}</span>
                  </label>
                ))}
              </div>
            </div>
          </>
        )}
        {passFormType === 'private' ? (
          <Field label="수강료">
            <input name="tuitionFee" type="number" min="0" defaultValue="240000" />
          </Field>
        ) : (
          <div className="split">
            <Field label="최대 인원">
              <input name="capacity" type="number" min="1" defaultValue="12" />
            </Field>
            <Field label="수강료">
              <input name="tuitionFee" type="number" min="0" defaultValue="240000" />
            </Field>
          </div>
        )}
        {passFormType === 'private' && (
          <p className="hint ruleHint">일정은 시간표에서 그때그때 추가해요.</p>
        )}
      </FormDrawer>

      {passTemplates.length > 0 && (
        <details className="formDrawer toolDrawer" id="drawer-pass-manage">
          <summary>
            <span>
              <strong>만든 수강권 관리</strong>
              <small>수강권을 누르면 시간·요일·가격을 수정할 수 있어요</small>
            </span>
            <i className="drawerIcon static" aria-hidden="true">
              <Settings2 size={16} />
            </i>
          </summary>
          <div className="drawerBody">
            <div className="listStack">
              {passTemplates.map((pass) => (
                <details className="classEditor" key={pass.id}>
                  <summary>
                    <span>
                      <strong>{pass.name}</strong>
                      <small>
                        {passCategoryLabel(pass.type)}
                        {pass.sessionCount > 0 && ` · ${pass.sessionCount}회`}
                        {pass.type !== 'private' &&
                          ` · ${pass.weekdays.map((day) => weekdays[day]).join('')} ${pass.startTime}`}
                      </small>
                    </span>
                    <Settings2 size={16} />
                  </summary>
                  <form
                    className="formGrid compact"
                    onSubmit={(event) => {
                      event.preventDefault()
                      onUpdatePassTemplate(pass.id, new FormData(event.currentTarget))
                    }}
                  >
                    <Field label="수강권 이름">
                      <input name="name" defaultValue={pass.name} />
                    </Field>
                    <div className="split">
                      <Field label="수업 횟수">
                        <input
                          name="sessionCount"
                          type="number"
                          min="0"
                          defaultValue={pass.sessionCount}
                        />
                      </Field>
                      <Field label="수강료">
                        <input
                          name="tuitionFee"
                          type="number"
                          min="0"
                          defaultValue={pass.tuitionFee}
                        />
                      </Field>
                    </div>
                    {pass.type !== 'private' && (
                      <>
                        <div className="split">
                          <Field label="시작 시간">
                            <input name="startTime" type="time" defaultValue={pass.startTime} />
                          </Field>
                          <Field label="종료 시간">
                            <input name="endTime" type="time" defaultValue={pass.endTime} />
                          </Field>
                        </div>
                        <div className="field">
                          <span>매주 수업 요일</span>
                          <div className="weekdayPicker">
                            {weekdays.map((day, index) => (
                              <label key={day}>
                                <input
                                  name="weekdays"
                                  type="checkbox"
                                  value={index}
                                  defaultChecked={pass.weekdays.includes(index)}
                                />
                                <span>{day}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                        <Field label="최대 인원">
                          <input
                            name="capacity"
                            type="number"
                            min="1"
                            defaultValue={pass.capacity}
                          />
                        </Field>
                      </>
                    )}
                    <div className="formActions">
                      <button type="submit" className="secondaryButton">저장</button>
                      <button
                        type="button"
                        className="dangerButton"
                        onClick={() => {
                          if (
                            window.confirm(`'${pass.name}' 수강권과 연결된 수업을 삭제할까요?`)
                          ) {
                            onRemovePassTemplate(pass.id)
                          }
                        }}
                      >
                        삭제
                      </button>
                    </div>
                  </form>
                </details>
              ))}
            </div>
          </div>
        </details>
      )}

      <FormDrawer
        id="drawer-member"
        className="toolDrawer"
        title="등록 회원 추가"
        hint="이름·전화번호와 수강권만 고르면 끝 — 금액·기간은 자동"
        action={onAddMember}
      >
        <Field label="이름">
          <input name="name" placeholder="회원 이름" required />
        </Field>
        <Field label="전화번호">
          <input name="phone" type="tel" placeholder="010-0000-0000" required />
        </Field>
        <div className="field">
          <span>수강권 종류</span>
          <div className="paymentFilters categoryChips" role="tablist" aria-label="수강권 종류">
            {passCategories.map((category) => (
              <button
                type="button"
                className={passCategory === category.value ? 'active' : ''}
                onClick={() => setPassCategory(category.value)}
                key={category.value}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
        <Field label="수강권 (수업·금액·기간 자동 적용)">
          <select name="passTemplateId" defaultValue="" key={passCategory}>
            <option value="">수강권 나중에 선택</option>
            {visiblePasses.map((pass) => (
              <option value={pass.id} key={pass.id}>
                {pass.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="메모">
          <input name="note" placeholder="메모" />
        </Field>
      </FormDrawer>

      <section className="panel">
        <h2>회원 목록</h2>
        <div className="listStack">
          {filtered.map((member) => {
            const attendanceSummary = { absent: 0, present: 0 }
            let lastPresent = ''
            for (const [key, status] of Object.entries(attendance)) {
              if (!key.endsWith(`|${member.id}`)) continue
              if (status === 'absent') {
                attendanceSummary.absent += 1
              } else {
                attendanceSummary.present += 1
                const date = key.split('|')[0]
                if (date > lastPresent) lastPresent = date
              }
            }
            const isEditing = editingMemberId === member.id
            const isOpen = openMemberId === member.id || isEditing
            const worst = memberWorstStatus(member)
            const totalPaid = member.enrollments.reduce(
              (sum, enrollment) =>
                sum +
                enrollment.payments.reduce((inner, payment) => inner + payment.amount, 0),
              0,
            )
            return (
              <article className="memberCard memberLookupCard" key={member.id}>
                <div className="memberLookupSummary">
                  <div
                    className="memberCardHead"
                    onClick={() => setOpenMemberId(isOpen && !isEditing ? null : member.id)}
                  >
                    <div className="memberLookupTop">
                      <div className="memberAvatar">{member.name.slice(0, 1)}</div>
                      <div className="memberMain">
                        <strong>{member.name}</strong>
                        <a href={`tel:${member.phone}`} onClick={(event) => event.stopPropagation()}>
                          <Phone size={13} /> {member.phone}
                        </a>
                      </div>
                      <div className="memberMeta">
                        <b className={`memberBadge status-${member.status}`}>
                          {memberStatusLabel(member.status)} 회원
                        </b>
                        {member.status === 'active' && member.enrollments.length > 0 && (
                          <b className={`memberBadge pay ${worst}`}>{paymentLabel(worst)}</b>
                        )}
                      </div>
                    </div>
                    {member.status === 'active' ? (
                      member.enrollments.length ? (
                        <div className="enrollLines">
                          {member.enrollments.map((enrollment) => {
                            const status = enrollmentStatus(enrollment)
                            return (
                              <div className="enrollLine" key={enrollment.id}>
                                <span>{enrollment.passName}</span>
                                <b className={status === 'paid' ? '' : status}>
                                  {enrollmentSummaryLabel(enrollment)}
                                </b>
                              </div>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="enrollLines">
                          <div className="enrollLine">
                            <span>수강권 없음</span>
                            <b className="soon">아래에서 추가</b>
                          </div>
                        </div>
                      )
                    ) : (
                      <div className="consultInfo">
                        <span>
                          {member.consultedAt ?? '상담일 없음'}
                          {member.interest && ` · ${member.interest}`}
                        </span>
                        {member.note && <p>{member.note}</p>}
                      </div>
                    )}
                  </div>
                  {isOpen && (
                    <>
                      {member.status === 'active' && (
                        <dl className="memberFacts">
                          <div>
                            <dt>출석 현황</dt>
                            <dd>
                              출석 {attendanceSummary.present} · 결석 {attendanceSummary.absent}
                            </dd>
                          </div>
                          <div>
                            <dt>최근 출석일</dt>
                            <dd>{lastPresent || '기록 없음'}</dd>
                          </div>
                        </dl>
                      )}
                      <button
                        type="button"
                        className="editMemberButton"
                        onClick={() => setEditingMemberId(isEditing ? null : member.id)}
                      >
                        {isEditing ? '닫기' : '수정'}
                      </button>
                    </>
                  )}
                </div>
                {isEditing && (
                  <>
                    <div className="memberDetailBody">
                      <div className="memberLookupFoot">
                        <span>{member.note || '상담/진행 메모 없음'}</span>
                        <b>{formatCurrency(totalPaid)}</b>
                      </div>
                    </div>

                    <div className="memberEditForm enrollArea">
                      {member.enrollments.map((enrollment) => (
                        <form
                          className="formGrid compact enrollEditor"
                          onSubmit={(event) => {
                            event.preventDefault()
                            onUpdateEnrollment(
                              member.id,
                              enrollment.id,
                              new FormData(event.currentTarget),
                            )
                          }}
                          key={enrollment.id}
                        >
                          <div className="labelRow">
                            <span className="enrollTitle">{enrollment.passName}</span>
                            <b className={`enrollStatus es-${enrollmentStatus(enrollment)}`}>
                              {paymentLabel(enrollmentStatus(enrollment))}
                            </b>
                          </div>
                          <Field label="수강권 이름">
                            <input name="passName" defaultValue={enrollment.passName} />
                          </Field>
                          <div className="split">
                            <Field label="총 횟수">
                              <input
                                name="totalCredits"
                                type="number"
                                min="0"
                                defaultValue={enrollment.totalCredits}
                              />
                            </Field>
                            <Field label="잔여 횟수">
                              <input
                                name="remainingCredits"
                                type="number"
                                defaultValue={enrollment.remainingCredits}
                              />
                            </Field>
                          </div>
                          <div className="split">
                            <Field label="회비(1회 결제)">
                              <input
                                name="paidAmount"
                                type="number"
                                min="0"
                                defaultValue={enrollment.paidAmount}
                              />
                            </Field>
                            <Field label="최근 결제일">
                              <input
                                name="lastPaidAt"
                                type="date"
                                defaultValue={enrollment.lastPaidAt || todayKey}
                              />
                            </Field>
                          </div>
                          <Field label="다음 결제일 (기간 연장은 여기서)">
                            <input
                              name="nextPaymentDue"
                              type="date"
                              defaultValue={enrollment.nextPaymentDue}
                            />
                          </Field>
                          <div className="formActions">
                            <button type="submit" className="secondaryButton">저장</button>
                            <button
                              type="button"
                              className="dangerButton"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `'${enrollment.passName}' 수강권을 이 회원에게서 삭제할까요?`,
                                  )
                                ) {
                                  onRemoveEnrollment(member.id, enrollment.id)
                                }
                              }}
                            >
                              삭제
                            </button>
                          </div>
                        </form>
                      ))}

                      {passTemplates.length > 0 && (
                        <AddEnrollmentRow
                          passTemplates={passTemplates}
                          onAdd={(passId) => onAddEnrollment(member.id, passId)}
                        />
                      )}
                    </div>

                    <form
                      className="formGrid memberEditForm"
                      onSubmit={(event) => {
                        event.preventDefault()
                        onUpdateMember(member.id, new FormData(event.currentTarget))
                        setEditingMemberId(null)
                      }}
                    >
                      <div className="labelRow">
                        <span className="enrollTitle">기본 정보</span>
                      </div>
                      <Field label="이름">
                        <input name="name" defaultValue={member.name} />
                      </Field>
                      <Field label="전화번호">
                        <input name="phone" type="tel" defaultValue={member.phone} />
                      </Field>
                      <Field label="구분">
                        <select name="status" defaultValue={member.status}>
                          <option value="active">등록한 사람</option>
                          <option value="prospect">상담만 한 사람</option>
                          <option value="waitlist">현재 대기</option>
                        </select>
                      </Field>
                      <Field label="관심 수업 / 상담 주제">
                        <input name="interest" defaultValue={member.interest ?? ''} placeholder="관심 수업 / 상담 주제" />
                      </Field>
                      <Field label="메모">
                        <textarea
                          name="note"
                          defaultValue={member.note}
                          placeholder="상담 진행 메모, 연락 이력, 특이사항"
                          rows={4}
                        />
                      </Field>
                      <div className="formActions">
                        <button type="submit" className="secondaryButton">저장</button>
                        <button
                          type="button"
                          className="dangerButton"
                          onClick={() => {
                            if (
                              window.confirm(
                                `${member.name}님을 삭제할까요? 출석 기록도 함께 삭제되며 되돌릴 수 없습니다.`,
                              )
                            ) {
                              onRemoveMember(member.id)
                            }
                          }}
                        >
                          삭제
                        </button>
                      </div>
                    </form>
                  </>
                )}
              </article>
            )
          })}
          {!filtered.length && <p className="emptyText">검색 결과가 없습니다.</p>}
        </div>
      </section>
    </section>
  )
}

function AddEnrollmentRow({
  onAdd,
  passTemplates,
}: {
  onAdd: (passTemplateId: string) => void
  passTemplates: PassTemplate[]
}) {
  const [pickedPassId, setPickedPassId] = useState('')
  const [category, setCategory] = useState<LessonType | 'all'>('all')
  const categories: Array<{ label: string; value: LessonType | 'all' }> = [
    { label: '전체', value: 'all' },
    { label: '라인댄스', value: 'line_group' },
    { label: '라틴댄스', value: 'latin_group' },
    { label: '개인레슨', value: 'private' },
  ]
  const visiblePasses =
    category === 'all' ? passTemplates : passTemplates.filter((pass) => pass.type === category)
  return (
    <div className="addEnrollArea">
      <div className="labelRow">
        <span className="enrollTitle">+ 수강권 추가</span>
      </div>
      <div className="paymentFilters categoryChips" role="tablist" aria-label="수강권 종류">
        {categories.map((item) => (
          <button
            type="button"
            className={category === item.value ? 'active' : ''}
            onClick={() => {
              setCategory(item.value)
              setPickedPassId('')
            }}
            key={item.value}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="addEnrollRow">
        <select
          value={pickedPassId}
          onChange={(event) => setPickedPassId(event.target.value)}
          aria-label="추가할 수강권"
        >
          <option value="">수강권 선택…</option>
          {visiblePasses.map((pass) => (
            <option value={pass.id} key={pass.id}>
              {pass.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          disabled={!pickedPassId}
          onClick={() => {
            if (!pickedPassId) return
            onAdd(pickedPassId)
            setPickedPassId('')
          }}
        >
          추가
        </button>
      </div>
    </div>
  )
}

// 상담일·구분 입력. '현재 대기'를 고르면 대기 현황에서 만든 대기 수업 목록이 나타난다.
function ConsultStatusFields({
  defaultConsultedAt,
  defaultInterest,
  defaultStatus,
  waitlistClasses,
}: {
  defaultConsultedAt: string
  defaultInterest: string
  defaultStatus: MemberStatus
  waitlistClasses: WaitlistClass[]
}) {
  const [status, setStatus] = useState<MemberStatus>(defaultStatus)
  // 예전에 기록된 대기 수업이 목록에서 지워졌어도 기존 값은 계속 고를 수 있게 한다
  const options = waitlistClasses.map((waitClass) => waitClass.name)
  if (defaultInterest && !options.includes(defaultInterest)) options.unshift(defaultInterest)
  return (
    <>
      <div className="split">
        <Field label="상담일">
          <input name="consultedAt" type="date" defaultValue={defaultConsultedAt} />
        </Field>
        <Field label="구분">
          <select
            name="status"
            value={status}
            onChange={(event) => setStatus(event.target.value as MemberStatus)}
          >
            <option value="prospect">상담만 한 사람</option>
            <option value="waitlist">현재 대기</option>
          </select>
        </Field>
      </div>
      {status === 'waitlist' && (
        <Field label="대기 수업 (대기 현황에서 만든 수업)">
          <select name="interest" defaultValue={defaultInterest}>
            <option value="">선택 안 함</option>
            {options.map((name) => (
              <option value={name} key={name}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      )}
    </>
  )
}

// 대기 현황 전용 수업 만들기 (수업명 + 정원)
function WaitClassAddForm({ onAdd }: { onAdd: (name: string, capacity: number) => void }) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [capacity, setCapacity] = useState('10')
  if (!open) {
    return (
      <button type="button" className="emptySlotButton" onClick={() => setOpen(true)}>
        + 대기 수업 추가
      </button>
    )
  }
  return (
    <div className="waitClassForm">
      <div className="split">
        <Field label="수업명">
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="예: 토요일 초급반"
            autoFocus
          />
        </Field>
        <Field label="정원">
          <input
            type="number"
            min="0"
            value={capacity}
            onChange={(event) => setCapacity(event.target.value)}
          />
        </Field>
      </div>
      <div className="draftFoot">
        <button type="button" className="draftCancel" onClick={() => setOpen(false)}>
          취소
        </button>
        <button
          type="button"
          className="draftConfirm"
          disabled={!name.trim()}
          onClick={() => {
            onAdd(name, Number(capacity) || 0)
            setOpen(false)
            setName('')
          }}
        >
          추가
        </button>
      </div>
    </div>
  )
}

// '기타'를 고르면 직접 입력 칸이 나타나는 선택 상자
function SelectWithCustom({
  label,
  name,
  options,
  placeholder,
}: {
  label: string
  name: string
  options: string[]
  placeholder: string
}) {
  const [choice, setChoice] = useState('')
  return (
    <>
      <Field label={label}>
        <select
          name={`${name}Choice`}
          value={choice}
          onChange={(event) => setChoice(event.target.value)}
        >
          <option value="">선택 안 함</option>
          {options.map((option) => (
            <option value={option} key={option}>
              {option}
            </option>
          ))}
          <option value="기타">기타 (직접 입력)</option>
        </select>
      </Field>
      {choice === '기타' && (
        <Field label={`${label} 직접 입력`}>
          <input name={`${name}Custom`} placeholder={placeholder} autoFocus />
        </Field>
      )}
    </>
  )
}

function ConsultationsView({
  consultationMembers,
  passTemplates,
  waitlistClasses,
  waitlistMembers,
  onAddConsultation,
  onAddWaitlistClass,
  onConvertMember,
  onRemoveMember,
  onRemoveWaitlistClass,
  onUpdateConsultation,
}: {
  consultationMembers: Member[]
  passTemplates: PassTemplate[]
  waitlistClasses: WaitlistClass[]
  waitlistMembers: Member[]
  onAddConsultation: (formData: FormData) => void
  onAddWaitlistClass: (name: string, capacity: number) => void
  onConvertMember: (memberId: string, passId?: string) => void
  onRemoveMember: (memberId: string) => void
  onRemoveWaitlistClass: (waitClassId: string) => void
  onUpdateConsultation: (memberId: string, formData: FormData) => void
}) {
  const [query, setQuery] = useState('')
  // 수정 중인 상담 / 전환 중인 상담(수강권 고르는 중)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [pickedPassId, setPickedPassId] = useState('')
  // 대기 현황은 수강권과 완전히 별개 — 내가 직접 만든 대기 수업별로 대기자를 묶는다
  const waitGroups = waitlistClasses.map((waitClass) => ({
    capacity: waitClass.capacity,
    key: waitClass.id,
    label: waitClass.name,
    waiting: waitlistMembers.filter((member) => member.interest === waitClass.name),
  }))
  const etcWaiting = waitlistMembers.filter(
    (member) => !waitlistClasses.some((waitClass) => waitClass.name === member.interest),
  )
  const followUpMembers = [...consultationMembers, ...waitlistMembers]
    .sort((a, b) => (b.consultedAt ?? '').localeCompare(a.consultedAt ?? ''))
    .filter((member) => {
      if (!query) return true
      const haystack =
        `${member.name} ${member.phone} ${member.note} ${member.interest ?? ''} ${member.source ?? ''} ${member.consultedAt ?? ''}`.toLowerCase()
      return haystack.includes(query.toLowerCase())
    })

  return (
    <section className="screen">
      <FormDrawer id="drawer-consult" title="상담 등록" hint="문의 온 회원의 상담 내용을 기록" action={onAddConsultation}>
        <Field label="이름">
          <input name="name" placeholder="상담 회원 이름" required />
        </Field>
        <Field label="전화번호">
          <input name="phone" type="tel" placeholder="010-0000-0000" required />
        </Field>
        <ConsultStatusFields
          defaultConsultedAt={todayKey}
          defaultInterest=""
          defaultStatus="prospect"
          waitlistClasses={waitlistClasses}
        />
        <SelectWithCustom
          label="유입경로"
          name="source"
          options={['문자', '전화', '비즈니스 파트너']}
          placeholder="예: 지인 소개"
        />
        <Field label="상담 메모">
          <input name="note" placeholder="상담 내역 메모" />
        </Field>
      </FormDrawer>

      <section className="panel">
        <h2>대기 현황</h2>
        <div className="listStack">
          {waitGroups.map((group) => {
            const full = group.capacity > 0 && group.waiting.length >= group.capacity
            const percent =
              group.capacity > 0
                ? Math.min(100, Math.round((group.waiting.length / group.capacity) * 100))
                : 0
            return (
              <div className={full ? 'waitGroup full' : 'waitGroup'} key={group.key}>
                <div className="waitGroupHead">
                  <strong>{group.label}</strong>
                  <b>
                    {group.waiting.length}/{group.capacity}명{full && ' · 정원 참!'}
                  </b>
                  <button
                    type="button"
                    className="waitDeleteButton"
                    aria-label={`${group.label} 대기 수업 삭제`}
                    onClick={() => {
                      if (
                        window.confirm(
                          `'${group.label}' 대기 수업을 삭제할까요?\n(대기 회원은 상담 내역에 그대로 남아요)`,
                        )
                      ) {
                        onRemoveWaitlistClass(group.key)
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
                {group.capacity > 0 && (
                  <div className="waitBar">
                    <i style={{ width: `${percent}%` }} />
                  </div>
                )}
                {group.waiting.length > 0 && (
                  <div className="waitNames">
                    {group.waiting.map((member) => (
                      <button
                        type="button"
                        className="waitNameChip"
                        onClick={() => {
                          if (
                            window.confirm(
                              `${member.name}님을 등록 회원으로 전환할까요?\n(수강권은 회원 탭에서 추가해 주세요)`,
                            )
                          ) {
                            onConvertMember(member.id)
                          }
                        }}
                        key={member.id}
                      >
                        {member.name} <b>등록</b>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          {etcWaiting.length > 0 && (
            <div className="waitGroup">
              <div className="waitGroupHead">
                <strong>기타 대기</strong>
                <b>{etcWaiting.length}명</b>
              </div>
              <small>
                {etcWaiting
                  .map((member) =>
                    member.interest ? `${member.name} (${member.interest})` : member.name,
                  )
                  .join(' · ')}
              </small>
            </div>
          )}
          {!waitGroups.length && !etcWaiting.length && (
            <p className="emptyText">아직 대기 수업이 없어요. 아래에서 만들어 보세요.</p>
          )}
        </div>
        <WaitClassAddForm onAdd={onAddWaitlistClass} />
        <p className="hint ruleHint">
          대기 수업은 수강권과 별개예요. 상담 등록에서 '현재 대기'를 고르면 이 목록에서
          수업을 선택해요. 정원이 차면 홈에 알림이 떠요.
        </p>
      </section>

      <section className="panel">
        <h2>상담 내역</h2>
        <div className="searchBox consultSearchBox">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="이름·전화·메모·대기수업·유입경로 검색"
          />
        </div>
        <div className="listStack">
          {followUpMembers.map((member) => (
            <details className="consultCard" key={member.id}>
              {/* 닫힌 상태: 이름 · 상담일 · 구분 한 줄. 누르면 상세와 버튼이 펼쳐진다 */}
              <summary className="consultSummary">
                <strong>{member.name}</strong>
                <small>{member.consultedAt ? member.consultedAt.slice(5).replace('-', '/') : ''}</small>
                <b className={`status-${member.status}`}>{memberStatusLabel(member.status)}</b>
                <ChevronRight size={14} className="consultChevron" />
              </summary>
              <a className="consultPhone" href={`tel:${member.phone}`}>
                <Phone size={13} /> {member.phone}
              </a>
              <div className="consultBody">
                <span>
                  {member.consultedAt ?? '상담일 없음'}
                  {member.interest &&
                    ` · ${member.status === 'waitlist' ? '대기: ' : ''}${member.interest}`}
                  {member.source && ` · ${member.source}`}
                </span>
                <p>{member.note || '상담 메모 없음'}</p>
              </div>

              {editingId === member.id && (
                <form
                  className="formGrid compact consultEditForm"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onUpdateConsultation(member.id, new FormData(event.currentTarget))
                    setEditingId(null)
                  }}
                >
                  <div className="split">
                    <Field label="이름">
                      <input name="name" defaultValue={member.name} required />
                    </Field>
                    <Field label="전화번호">
                      <input name="phone" type="tel" defaultValue={member.phone} required />
                    </Field>
                  </div>
                  <ConsultStatusFields
                    defaultConsultedAt={member.consultedAt ?? todayKey}
                    defaultInterest={member.interest ?? ''}
                    defaultStatus={member.status}
                    waitlistClasses={waitlistClasses}
                  />
                  <Field label="유입경로">
                    <input name="source" defaultValue={member.source ?? ''} placeholder="예: 문자, 전화, 지인 소개" />
                  </Field>
                  <Field label="상담 메모">
                    <input name="note" defaultValue={member.note} placeholder="상담 내역 메모" />
                  </Field>
                  <div className="choiceButtons">
                    <button
                      type="button"
                      className="draftCancel"
                      onClick={() => setEditingId(null)}
                    >
                      취소
                    </button>
                    <button type="submit" className="draftConfirm">
                      저장
                    </button>
                  </div>
                </form>
              )}

              {convertingId === member.id && (
                <div className="convertPanel">
                  <Field label="적용할 수강권 (수업 자동 배정)">
                    <select
                      value={pickedPassId}
                      onChange={(event) => setPickedPassId(event.target.value)}
                    >
                      <option value="">수강권은 나중에 (전환만)</option>
                      {passTemplates.map((pass) => (
                        <option value={pass.id} key={pass.id}>
                          {pass.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="choiceButtons">
                    <button
                      type="button"
                      className="draftCancel"
                      onClick={() => setConvertingId(null)}
                    >
                      취소
                    </button>
                    <button
                      type="button"
                      className="draftConfirm"
                      onClick={() => {
                        onConvertMember(member.id, pickedPassId || undefined)
                        setConvertingId(null)
                      }}
                    >
                      전환 완료
                    </button>
                  </div>
                </div>
              )}

              {editingId !== member.id && convertingId !== member.id && (
                <div className="consultActions">
                  <button
                    type="button"
                    className="convertButton"
                    onClick={() => {
                      setPickedPassId('')
                      setConvertingId(member.id)
                      setEditingId(null)
                    }}
                  >
                    등록 회원으로 전환
                  </button>
                  <button
                    type="button"
                    className="consultEditButton"
                    onClick={() => {
                      setEditingId(member.id)
                      setConvertingId(null)
                    }}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="consultDeleteButton"
                    aria-label={`${member.name} 상담 삭제`}
                    onClick={() => {
                      if (window.confirm(`${member.name}님의 상담 내역을 삭제할까요?`)) {
                        onRemoveMember(member.id)
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
              )}
            </details>
          ))}
          {!followUpMembers.length && (
            <p className="emptyText">
              {query ? '검색 결과가 없습니다.' : '등록된 상담 내역이 없습니다.'}
            </p>
          )}
        </div>
      </section>
    </section>
  )
}

function AttendanceView({
  allMembers,
  attendance,
  attendanceDate,
  classMembers,
  classes,
  onMarkAllPresent,
  passTemplates,
  selectedClassId,
  setAttendanceDate,
  setAttendanceStatus,
  setSelectedClassId,
}: {
  allMembers: Member[]
  attendance: AttendanceBook
  attendanceDate: string
  classMembers: Member[]
  classes: DanceClass[]
  onMarkAllPresent: () => void
  passTemplates: PassTemplate[]
  selectedClassId: string
  setAttendanceDate: (date: string) => void
  setAttendanceStatus: (memberId: string, status: AttendanceStatus) => void
  setSelectedClassId: (classId: string) => void
}) {
  const [statSearch, setStatSearch] = useState('')
  const initialPass = passTemplates.find((pass) => pass.classIds.includes(selectedClassId))
  const [selectedPassId, setSelectedPassId] = useState(initialPass?.id ?? '')
  const [category, setCategory] = useState<LessonType>(initialPass?.type ?? 'line_group')
  const [selectedPrivateMemberId, setSelectedPrivateMemberId] = useState('')
  const [viewMonth, setViewMonth] = useState(attendanceDate.slice(0, 7))
  const categoryPasses = passTemplates.filter((pass) => pass.type === category)
  const derivedPassId = categoryPasses.some((pass) => pass.id === selectedPassId)
    ? selectedPassId
    : categoryPasses[0]?.id ?? ''
  const currentPass = passTemplates.find((pass) => pass.id === derivedPassId)
  const privateMembers = currentPass
    ? allMembers.filter((member) =>
        member.enrollments.some((enrollment) => enrollment.passName === currentPass.name),
      )
    : []
  const derivedPrivateMemberId = privateMembers.some(
    (member) => member.id === selectedPrivateMemberId,
  )
    ? selectedPrivateMemberId
    : privateMembers[0]?.id ?? ''
  const privateEnrollment = privateMembers
    .find((member) => member.id === derivedPrivateMemberId)
    ?.enrollments.find((enrollment) => enrollment.passName === currentPass?.name)
  const groupClasses = currentPass
    ? classes.filter(
        (danceClass) =>
          currentPass.classIds.includes(danceClass.id) && !isPrivateClass(danceClass),
      )
    : []
  const dateOptions =
    category === 'private'
      ? [
          ...new Set(
            classes
              .filter(
                (danceClass) =>
                  isPrivateClass(danceClass) &&
                  Boolean(danceClass.date?.startsWith(viewMonth)) &&
                  Boolean(privateEnrollment?.classIds.includes(danceClass.id)),
              )
              .flatMap((danceClass) => (danceClass.date ? [danceClass.date] : [])),
          ),
        ].sort()
      : datesForWeekdays(
          viewMonth,
          [...new Set(groupClasses.map((danceClass) => danceClass.weekday))],
        )
  const selectedWeekday = attendanceDate ? weekdayOfDateKey(attendanceDate) : -1
  const candidates =
    category === 'private'
      ? classes.filter(
          (danceClass) =>
            isPrivateClass(danceClass) &&
            danceClass.date === attendanceDate &&
            Boolean(privateEnrollment?.classIds.includes(danceClass.id)),
        )
      : groupClasses.filter((danceClass) => danceClass.weekday === selectedWeekday)
  const activeClass = candidates.find((item) => item.id === selectedClassId)

  useEffect(() => {
    const nextDate = dateOptions.includes(attendanceDate) ? attendanceDate : dateOptions[0] ?? ''
    if (nextDate !== attendanceDate) {
      setAttendanceDate(nextDate)
      return
    }
    if (!candidates.length) {
      if (selectedClassId) setSelectedClassId('')
      return
    }
    const preferred = candidates.find((item) => item.id === selectedClassId) ?? candidates[0]
    if (preferred.id !== selectedClassId) setSelectedClassId(preferred.id)
  }, [
    attendanceDate,
    candidates,
    dateOptions,
    selectedClassId,
    setAttendanceDate,
    setSelectedClassId,
  ])
  const monthKey = todayKey.slice(0, 7)
  const memberStats = allMembers
    .filter((member) =>
      `${member.name} ${member.phone}`.toLowerCase().includes(statSearch.toLowerCase()),
    )
    .map((member) => {
      let present = 0
      let absent = 0
      let monthPresent = 0
      let lastPresent = ''
      const records: Array<{ classId: string; date: string; status: AttendanceStatus }> = []
      for (const [key, status] of Object.entries(attendance)) {
        const [date, classId, memberId] = key.split('|')
        if (memberId !== member.id) continue
        records.push({ classId, date, status })
        if (status === 'absent') {
          absent += 1
        } else {
          present += 1
          if (date.startsWith(monthKey)) monthPresent += 1
          if (date > lastPresent) lastPresent = date
        }
      }
      records.sort((a, b) => b.date.localeCompare(a.date))
      return { absent, lastPresent, member, monthPresent, present, records }
    })
    .sort((a, b) => a.member.name.localeCompare(b.member.name, 'ko'))
  const summary = classMembers.reduce(
    (acc, member) => {
      const status = attendance[attendanceKey(attendanceDate, selectedClassId, member.id)]
      if (!status) acc.unchecked += 1
      else if (status === 'absent') acc.absent += 1
      else acc.present += 1
      return acc
    },
    { present: 0, absent: 0, unchecked: 0 },
  )

  return (
    <section className="screen">
      <section className="panel">
        <h2>출석 체크</h2>
        <div className="attendancePicker">
          <div className="attendanceCategories" role="tablist" aria-label="수업 카테고리">
            {(
              [
                { label: '라인댄스 단체반', value: 'line_group' },
                { label: '라틴댄스 단체반', value: 'latin_group' },
                { label: '개인레슨', value: 'private' },
              ] as const
            ).map((option) => (
              <button
                type="button"
                role="tab"
                aria-selected={category === option.value}
                className={category === option.value ? 'active' : ''}
                onClick={() => {
                  setCategory(option.value)
                  setSelectedPassId('')
                  setSelectedPrivateMemberId('')
                }}
                key={option.value}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="attendanceChoiceGroup">
            <strong>수강권</strong>
            <div className="attendanceChoiceChips">
              {categoryPasses.map((pass) => (
                <button
                  type="button"
                  className={derivedPassId === pass.id ? 'active' : ''}
                  onClick={() => {
                    setSelectedPassId(pass.id)
                    setSelectedPrivateMemberId('')
                  }}
                  key={pass.id}
                >
                  {pass.name}
                </button>
              ))}
            </div>
            {!categoryPasses.length && <p className="emptyText">이 카테고리의 수강권이 없습니다.</p>}
          </div>

          {category === 'private' && currentPass && (
            <div className="attendanceChoiceGroup">
              <strong>회원</strong>
              <div className="attendanceChoiceChips">
                {privateMembers.map((member) => (
                  <button
                    type="button"
                    className={derivedPrivateMemberId === member.id ? 'active' : ''}
                    onClick={() => setSelectedPrivateMemberId(member.id)}
                    key={member.id}
                  >
                    {member.name}
                  </button>
                ))}
              </div>
              {!privateMembers.length && (
                <p className="emptyText">이 수강권을 가진 회원이 없습니다.</p>
              )}
            </div>
          )}

          {currentPass && (category !== 'private' || derivedPrivateMemberId) && (
            <div className="attendanceChoiceGroup">
              <div className="attendanceMonthHead">
                <strong>
                  {Number(viewMonth.slice(0, 4))}년 {Number(viewMonth.slice(5, 7))}월 수업 날짜
                </strong>
                <div>
                  <button
                    type="button"
                    aria-label="이전 달"
                    title="이전 달"
                    onClick={() => setViewMonth(shiftMonth(viewMonth, -1))}
                  >
                    <ChevronLeft size={17} />
                  </button>
                  <button
                    type="button"
                    aria-label="다음 달"
                    title="다음 달"
                    onClick={() => setViewMonth(shiftMonth(viewMonth, 1))}
                  >
                    <ChevronRight size={17} />
                  </button>
                </div>
              </div>
              <div className="attendanceDateGrid">
                {dateOptions.map((date) => (
                  <button
                    type="button"
                    className={attendanceDate === date ? 'active' : ''}
                    aria-label={`${date} ${weekdays[weekdayOfDateKey(date)]}요일`}
                    onClick={() => setAttendanceDate(date)}
                    key={date}
                  >
                    <b>{Number(date.slice(8, 10))}</b>
                    <span>{weekdays[weekdayOfDateKey(date)]}</span>
                  </button>
                ))}
              </div>
              {!dateOptions.length && (
                <p className="emptyText">
                  {category === 'private'
                    ? '이 달에 예약된 개인레슨이 없습니다.'
                    : '이 달에 연결된 수업 날짜가 없습니다.'}
                </p>
              )}
            </div>
          )}

          {candidates.length > 1 && (
            <div className="attendanceChoiceGroup">
              <strong>수업</strong>
              <div className="attendanceChoiceChips">
                {candidates.map((danceClass) => (
                  <button
                    type="button"
                    className={selectedClassId === danceClass.id ? 'active' : ''}
                    onClick={() => setSelectedClassId(danceClass.id)}
                    key={danceClass.id}
                  >
                    {danceClass.startTime} {danceClass.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {activeClass ? (
          <p className="hint">
            {weekdays[activeClass.weekday]} {activeClass.startTime} · {activeClass.location}
            {!activeClass.date &&
              activeClass.weekday !== selectedWeekday &&
              ' · 이 날짜는 수업 요일이 아니에요'}
          </p>
        ) : (
          <p className="hint">
            {currentPass?.type === 'private'
              ? '이 날짜에 만든 개인레슨이 없어요. 시간표에서 레슨을 먼저 추가해 주세요.'
              : '이 수강권에 연결된 수업이 없어요.'}
          </p>
        )}
        {activeClass && !isPrivateClass(activeClass) && (
          <div className="attendanceSummary">
            <span className="ok">출석 {summary.present}</span>
            <span className="danger">결석 {summary.absent}</span>
            <span>미체크 {summary.unchecked}</span>
          </div>
        )}
        <p className="hint ruleHint">
          {category === 'private'
            ? '개인레슨은 출석 체크 없이 날짜가 지나면 수강권에서 1회 자동 차감됩니다.'
            : '출석 체크 = 해당 수강권 1회 차감 (되돌리면 복구)'}
        </p>
      </section>

      <section className="panel">
        <h2>{category === 'private' ? '예약 회원' : '수강 회원'}</h2>
        {activeClass && !isPrivateClass(activeClass) && summary.unchecked > 0 && (
          <button type="button" className="markAllButton" onClick={onMarkAllPresent}>
            미체크 {summary.unchecked}명 전체 출석 처리
          </button>
        )}
        <div className="listStack">
          {(activeClass ? classMembers : []).map((member) => {
            const status = attendance[attendanceKey(attendanceDate, selectedClassId, member.id)]
            const enrollment = enrollmentForClass(member, selectedClassId)
            return (
              <article className="attendanceRow" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <span className={status ? `state-${status}` : ''}>
                    {activeClass && isPrivateClass(activeClass)
                      ? activeClass.date && activeClass.date < todayKey
                        ? '자동 차감 완료'
                        : '자동 차감 예정'
                      : status
                        ? attendanceLabel(status)
                        : '미체크'}
                    {enrollment && ` · ${enrollmentSummaryLabel(enrollment)}`}
                  </span>
                </div>
                {activeClass && !isPrivateClass(activeClass) && (
                <div className="segmented two">
                  <button
                    type="button"
                    className={status === 'present' || status === 'makeup' ? 'active' : ''}
                    onClick={() => setAttendanceStatus(member.id, 'present')}
                  >
                    출석
                  </button>
                  <button
                    type="button"
                    className={status === 'absent' ? 'active absent' : ''}
                    onClick={() => setAttendanceStatus(member.id, 'absent')}
                  >
                    결석
                  </button>
                </div>
                )}
              </article>
            )
          })}
          {(!activeClass || !classMembers.length) && (
            <p className="emptyText">
              {activeClass
                ? '이 수업반에 배정된 회원이 없습니다.'
                : '위에서 수강권과 날짜를 선택해 주세요.'}
            </p>
          )}
        </div>
      </section>

      <section className="panel">
        <h2>회원별 출석 현황</h2>
        <input
          type="search"
          className="pickSearch statSearchInput"
          placeholder="회원 이름·전화번호 검색"
          value={statSearch}
          onChange={(event) => setStatSearch(event.target.value)}
        />
        <div className="listStack">
          {memberStats.map(({ absent, lastPresent, member, monthPresent, present, records }) => (
            <details className="memberStatRow" key={member.id}>
              {/* 닫힌 상태: 이름 + 출석 요약 한 줄. 누르면 수강권별 현황과 이력이 펼쳐진다 */}
              <summary className="statSummary">
                <div className="taskAvatar">{member.name.slice(0, 1)}</div>
                <div className="statBody">
                  <strong>{member.name}</strong>
                  <span>
                    {member.enrollments.length
                      ? `수강권 ${member.enrollments.length}개`
                      : '수강권 없음'}
                  </span>
                </div>
                <div className="statChips">
                  <b className="ok">출석 {present}</b>
                  <b>이달 {monthPresent}</b>
                </div>
                <ChevronRight size={15} className="statChevron" />
              </summary>
              <div className="statDetail">
                {/* 수강권이 여러 개면 각각 따로 표시된다 */}
                <div className="statPassLines">
                  {member.enrollments.map((enrollment) => {
                    const status = enrollmentStatus(enrollment)
                    return (
                      <div className="statPassLine" key={enrollment.id}>
                        <span>{enrollment.passName}</span>
                        <b className={status === 'paid' ? '' : status}>
                          {enrollmentSummaryLabel(enrollment)}
                        </b>
                      </div>
                    )
                  })}
                  {!member.enrollments.length && <span className="statNone">-</span>}
                </div>
                <div className="statChips">
                  <b className="danger">결석 {absent}</b>
                  <b>{lastPresent ? `최근 ${lastPresent.slice(5).replace('-', '/')}` : '기록 없음'}</b>
                </div>
              {records.length > 0 && (
                <AttendanceHistoryDetails
                  classes={classes}
                  member={member}
                  passTemplates={passTemplates}
                  records={records}
                  onJump={(classId, date) => {
                    const directPass = passTemplates.find((pass) =>
                      pass.classIds.includes(classId),
                    )
                    const jumpPass =
                      directPass ??
                      passTemplates.find(
                        (pass) =>
                          pass.type === 'private' &&
                          member.enrollments.some(
                            (enrollment) =>
                              enrollment.passName === pass.name &&
                              enrollment.classIds.includes(classId),
                          ),
                      )
                    if (jumpPass) {
                      setCategory(jumpPass.type)
                      setSelectedPassId(jumpPass.id)
                      if (jumpPass.type === 'private') setSelectedPrivateMemberId(member.id)
                    }
                    setViewMonth(date.slice(0, 7))
                    setSelectedClassId(classId)
                    setAttendanceDate(date)
                    window.scrollTo({ behavior: 'smooth', top: 0 })
                  }}
                />
              )}
              </div>
            </details>
          ))}
          {!memberStats.length && <p className="emptyText">등록된 회원이 없습니다.</p>}
        </div>
      </section>
    </section>
  )
}

// 회원별 날짜별 출석 이력 — 수강권별로 걸러 보고, 10개씩 더 보기로 전체를 볼 수 있다
function AttendanceHistoryDetails({
  classes,
  member,
  passTemplates,
  records,
  onJump,
}: {
  classes: DanceClass[]
  member: Member
  passTemplates: PassTemplate[]
  records: Array<{ classId: string; date: string; status: AttendanceStatus }>
  onJump: (classId: string, date: string) => void
}) {
  const [enrollmentFilter, setEnrollmentFilter] = useState('all')
  const [visibleCount, setVisibleCount] = useState(10)

  // 이 기록이 어느 수강권 것인지: 지금 그 수업이 배정된 수강권 → 없으면(수업이
  // 지워졌거나 배정이 바뀐 경우) 수강권 템플릿의 수업 목록으로 찾는다
  function enrollmentIdFor(record: { classId: string }) {
    const byClass = member.enrollments.find((enrollment) =>
      enrollment.classIds.includes(record.classId),
    )
    if (byClass) return byClass.id
    const pass = passTemplates.find((item) => item.classIds.includes(record.classId))
    if (pass) {
      const byName = member.enrollments.find((enrollment) => enrollment.passName === pass.name)
      if (byName) return byName.id
    }
    return ''
  }

  const filtered =
    enrollmentFilter === 'all'
      ? records
      : records.filter((record) => enrollmentIdFor(record) === enrollmentFilter)
  const shown = filtered.slice(0, visibleCount)

  return (
    <details className="historyDetails">
      <summary>날짜별 이력 보기 ({records.length}건)</summary>
      {/* 수강권이 여러 개면 수강권별로 걸러 볼 수 있다 */}
      {member.enrollments.length > 1 && (
        <div
          className="paymentFilters categoryChips historyPassChips"
          role="tablist"
          aria-label="수강권별 이력"
        >
          <button
            type="button"
            className={enrollmentFilter === 'all' ? 'active' : ''}
            onClick={() => {
              setEnrollmentFilter('all')
              setVisibleCount(10)
            }}
          >
            전체
          </button>
          {member.enrollments.map((enrollment) => (
            <button
              type="button"
              className={enrollmentFilter === enrollment.id ? 'active' : ''}
              onClick={() => {
                setEnrollmentFilter(enrollment.id)
                setVisibleCount(10)
              }}
              key={enrollment.id}
            >
              {enrollment.passName}
            </button>
          ))}
        </div>
      )}
      <p className="hint historyHint">누르면 그 날짜 출석부로 이동해요.</p>
      <ul>
        {shown.map((record) => {
          const recordClass = classes.find((danceClass) => danceClass.id === record.classId)
          return (
            <li key={`${record.date}-${record.classId}`}>
              <button
                type="button"
                disabled={!recordClass}
                onClick={() => {
                  if (!recordClass) return
                  onJump(record.classId, record.date)
                }}
              >
                <span>{record.date}</span>
                <em>{recordClass?.name ?? '삭제된 수업'}</em>
                <b className={`state-${record.status}`}>{attendanceLabel(record.status)}</b>
              </button>
            </li>
          )
        })}
      </ul>
      {!filtered.length && <p className="emptyText">이 수강권의 출석 이력이 없어요.</p>}
      {filtered.length > visibleCount && (
        <button
          type="button"
          className="historyMoreButton"
          onClick={() => setVisibleCount((current) => current + 10)}
        >
          10개 더 보기 (남은 {filtered.length - visibleCount}건)
        </button>
      )}
    </details>
  )
}

function PaymentsView({
  classes,
  gigs,
  members,
  paymentArchive,
  onEndEnrollment,
  onNotify,
  onOpenSms,
  onQuickRenew,
  onRemovePayment,
  onUpdatePaymentDate,
  onUpdateEnrollment,
}: {
  classes: DanceClass[]
  gigs: Gig[]
  members: Member[]
  paymentArchive: ArchivedPayment[]
  onEndEnrollment: (memberId: string, enrollmentId: string) => void
  onNotify: (message: string) => void
  onOpenSms: (memberId: string) => void
  onQuickRenew: (memberId: string, enrollmentId: string) => void
  onRemovePayment: (ref: PaymentSourceRef) => void
  onUpdatePaymentDate: (ref: PaymentSourceRef, record: PaymentRecord, date: string) => void
  onUpdateEnrollment: (memberId: string, enrollmentId: string, formData: FormData) => void
}) {
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all')
  const [openEditorId, setOpenEditorId] = useState<string | null>(null)
  const [logMonth, setLogMonth] = useState<'this' | 'last' | 'all'>('this')
  const [logVisible, setLogVisible] = useState(30)
  const [monthlyLedgerExpanded, setMonthlyLedgerExpanded] = useState(false)
  const [financialSummaryExpanded, setFinancialSummaryExpanded] = useState(false)
  const counts = {
    paid: members.filter((member) => memberWorstStatus(member) === 'paid').length,
    soon: members.filter((member) => memberWorstStatus(member) === 'soon').length,
    unpaid: members.filter((member) => memberWorstStatus(member) === 'unpaid').length,
  }
  const monthKey = todayKey.slice(0, 7)
  // 현재 회원의 결제 + 삭제된 수강권/회원의 보존 기록을 합쳐 매출을 집계한다.
  // ref는 수납 내역에서 잘못된 기록 1건을 지울 때 원본을 찾는 데 쓴다.
  const allPayments = buildPaymentLedger(members, paymentArchive, classes)
  const receivedPayments = allPayments.filter((payment) => payment.date <= todayKey)
  const incomeSummary = calculateIncomeSummary(allPayments, gigs, todayKey)
  const monthPayments = receivedPayments.filter((payment) => payment.date.startsWith(monthKey))
  const shownMonthPayments = monthlyLedgerExpanded ? monthPayments : monthPayments.slice(0, 3)
  const monthTotal = incomeSummary.monthPaymentTotal
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
  const lastMonthTotal = allPayments
    .filter((payment) => payment.date.startsWith(lastMonthKey))
    .reduce((sum, payment) => sum + payment.amount, 0)
  const monthCount = monthPayments.length
  const unpaidTotal = members
    .flatMap((member) => member.enrollments)
    .filter((enrollment) => enrollmentStatus(enrollment) === 'unpaid')
    .reduce((sum, enrollment) => sum + enrollment.paidAmount, 0)
  const paidMonthKeys = [...new Set(receivedPayments.map((payment) => payment.date.slice(0, 7)))]
  const monthlyAverage = paidMonthKeys.length
    ? Math.round(
        receivedPayments.reduce((sum, payment) => sum + payment.amount, 0) / paidMonthKeys.length,
      )
    : 0
  // 이번 달 외부 강의는 '오늘까지 한 것'만 수입으로 잡고, 남은 스케줄은 예정으로 따로 보여준다
  const monthGigs = gigs.filter(
    (gig) => gig.date.startsWith(monthKey) && gig.date <= todayKey,
  )
  const monthGigTotal = incomeSummary.monthGigTotal
  const upcomingGigs = gigs.filter(
    (gig) => gig.date.startsWith(monthKey) && gig.date > todayKey,
  )
  const upcomingGigTotal = upcomingGigs.reduce((sum, gig) => sum + gig.fee, 0)
  const lastMonthGigTotal = gigs
    .filter((gig) => gig.date.startsWith(lastMonthKey))
    .reduce((sum, gig) => sum + gig.fee, 0)
  // 받아야 할 회비(미납) 목록 — 많이 밀린 순서
  const unpaidList = members
    .flatMap((member) =>
      member.enrollments
        .filter((enrollment) => enrollmentStatus(enrollment) === 'unpaid')
        .map((enrollment) => ({
          dueDays: daysUntil(enrollment.nextPaymentDue),
          enrollment,
          member,
        })),
    )
    .sort(
      (a, b) =>
        (a.dueDays ?? 999) - (b.dueDays ?? 999) ||
        a.member.name.localeCompare(b.member.name, 'ko'),
    )
  // 곧 결제 예정(임박) 목록 — 며칠 안 남은 순서. 받을 돈 예측용
  const soonList = members
    .flatMap((member) =>
      member.enrollments
        .filter((enrollment) => enrollmentStatus(enrollment) === 'soon')
        .map((enrollment) => ({
          dueDays: daysUntil(enrollment.nextPaymentDue),
          enrollment,
          member,
        })),
    )
    .sort(
      (a, b) =>
        (a.dueDays ?? 99) - (b.dueDays ?? 99) ||
        a.member.name.localeCompare(b.member.name, 'ko'),
    )
  const soonTotal = soonList.reduce((sum, item) => sum + item.enrollment.paidAmount, 0)
  const yearTotal = incomeSummary.yearActualTotal

  // 정산·세금 신고용: 회비 + 외부 강의 수입 전체를 엑셀(CSV)로 내보낸다
  function exportIncomeCsv() {
    const rows: Array<Array<string | number>> = [
      ...receivedPayments.map((payment) => [
        payment.date,
        '회비',
        payment.memberName,
        payment.passName,
        payment.amount,
      ]),
      ...gigs
        .filter((gig) => gig.date <= todayKey)
        .map((gig) => [gig.date, '외부 강의', gig.name, '', gig.fee]),
    ].sort((a, b) => String(b[0]).localeCompare(String(a[0])))
    const csv =
      '﻿' +
      [['날짜', '구분', '이름/수업', '수강권', '금액'], ...rows]
        .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(','))
        .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `라인댄스-수입내역-${todayKey}.csv`
    link.click()
    URL.revokeObjectURL(url)
    onNotify('수입 내역을 엑셀 파일로 내보냈습니다')
  }
  // 월별 수입 (회비 + 외부 강의) — 최근 6개월
  const incomeByMonth = new Map<string, { fees: number; gigs: number }>()
  for (const payment of receivedPayments) {
    const key = payment.date.slice(0, 7)
    const row = incomeByMonth.get(key) ?? { fees: 0, gigs: 0 }
    row.fees += payment.amount
    incomeByMonth.set(key, row)
  }
  for (const gig of gigs) {
    if (gig.date > todayKey) continue
    const key = gig.date.slice(0, 7)
    const row = incomeByMonth.get(key) ?? { fees: 0, gigs: 0 }
    row.gigs += gig.fee
    incomeByMonth.set(key, row)
  }
  const incomeMonths = [...incomeByMonth.keys()].sort((a, b) => b.localeCompare(a)).slice(0, 6)
  const visiblePayments =
    logMonth === 'all'
      ? receivedPayments
      : receivedPayments.filter((payment) =>
          payment.date.startsWith(logMonth === 'this' ? monthKey : lastMonthKey),
        )
  const visibleTotal = visiblePayments.reduce((sum, payment) => sum + payment.amount, 0)
  const visibleMembers = (
    statusFilter === 'all'
      ? members
      : members.filter((member) => memberWorstStatus(member) === statusFilter)
  )
    .slice()
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))
  const filters: Array<{ label: string; value: PaymentStatus | 'all' }> = [
    { label: `전체 ${members.length}`, value: 'all' },
    { label: `완납 ${counts.paid}`, value: 'paid' },
    { label: `임박 ${counts.soon}`, value: 'soon' },
    { label: `미납 ${counts.unpaid}`, value: 'unpaid' },
  ]

  return (
    <section className="screen">
      <section className="paymentHero" aria-label="이번 달 재무 요약">
        <p>이번 달 총수입</p>
        <strong>{formatCurrency(monthTotal + monthGigTotal)}</strong>
        <div className="paymentHeroMetrics">
          <span>
            회비 {formatCurrency(monthTotal)}
            {monthCount > 0 && ` · ${monthCount}건`}
          </span>
          <span>
            외부 강의 {formatCurrency(monthGigTotal)}
            {monthGigs.length > 0 && ` · ${monthGigs.length}회`}
          </span>
          {unpaidTotal > 0 && (
            <span className="heroDanger">
              미수 {formatCurrency(unpaidTotal)} · {unpaidList.length}건
            </span>
          )}
        </div>
        <button
          type="button"
          className="financialSummaryToggle"
          onClick={() => setFinancialSummaryExpanded((current) => !current)}
        >
          {financialSummaryExpanded ? '재무 요약 접기' : '재무 요약 상세'}
        </button>
        {financialSummaryExpanded && (
          <div className="financialSummaryDetails">
            {upcomingGigTotal > 0 && (
              <span>
                이달 남은 강의 예정 {formatCurrency(upcomingGigTotal)} · {upcomingGigs.length}회
              </span>
            )}
            <span>지난달 총 {formatCurrency(lastMonthTotal + lastMonthGigTotal)}</span>
            <span>올해 실제 수입 {formatCurrency(yearTotal)}</span>
            {incomeSummary.futureScheduledTotal > 0 && (
              <span>예정 수입 {formatCurrency(incomeSummary.futureScheduledTotal)}</span>
            )}
            <span>월 평균 회비 {formatCurrency(monthlyAverage)}</span>
            <span>완납 {counts.paid} · 임박 {counts.soon} · 미납 {counts.unpaid}</span>
          </div>
        )}
      </section>

      <section className="panel monthlyPaymentLedger" aria-label="이번 달 입금 내역">
        <div className="ledgerHeading">
          <div>
            <h2>이번 달 입금 내역</h2>
            <p className="hint">실제 입금일 최신순</p>
          </div>
          <strong>{formatCurrency(monthTotal)}</strong>
        </div>
        <div className="monthlyLedgerRows">
          {shownMonthPayments.map((payment) => (
            <details
              className="paymentLogRow monthlyPaymentRow"
              key={`${payment.ref.kind}-${payment.sourceOrder}`}
            >
              <summary>
                <span className="paymentLogDate">{payment.date.slice(5).replace('-', '/')}</span>
                <strong>{payment.memberName}</strong>
                <b>{formatCurrency(payment.amount)}</b>
              </summary>
              <div className="monthlyPaymentDetail">
                <p>
                  <span>수강권</span>
                  <b>{payment.passName}</b>
                </p>
                <p>
                  <span>수업</span>
                  <b>{payment.classNames.join(' · ')}</b>
                </p>
                <form
                  className="monthlyPaymentDateForm"
                  onSubmit={(event) => {
                    event.preventDefault()
                    const date = String(new FormData(event.currentTarget).get('paymentDate') ?? '')
                    onUpdatePaymentDate(payment.ref, { amount: payment.amount, date: payment.date }, date)
                  }}
                >
                  <label>
                    실제 입금일
                    <input aria-label="실제 입금일" defaultValue={payment.date} name="paymentDate" type="date" />
                  </label>
                  <button type="submit">입금일 저장</button>
                </form>
                <button
                  type="button"
                  className="paymentLogDelete"
                  aria-label={`${payment.memberName} ${payment.date} 수납 기록 삭제`}
                  onClick={() => {
                    if (
                      window.confirm(
                        `${payment.date} ${payment.memberName} ${formatCurrency(payment.amount)} 수납 기록을 삭제할까요?\n(매출 합계에서 빠져요)`,
                      )
                    ) {
                      onRemovePayment(payment.ref)
                    }
                  }}
                >
                  이 입금 기록 삭제
                </button>
              </div>
            </details>
          ))}
          {!monthPayments.length && (
            <p className="emptyText">이번 달에 기록된 입금이 없습니다.</p>
          )}
        </div>
        {monthPayments.length > 3 && (
          <button
            type="button"
            className="monthlyLedgerToggle"
            onClick={() => setMonthlyLedgerExpanded((current) => !current)}
          >
            {monthlyLedgerExpanded ? '입금 내역 접기' : `전체 ${monthPayments.length}건 보기`}
          </button>
        )}
      </section>

      {/* 받아야 할 돈부터 한눈에 — 밀린 회비(빨강) + 곧 결제 예정(주황).
          이름을 누르면 그 회원의 결제 카드로, 문자·전화로 바로 독촉·안내 */}
      {(unpaidList.length > 0 || soonList.length > 0) && (
        <section className="panel">
          <h2>받아야 할 회비</h2>
          <div className="listStack">
            {unpaidList.map(({ dueDays, enrollment, member }) => (
              <div className="dueRow" key={enrollment.id}>
                <button
                  type="button"
                  className="dueInfo"
                  onClick={() => {
                    setStatusFilter('all')
                    setTimeout(() => {
                      document
                        .getElementById(`payment-card-${member.id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 120)
                  }}
                >
                  <strong>{member.name}</strong>
                  <small>
                    {enrollment.passName}
                    {enrollment.totalCredits > 0 && enrollment.remainingCredits <= 0
                      ? ' · 횟수 소진'
                      : dueDays !== null && dueDays < 0
                        ? ` · ${-dueDays}일 지남`
                        : ''}
                  </small>
                  <b>{formatCurrency(enrollment.paidAmount)}</b>
                </button>
                <button
                  type="button"
                  className="smsButton"
                  onClick={() => onOpenSms(member.id)}
                  aria-label={`${member.name} 문자`}
                >
                  <MessageCircle size={17} />
                </button>
                <a
                  className="callButton"
                  href={`tel:${member.phone}`}
                  aria-label={`${member.name} 전화`}
                >
                  <PhoneCall size={17} />
                </a>
              </div>
            ))}
            {soonList.map(({ dueDays, enrollment, member }) => (
              <div className="dueRow soonRow" key={enrollment.id}>
                <button
                  type="button"
                  className="dueInfo"
                  onClick={() => {
                    setStatusFilter('all')
                    setTimeout(() => {
                      document
                        .getElementById(`payment-card-${member.id}`)
                        ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                    }, 120)
                  }}
                >
                  <strong>{member.name}</strong>
                  <small>
                    {enrollment.passName}
                    {enrollment.totalCredits > 0 && enrollment.remainingCredits <= 2
                      ? ` · 잔여 ${enrollment.remainingCredits}회`
                      : dueDays !== null
                        ? ` · D-${dueDays}`
                        : ''}
                  </small>
                  <b>{formatCurrency(enrollment.paidAmount)}</b>
                </button>
                <button
                  type="button"
                  className="smsButton"
                  onClick={() => onOpenSms(member.id)}
                  aria-label={`${member.name} 문자`}
                >
                  <MessageCircle size={17} />
                </button>
                <a
                  className="callButton"
                  href={`tel:${member.phone}`}
                  aria-label={`${member.name} 전화`}
                >
                  <PhoneCall size={17} />
                </a>
              </div>
            ))}
          </div>
          <p className="hint ruleHint">
            {unpaidTotal > 0 && `밀린 회비 ${formatCurrency(unpaidTotal)}`}
            {unpaidTotal > 0 && soonTotal > 0 && ' · '}
            {soonTotal > 0 && `곧 결제 예정 ${formatCurrency(soonTotal)}`} — 이름을 누르면 그
            회원의 결제 카드로 이동해요.
          </p>
        </section>
      )}

      <section className="panel">
        <h2>결제와 수강권</h2>
        <p className="hint storageHint">상태는 결제일·잔여횟수 기준 자동 표시</p>
        <div className="paymentFilters" role="tablist" aria-label="결제 상태 필터">
          {filters.map((filter) => (
            <button
              type="button"
              className={statusFilter === filter.value ? `active filter-${filter.value}` : ''}
              onClick={() => setStatusFilter(filter.value)}
              key={filter.value}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="listStack">
          {visibleMembers.map((member) => {
            const worst = memberWorstStatus(member)
            return (
              <article className="paymentCard" id={`payment-card-${member.id}`} key={member.id}>
                <div className="paymentHead">
                  <div>
                    <strong>{member.name}</strong>
                    <span>
                      {member.enrollments.length
                        ? member.enrollments.map((e) => e.passName).join(' · ')
                        : '수강권 없음'}
                    </span>
                  </div>
                  <b className={worst}>{paymentLabel(worst)}</b>
                </div>

                {member.enrollments.map((enrollment) => {
                  const status = enrollmentStatus(enrollment)
                  const dueDays = daysUntil(enrollment.nextPaymentDue)
                  const totalPaid = enrollment.payments.reduce(
                    (sum, payment) => sum + payment.amount,
                    0,
                  )
                  return (
                    <details className="enrollPayBlock" key={enrollment.id}>
                      {/* 닫힌 상태에서는 핵심(수강권명·잔여/디데이·상태)만 한 줄로 */}
                      <summary className="enrollPaySummary">
                        <span className="enrollTitle">{enrollment.passName}</span>
                        <small>
                          {enrollment.totalCredits > 0
                            ? enrollment.remainingCredits < 0
                              ? `${-enrollment.remainingCredits}회 초과`
                              : `잔여 ${enrollment.remainingCredits}회`
                            : dueDays === null
                              ? ''
                              : dueDays < 0
                                ? `${Math.abs(dueDays)}일 지남`
                                : `D-${dueDays}`}
                        </small>
                        <b className={`enrollStatus es-${status}`}>{paymentLabel(status)}</b>
                        <ChevronRight size={14} className="enrollChevron" />
                      </summary>
                      {status === 'unpaid' && (
                        <p className="dueNotice">
                          받아야 할 회비 <b>{formatCurrency(enrollment.paidAmount)}</b>
                          {dueDays !== null && dueDays < 0 && ` · ${Math.abs(dueDays)}일 지남`}
                        </p>
                      )}
                      <div className="paymentSummary">
                        {enrollment.totalCredits > 0 ? (
                          <span>
                            남은 횟수{' '}
                            <b className={enrollment.remainingCredits < 0 ? 'unpaid' : ''}>
                              {enrollment.remainingCredits < 0
                                ? `${-enrollment.remainingCredits}회 초과`
                                : `${enrollment.remainingCredits}/${enrollment.totalCredits}회`}
                            </b>
                          </span>
                        ) : (
                          <span>
                            다음 결제까지{' '}
                            <b>
                              {dueDays === null
                                ? '-'
                                : dueDays < 0
                                  ? `${Math.abs(dueDays)}일 지남`
                                  : `${dueDays}일`}
                            </b>
                          </span>
                        )}
                        <span>회비(1회 결제) <b>{formatCurrency(enrollment.paidAmount)}</b></span>
                        <span>
                          누적 결제{' '}
                          <b>
                            {formatCurrency(totalPaid)}
                            {enrollment.payments.length > 0 && ` (${enrollment.payments.length}건)`}
                          </b>
                        </span>
                        <span>최근 결제 <b>{enrollment.lastPaidAt || '-'}</b></span>
                        <span>다음 결제 <b>{enrollment.nextPaymentDue || '기간 없음'}</b></span>
                      </div>
                      <button
                        type="button"
                        className={status === 'paid' ? 'renewButton subtle' : 'renewButton'}
                        onClick={() => {
                          const overuse = Math.min(0, enrollment.remainingCredits)
                          if (
                            window.confirm(
                              `${member.name}님 '${enrollment.passName}' 재결제 처리할까요?\n· 결제일: 오늘${
                                enrollment.totalCredits > 0
                                  ? `\n· 잔여횟수 ${enrollment.totalCredits + overuse}회로 충전${overuse < 0 ? ` (초과 ${-overuse}회 차감)` : ''}${enrollment.nextPaymentDue ? '\n· 유효기간 3개월 연장' : ''}`
                                  : '\n· 다음 결제일 1개월 뒤로'
                              }\n\n적용 후 아래에서 날짜·횟수를 직접 고칠 수 있어요.`,
                            )
                          ) {
                            onQuickRenew(member.id, enrollment.id)
                            setOpenEditorId(enrollment.id)
                          }
                        }}
                      >
                        재결제 받음 (완납 처리)
                      </button>
                      {status === 'unpaid' && (
                        <button
                          type="button"
                          className="endEnrollmentButton"
                          onClick={() => {
                            if (
                              window.confirm(
                                `${member.name}님의 '${enrollment.passName}' 수강을 종료할까요?\n\n미납 목록에서는 빠지고, 기존 입금·출석 이력은 그대로 보존됩니다.`,
                              )
                            ) {
                              onEndEnrollment(member.id, enrollment.id)
                            }
                          }}
                        >
                          미납 수강 종료
                        </button>
                      )}
                      <div className="paymentEditor">
                        <button
                          type="button"
                          className="paymentEditorToggle"
                          onClick={() =>
                            setOpenEditorId(openEditorId === enrollment.id ? null : enrollment.id)
                          }
                        >
                          결제 정보 수정
                        </button>
                        {openEditorId === enrollment.id && (
                          <form
                            className="paymentForm"
                            onSubmit={(event) => {
                              event.preventDefault()
                              onUpdateEnrollment(
                                member.id,
                                enrollment.id,
                                new FormData(event.currentTarget),
                              )
                            }}
                            key={enrollment.id}
                          >
                            <Field label="총 횟수">
                              <input
                                name="totalCredits"
                                type="number"
                                min="0"
                                defaultValue={enrollment.totalCredits}
                              />
                            </Field>
                            <Field label="잔여 횟수">
                              <input
                                name="remainingCredits"
                                type="number"
                                defaultValue={enrollment.remainingCredits}
                              />
                            </Field>
                            <Field label="결제 금액">
                              <input
                                name="paidAmount"
                                type="number"
                                min="0"
                                defaultValue={enrollment.paidAmount}
                              />
                            </Field>
                            <Field label="최근 결제일">
                              <input
                                name="lastPaidAt"
                                type="date"
                                defaultValue={enrollment.lastPaidAt || todayKey}
                              />
                            </Field>
                            <Field label="다음 결제일 (유효기간)">
                              <input
                                name="nextPaymentDue"
                                type="date"
                                defaultValue={enrollment.nextPaymentDue}
                              />
                            </Field>
                            <button type="submit">저장</button>
                          </form>
                        )}
                      </div>
                    </details>
                  )
                })}
                {!member.enrollments.length && (
                  <p className="emptyText">수강권이 없어요. 회원 탭에서 추가해 주세요.</p>
                )}
              </article>
            )
          })}
          {!visibleMembers.length && <p className="emptyText">해당 상태의 회원이 없습니다.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>수납 내역</h2>
        <div className="paymentFilters" role="tablist" aria-label="수납 내역 기간">
          {(
            [
              { label: '이번 달', value: 'this' },
              { label: '지난달', value: 'last' },
              { label: '전체', value: 'all' },
            ] as const
          ).map((option) => (
            <button
              type="button"
              className={logMonth === option.value ? 'active' : ''}
              onClick={() => {
                setLogMonth(option.value)
                setLogVisible(30)
              }}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        {visiblePayments.length > 0 && (
          <p className="hint logTotal">
            이 기간 합계 <b>{formatCurrency(visibleTotal)}</b> · {visiblePayments.length}건
          </p>
        )}
        <p className="hint storageHint">
          수강권 등록·재결제 때 자동 기록돼요. 잘못 잡힌 기록은 ✕로 지울 수 있어요.
        </p>
        <div className="listStack">
          {visiblePayments.slice(0, logVisible).map((payment, index) => (
            <div
              className="paymentLogRow"
              key={`${payment.date}-${payment.memberName}-${payment.amount}-${index}`}
            >
              <span className="paymentLogDate">{payment.date.slice(2).replaceAll('-', '/')}</span>
              <strong>
                {payment.memberName}
                <small> · {payment.passName}</small>
                <small className="paymentClassName">{payment.classNames.join(' · ')}</small>
              </strong>
              <b>{formatCurrency(payment.amount)}</b>
              <button
                type="button"
                className="paymentLogDelete"
                aria-label={`${payment.memberName} ${payment.date} 수납 기록 삭제`}
                onClick={() => {
                  if (
                    window.confirm(
                      `${payment.date} ${payment.memberName} ${formatCurrency(payment.amount)} 수납 기록을 삭제할까요?\n(매출 합계에서 빠져요)`,
                    )
                  ) {
                    onRemovePayment(payment.ref)
                  }
                }}
              >
                ✕
              </button>
            </div>
          ))}
          {!visiblePayments.length && (
            <p className="emptyText">이 기간에는 수납 기록이 없습니다.</p>
          )}
        </div>
        {visiblePayments.length > logVisible && (
          <button
            type="button"
            className="historyMoreButton"
            onClick={() => setLogVisible((current) => current + 30)}
          >
            30개 더 보기 (남은 {visiblePayments.length - logVisible}건)
          </button>
        )}
      </section>

      {/* 월별 재무 현황 — 회비·외부 강의를 월 단위로 모아 본다 */}
      {incomeMonths.length > 0 && (
        <section className="panel">
          <h2>월별 수입</h2>
          <div className="listStack">
            {incomeMonths.map((key) => {
              const row = incomeByMonth.get(key) ?? { fees: 0, gigs: 0 }
              return (
                <div className="monthIncomeRow" key={key}>
                  <div>
                    <strong>
                      {Number(key.slice(0, 4))}년 {Number(key.slice(5, 7))}월
                    </strong>
                    <small>
                      회비 {formatCurrency(row.fees)} · 외부 강의 {formatCurrency(row.gigs)}
                    </small>
                  </div>
                  <b>{formatCurrency(row.fees + row.gigs)}</b>
                </div>
              )
            })}
          </div>
          <p className="hint ruleHint">최근 6개월. 외부 강의는 시간표의 내 스케줄 기준이에요.</p>
          <button type="button" className="historyMoreButton" onClick={exportIncomeCsv}>
            수입 내역 엑셀(CSV) 내보내기 — 정산·세금 신고용
          </button>
        </section>
      )}
    </section>
  )
}

function FormDrawer({
  action,
  children,
  className,
  hint,
  id,
  submitLabel = '추가',
  title,
}: {
  action: (formData: FormData) => void
  children: React.ReactNode
  className?: string
  hint?: string
  id?: string
  submitLabel?: string
  title: string
}) {
  return (
    <details className={className ? `formDrawer ${className}` : 'formDrawer'} id={id}>
      <summary>
        <span>
          <strong>{title}</strong>
          {hint && <small>{hint}</small>}
        </span>
        <i className="drawerIcon" aria-hidden="true">
          <Plus size={18} />
        </i>
      </summary>
      <form
        className="formGrid"
        onSubmit={(event) => {
          event.preventDefault()
          action(new FormData(event.currentTarget))
          event.currentTarget.reset()
        }}
      >
        {children}
        <button type="submit" className="primaryButton">
          <Plus size={18} />
          {submitLabel}
        </button>
      </form>
    </details>
  )
}

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function NavButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean
  icon: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button type="button" className={active ? 'active' : ''} onClick={onClick}>
      {icon}
      <span>{label}</span>
    </button>
  )
}

function paymentLabel(status: PaymentStatus) {
  return {
    paid: '완납',
    soon: '임박',
    unpaid: '미납',
  }[status]
}

function memberStatusLabel(status: MemberStatus) {
  return {
    active: '등록',
    prospect: '상담',
    waitlist: '대기',
  }[status]
}

function attendanceLabel(status: AttendanceStatus) {
  return {
    present: '출석 완료',
    absent: '결석',
    makeup: '출석 완료',
  }[status]
}

function passCategoryLabel(type: LessonType | 'group') {
  return {
    line_group: '라인댄스 단체반',
    latin_group: '라틴댄스 단체반',
    private: '개인레슨',
    group: '라인댄스 단체반',
  }[type]
}

export default App

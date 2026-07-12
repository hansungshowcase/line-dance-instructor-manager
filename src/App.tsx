import {
  CalendarDays,
  CheckCircle2,
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
  Search,
  Settings2,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import './App.css'

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

type Member = {
  id: string
  name: string
  phone: string
  level: string
  status: MemberStatus
  classIds: string[]
  passType: string
  remainingCredits: number
  totalCredits: number
  paidAmount: number
  payments: PaymentRecord[]
  lastPaidAt: string
  nextPaymentDue: string
  passUntil: string
  paymentStatus: PaymentStatus
  note: string
  consultedAt?: string
  interest?: string
}

type AttendanceBook = Record<string, AttendanceStatus>

const weekdays = ['일', '월', '화', '수', '목', '금', '토']
const today = new Date()
const todayKey = toDateKey(today)
// v3: 실사용 시작 — 샘플 없이 빈 상태로 시작하고, 이전 테스트 데이터는 무시한다
const storageKey = 'line-dance-manager-v3'
const backupKey = 'line-dance-backup-at'
const smsTemplateKey = 'line-dance-sms-templates'
// 주소 뒤에 ?demo 를 붙였을 때만 연습용 샘플 데이터가 보인다
const isDemoMode =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('demo')

const defaultSmsTemplates = {
  unpaid: '회원님 안녕하세요~ 수강료 결제일이 지나서 안내드려요. 확인 부탁드립니다 :)',
  lowCredit: '회원님 안녕하세요~ 수강권 횟수가 얼마 남지 않아 재등록 안내드려요. 계속 함께해요 :)',
  expiring: '회원님 안녕하세요~ 다음 결제일이 다가와서 미리 안내드려요 :)',
}

function sanitizeTemplate(text: string) {
  // 예전 버전의 자동치환 표시가 남아 있으면 자연스러운 문구로 정리한다
  return text
    .replaceAll('{이름}님', '회원님')
    .replaceAll('{이름}', '회원')
    .replaceAll('{잔여}회', '얼마')
    .replaceAll('({결제일})', '')
    .replaceAll('{결제일}', '')
}

type SmsTemplates = typeof defaultSmsTemplates
const startHour = 10

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
    level: '초급',
    status: 'active',
    classIds: ['class-beginner-mon'],
    passType: '월회비',
    remainingCredits: 0,
    totalCredits: 0,
    paidAmount: 90000,
    payments: [{ amount: 90000, date: addDays(-21) }],
    lastPaidAt: addDays(-21),
    nextPaymentDue: addDays(9),
    passUntil: addDays(9),
    paymentStatus: 'soon',
    note: '무릎 무리 금지',
  },
  {
    id: 'member-lee',
    name: '이정아',
    phone: '010-8821-3344',
    level: '중급',
    status: 'active',
    classIds: ['class-intermediate-evening'],
    passType: '10회권',
    remainingCredits: 3,
    totalCredits: 10,
    paidAmount: 120000,
    payments: [{ amount: 120000, date: addDays(-18) }],
    lastPaidAt: addDays(-18),
    nextPaymentDue: addDays(21),
    passUntil: addDays(21),
    paymentStatus: 'paid',
    note: '댄스스포츠 경험 있음',
  },
  {
    id: 'member-park',
    name: '박선희',
    phone: '010-7199-2477',
    level: '초급',
    status: 'active',
    classIds: ['class-beginner-mon'],
    passType: '월회비',
    remainingCredits: 0,
    totalCredits: 0,
    paidAmount: 0,
    payments: [],
    lastPaidAt: addDays(-34),
    nextPaymentDue: addDays(-2),
    passUntil: addDays(-2),
    paymentStatus: 'unpaid',
    note: '이번 주 재등록 안내',
  },
  {
    id: 'member-choi',
    name: '최하은',
    phone: '010-5555-1212',
    level: '입문',
    status: 'prospect',
    classIds: [],
    passType: '상담',
    remainingCredits: 0,
    totalCredits: 0,
    paidAmount: 0,
    payments: [],
    lastPaidAt: '',
    nextPaymentDue: '',
    passUntil: addDays(14),
    paymentStatus: 'soon',
    consultedAt: todayKey,
    interest: '오전 초급반',
    note: '무릎 부담이 적은 반 문의',
  },
  {
    id: 'member-jung',
    name: '정수진',
    phone: '010-4321-7788',
    level: '초급',
    status: 'waitlist',
    classIds: [],
    passType: '대기',
    remainingCredits: 0,
    totalCredits: 0,
    paidAmount: 0,
    payments: [],
    lastPaidAt: '',
    nextPaymentDue: '',
    passUntil: addDays(30),
    paymentStatus: 'soon',
    consultedAt: todayKey,
    interest: '토요일 초급반 대기',
    note: '자리가 나면 바로 연락',
  },
]

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

// 결제 상태는 잔여횟수·다음 결제일 기준으로 자동 판정한다 (수동 변경 불필요)
// 개인레슨(유효기간 없음)은 순수하게 횟수만으로 판정한다
function paymentStatusOf(member: Member): PaymentStatus {
  if (member.totalCredits > 0 && member.remainingCredits <= 0) return 'unpaid'
  const dueDate = member.nextPaymentDue || member.passUntil
  if (!dueDate) {
    if (member.totalCredits > 0) return member.remainingCredits <= 2 ? 'soon' : 'paid'
    return member.paymentStatus
  }
  const daysLeft = daysUntil(dueDate) ?? 0
  if (daysLeft < 0) return 'unpaid'
  if (daysLeft <= 7) return 'soon'
  return 'paid'
}

function smsHref(phone: string, body: string) {
  const separator = /iPhone|iPad|iPod/i.test(navigator.userAgent) ? '&' : '?'
  return `sms:${phone}${separator}body=${encodeURIComponent(body)}`
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

// 개인레슨은 시간표에서 직접 관리하고, 수업 관리 목록에는 그룹 수업만 둔다
function isPrivateClass(danceClass: DanceClass) {
  return danceClass.location === '개인레슨' || danceClass.name.includes('개인레슨')
}

// 그 날짜에 열리는 수업: 매주 반복 수업 + 그 날짜 전용(1회성) 수업
function classesOnDate(allClasses: DanceClass[], date: Date) {
  const dateKey = toDateKey(date)
  return allClasses.filter((danceClass) =>
    danceClass.date ? danceClass.date === dateKey : danceClass.weekday === date.getDay(),
  )
}

function useStoredData() {
  const [members, setMembers] = useState<Member[]>(isDemoMode ? seedMembers : [])
  const [classes, setClasses] = useState<DanceClass[]>(isDemoMode ? seedClasses : [])
  const [passTemplates, setPassTemplates] = useState<PassTemplate[]>(
    isDemoMode ? seedPassTemplates : [],
  )
  const [attendance, setAttendance] = useState<AttendanceBook>({})
  const [gigs, setGigs] = useState<Gig[]>([])

  useEffect(() => {
    if (isDemoMode) return
    const raw = localStorage.getItem(storageKey)
    if (!raw) return
    try {
      const saved = JSON.parse(raw) as {
        members?: Array<
          Omit<Member, 'totalCredits' | 'payments'> & {
            totalCredits?: number
            payments?: PaymentRecord[]
          }
        >
        classes?: DanceClass[]
        passTemplates?: PassTemplate[]
        attendance?: AttendanceBook
        gigs?: Gig[]
      }
      if (saved.members?.length)
        setMembers(
          saved.members.map((member) => ({
            ...member,
            totalCredits: member.totalCredits ?? member.remainingCredits,
            payments:
              member.payments ??
              (member.lastPaidAt && member.paidAmount > 0
                ? [{ amount: member.paidAmount, date: member.lastPaidAt }]
                : []),
          })),
        )
      if (saved.classes?.length) setClasses(saved.classes)
      if (saved.passTemplates?.length) setPassTemplates(saved.passTemplates)
      if (saved.attendance) setAttendance(saved.attendance)
      if (saved.gigs?.length) setGigs(saved.gigs)
    } catch {
      localStorage.removeItem(storageKey)
    }
  }, [])

  useEffect(() => {
    if (isDemoMode) return
    localStorage.setItem(
      storageKey,
      JSON.stringify({ members, classes, passTemplates, attendance, gigs }),
    )
  }, [members, classes, passTemplates, attendance, gigs])

  return {
    attendance,
    classes,
    gigs,
    members,
    passTemplates,
    setAttendance,
    setClasses,
    setGigs,
    setMembers,
    setPassTemplates,
  }
}

function App() {
  const {
    attendance,
    classes,
    gigs,
    members,
    passTemplates,
    setAttendance,
    setClasses,
    setGigs,
    setMembers,
    setPassTemplates,
  } = useStoredData()
  const [tab, setTab] = useState<Tab>('home')
  const [query, setQuery] = useState('')
  const [selectedClassId, setSelectedClassId] = useState(isDemoMode ? seedClasses[0].id : '')
  const [attendanceDate, setAttendanceDate] = useState(todayKey)
  const [convertedMemberId, setConvertedMemberId] = useState<string | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState(() => localStorage.getItem(backupKey) ?? '')
  const [toast, setToast] = useState<string | null>(null)
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplates>(() => {
    try {
      const saved = {
        ...defaultSmsTemplates,
        ...(JSON.parse(localStorage.getItem(smsTemplateKey) ?? '{}') as Partial<SmsTemplates>),
      }
      return {
        unpaid: sanitizeTemplate(saved.unpaid),
        lowCredit: sanitizeTemplate(saved.lowCredit),
        expiring: sanitizeTemplate(saved.expiring),
      }
    } catch {
      return defaultSmsTemplates
    }
  })

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 2200)
    return () => clearTimeout(timer)
  }, [toast])

  function notify(message: string) {
    setToast(message)
  }

  function saveSmsTemplates(formData: FormData) {
    const next: SmsTemplates = {
      unpaid: String(formData.get('unpaid') || defaultSmsTemplates.unpaid),
      lowCredit: String(formData.get('lowCredit') || defaultSmsTemplates.lowCredit),
      expiring: String(formData.get('expiring') || defaultSmsTemplates.expiring),
    }
    setSmsTemplates(next)
    localStorage.setItem(smsTemplateKey, JSON.stringify(next))
    notify('문자 템플릿이 저장되었습니다')
  }

  function copyText(text: string) {
    navigator.clipboard
      ?.writeText(text)
      .then(() => notify('복사되었습니다'))
      .catch(() => notify('복사에 실패했어요. 문구를 길게 눌러 복사해 주세요.'))
  }

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
  const todayClasses = classesOnDate(classes, today)
  const unpaidMembers = activeMembers.filter((member) => paymentStatusOf(member) === 'unpaid')
  const expiringMembers = activeMembers.filter((member) => {
    if (paymentStatusOf(member) === 'unpaid') return false
    const dueDate = new Date(member.nextPaymentDue || member.passUntil)
    const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
    return daysLeft <= 10
  })
  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? classes[0]
  const classMembers = selectedClass
    ? activeMembers.filter(
        (member) =>
          member.classIds.includes(selectedClass.id) && paymentStatusOf(member) !== 'unpaid',
      )
    : []
  const lowCreditMembers = activeMembers.filter(
    (member) =>
      paymentStatusOf(member) !== 'unpaid' &&
      member.totalCredits > 0 &&
      member.remainingCredits <= 2,
  )
  const expiringOnly = expiringMembers.filter(
    (member) => !lowCreditMembers.some((lowCredit) => lowCredit.id === member.id),
  )
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
    const assignedClassIds = selectedPass?.classIds ?? []

    const initialCredits = Number(
      formData.get('remainingCredits') || selectedPass?.sessionCount || 0,
    )
    const paidAmount = Number(formData.get('paidAmount') || selectedPass?.tuitionFee || 0)
    const lastPaidAt = String(formData.get('lastPaidAt') || todayKey)
    // 그룹 수강권은 등록일부터 3개월 유효, 개인레슨은 유효기간 없이 횟수로만 차감
    const nextPaymentDue =
      selectedPass?.type === 'private'
        ? ''
        : selectedPass
          ? addMonthsFrom(lastPaidAt, 3)
          : String(formData.get('nextPaymentDue') || addMonthsFrom(lastPaidAt, 1))

    setMembers((current) => [
      {
        id: makeId('member'),
        name,
        phone,
        level: String(formData.get('level') ?? '초급'),
        status: 'active',
        classIds: assignedClassIds,
        passType: selectedPass?.name ?? String(formData.get('passType') ?? '월회비'),
        remainingCredits: initialCredits,
        totalCredits: initialCredits,
        paidAmount,
        payments: paidAmount > 0 ? [{ amount: paidAmount, date: lastPaidAt }] : [],
        lastPaidAt,
        nextPaymentDue,
        passUntil: nextPaymentDue,
        paymentStatus: 'paid',
        note: String(formData.get('note') ?? ''),
      },
      ...current,
    ])
    notify('회원이 등록되었습니다')
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
    const level = String(formData.get('level') ?? '초급')
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
            level,
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

  function updateMember(memberId: string, formData: FormData) {
    const classIds = formData.getAll('classIds').map(String)
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              name: String(formData.get('name') ?? member.name),
              phone: String(formData.get('phone') ?? member.phone),
              level: String(formData.get('level') ?? member.level),
              status: String(formData.get('status') ?? member.status) as MemberStatus,
              classIds,
              passType: String(formData.get('passType') ?? member.passType),
              remainingCredits: Number(
                formData.get('remainingCredits') ?? member.remainingCredits,
              ),
              totalCredits: Number(formData.get('totalCredits') ?? member.totalCredits),
              paidAmount: Number(formData.get('paidAmount') ?? member.paidAmount),
              lastPaidAt: String(formData.get('lastPaidAt') ?? member.lastPaidAt),
              nextPaymentDue: String(
                formData.get('nextPaymentDue') ?? member.nextPaymentDue,
              ),
              passUntil: String(formData.get('passUntil') ?? member.passUntil),
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

    setMembers((current) => [
      {
        id: makeId('prospect'),
        name,
        phone,
        level: String(formData.get('level') ?? '입문'),
        status: String(formData.get('status') ?? 'prospect') as MemberStatus,
        classIds: [],
        passType: '상담',
        remainingCredits: 0,
        totalCredits: 0,
        paidAmount: 0,
        payments: [],
        lastPaidAt: '',
        nextPaymentDue: '',
        passUntil: addDays(14),
        paymentStatus: 'soon',
        consultedAt: String(formData.get('consultedAt') ?? todayKey),
        interest: String(formData.get('interest') ?? ''),
        note: String(formData.get('note') ?? ''),
      },
      ...current,
    ])
    notify('상담이 등록되었습니다')
  }

  function updatePassTemplate(passId: string, formData: FormData) {
    const pass = passTemplates.find((item) => item.id === passId)
    if (!pass) return
    const name = String(formData.get('name') || pass.name)
    const sessionCount = Number(formData.get('sessionCount') ?? pass.sessionCount)
    if (pass.type === 'private') {
      // 개인레슨 수강권은 이름·횟수·가격만 관리한다
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
      current.map((member) => {
        const hadPassClass = member.classIds.some((id) => pass.classIds.includes(id))
        let nextIds = member.classIds.filter((id) => !removedIds.includes(id))
        if (hadPassClass) {
          createdClasses.forEach((created) => {
            if (!nextIds.includes(created.id)) nextIds = [...nextIds, created.id]
          })
        }
        return { ...member, classIds: nextIds }
      }),
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

  function markAttendance(
    date: string,
    classId: string,
    memberId: string,
    status: AttendanceStatus,
  ) {
    const previous = attendance[attendanceKey(date, classId, memberId)]
    if (previous !== status) {
      // 출석·보강은 잔여횟수를 1회 차감하고, 결석·미체크로 바꾸면 복구한다 (회수권 회원만)
      const wasCounted = previous === 'present' || previous === 'makeup'
      const willCount = status === 'present' || status === 'makeup'
      const delta = (wasCounted ? 1 : 0) - (willCount ? 1 : 0)
      if (delta !== 0) {
        setMembers((current) =>
          current.map((member) =>
            member.id === memberId && member.totalCredits > 0
              ? {
                  ...member,
                  // 초과 사용(음수 잔여)을 허용해서 재등록 때 초과분을 차감할 수 있게 한다
                  remainingCredits: Math.min(
                    member.totalCredits,
                    member.remainingCredits + delta,
                  ),
                }
              : member,
          ),
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

  function convertToMember(memberId: string) {
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              status: 'active' as MemberStatus,
              passType:
                member.passType === '상담' || member.passType === '대기'
                  ? '월회비'
                  : member.passType,
              paymentStatus: 'paid' as PaymentStatus,
              lastPaidAt: todayKey,
              nextPaymentDue: addDays(30),
              passUntil: addDays(30),
            }
          : member,
      ),
    )
    setConvertedMemberId(memberId)
    setTab('members')
    notify('등록 회원으로 전환되었습니다')
  }

  function quickRenew(memberId: string) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member
        // 월회비 +1개월, 그룹 회수권 +3개월, 개인레슨(기간 없음)은 횟수만 충전
        const nextDue =
          member.totalCredits > 0
            ? member.nextPaymentDue
              ? addMonthsFrom(todayKey, 3)
              : ''
            : addMonthsFrom(todayKey, 1)
        return {
          ...member,
          paymentStatus: 'paid' as PaymentStatus,
          lastPaidAt: todayKey,
          nextPaymentDue: nextDue,
          passUntil: nextDue,
          // 초과 사용분(음수 잔여)은 새 충전에서 차감된다
          remainingCredits:
            member.totalCredits > 0
              ? member.totalCredits + Math.min(0, member.remainingCredits)
              : member.remainingCredits,
          payments: [
            ...member.payments.filter((payment) => payment.date !== todayKey),
            { amount: member.paidAmount, date: todayKey },
          ],
        }
      }),
    )
    notify('재결제 처리되었습니다')
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

  function createSlotClass(dateKey: string, startTime: string, memberIds: string[]) {
    const classId = makeId('class')
    const pickedMembers = members.filter((member) => memberIds.includes(member.id))
    const className =
      pickedMembers.length === 1 ? `${pickedMembers[0].name} 개인레슨` : '개인레슨'
    const startMinutes = minutesFromTime(startTime)
    const [year, month, day] = dateKey.split('-').map(Number)
    setClasses((current) => [
      {
        id: classId,
        name: className,
        weekday: new Date(year, month - 1, day).getDay(),
        startTime: timeFromMinutes(startMinutes),
        endTime: timeFromMinutes(startMinutes + 50),
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
        memberIds.includes(member.id)
          ? {
              ...member,
              classIds: [...member.classIds, classId],
              status: 'active' as MemberStatus,
            }
          : member,
      ),
    )
    notify(`${timeFromMinutes(startMinutes)} 수업이 만들어졌습니다`)
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

  function assignMemberToClass(memberId: string, classId: string) {
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId && !member.classIds.includes(classId)
          ? {
              ...member,
              classIds: [...member.classIds, classId],
              // 상담·대기 회원을 수업에 넣으면 등록 회원으로 전환된다
              status: 'active' as MemberStatus,
            }
          : member,
      ),
    )
    notify('수업에 배정되었습니다')
  }

  function removeClass(classId: string) {
    notify('수업이 삭제되었습니다')
    setClasses((current) => current.filter((danceClass) => danceClass.id !== classId))
    setMembers((current) =>
      current.map((member) =>
        member.classIds.includes(classId)
          ? { ...member, classIds: member.classIds.filter((id) => id !== classId) }
          : member,
      ),
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
    notify('회원이 삭제되었습니다')
    setMembers((current) => current.filter((member) => member.id !== memberId))
    setAttendance((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => !key.endsWith(`|${memberId}`)),
      ),
    )
  }

  function removePassTemplate(passId: string) {
    const pass = passTemplates.find((item) => item.id === passId)
    const linkedClassIds = pass?.classIds ?? []
    // 수강권을 지우면 연결된 수업도 시간표·회원 배정에서 함께 정리한다
    if (linkedClassIds.length) {
      setClasses((current) =>
        current.filter((danceClass) => !linkedClassIds.includes(danceClass.id)),
      )
      setMembers((current) =>
        current.map((member) =>
          member.classIds.some((id) => linkedClassIds.includes(id))
            ? {
                ...member,
                classIds: member.classIds.filter((id) => !linkedClassIds.includes(id)),
              }
            : member,
        ),
      )
    }
    setPassTemplates((current) => current.filter((item) => item.id !== passId))
    notify('수강권과 연결된 수업이 삭제되었습니다')
  }

  function addGig(date: string, startTime: string, name: string, fee: number) {
    const startMinutes = minutesFromTime(startTime)
    setGigs((current) => [
      ...current,
      {
        id: makeId('gig'),
        date,
        startTime: timeFromMinutes(startMinutes),
        endTime: timeFromMinutes(startMinutes + 50),
        name: name.trim() || '외부 강의',
        fee,
      },
    ])
    notify('내 스케줄이 추가되었습니다')
  }

  function removeGig(gigId: string) {
    setGigs((current) => current.filter((gig) => gig.id !== gigId))
    notify('스케줄이 삭제되었습니다')
  }

  function exportData() {
    const payload = JSON.stringify(
      { members, classes, passTemplates, attendance, gigs },
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
    const rows = members.map((member) => {
      let present = 0
      let absent = 0
      for (const [key, status] of Object.entries(attendance)) {
        if (!key.endsWith(`|${member.id}`)) continue
        if (status === 'absent') absent += 1
        else present += 1
      }
      const totalPaid = member.payments.reduce((sum, payment) => sum + payment.amount, 0)
      return [
        member.name,
        member.phone,
        memberStatusLabel(member.status),
        member.passType,
        member.remainingCredits,
        member.totalCredits,
        totalPaid,
        member.lastPaidAt,
        member.nextPaymentDue,
        present,
        absent,
        member.note.replaceAll('\n', ' '),
      ]
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

  function openScheduleClass(classId: string) {
    setTab('schedule')
    // 시간표 탭이 그려진 뒤 해당 수업 카드로 스크롤한다
    setTimeout(() => {
      const target =
        document.getElementById(`class-card-${classId}`) ??
        document.getElementById('timeline-view')
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 150)
  }

  function importData(file: File) {
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const saved = JSON.parse(String(reader.result)) as {
          members?: Array<
            Omit<Member, 'totalCredits' | 'payments'> & {
              totalCredits?: number
              payments?: PaymentRecord[]
            }
          >
          classes?: DanceClass[]
          passTemplates?: PassTemplate[]
          attendance?: AttendanceBook
          gigs?: Gig[]
        }
        if (!saved.members?.length && !saved.classes?.length) {
          window.alert('백업 파일 형식이 아닙니다.')
          return
        }
        if (!window.confirm('현재 데이터를 백업 파일 내용으로 교체할까요?')) return
        if (saved.members?.length)
          setMembers(
            saved.members.map((member) => ({
              ...member,
              totalCredits: member.totalCredits ?? member.remainingCredits,
              payments:
                member.payments ??
                (member.lastPaidAt && member.paidAmount > 0
                  ? [{ amount: member.paidAmount, date: member.lastPaidAt }]
                  : []),
            })),
          )
        if (saved.classes?.length) setClasses(saved.classes)
        if (saved.passTemplates?.length) setPassTemplates(saved.passTemplates)
        if (saved.attendance) setAttendance(saved.attendance)
        if (saved.gigs?.length) setGigs(saved.gigs)
        notify('백업 가져오기가 완료되었습니다')
      } catch {
        window.alert('파일을 읽을 수 없습니다. 이 앱에서 내보낸 백업 파일인지 확인해 주세요.')
      }
    }
    reader.readAsText(file)
  }

  function updatePayment(memberId: string, formData: FormData) {
    setMembers((current) =>
      current.map((member) => {
        if (member.id !== memberId) return member
        const paidAmount = Number(formData.get('paidAmount') ?? member.paidAmount)
        const lastPaidAt = String(formData.get('lastPaidAt') ?? member.lastPaidAt)
        const nextPaymentDue = String(formData.get('nextPaymentDue') ?? member.nextPaymentDue)
        // 새 결제일이 기록에 없으면 수납 내역에 추가한다
        const payments =
          paidAmount > 0 && lastPaidAt && !member.payments.some((p) => p.date === lastPaidAt)
            ? [...member.payments, { amount: paidAmount, date: lastPaidAt }]
            : member.payments
        return {
          ...member,
          paymentStatus: String(
            formData.get('paymentStatus') ?? member.paymentStatus,
          ) as PaymentStatus,
          passType: String(formData.get('passType') ?? member.passType),
          remainingCredits: Number(
            formData.get('remainingCredits') ?? member.remainingCredits,
          ),
          totalCredits: Number(formData.get('totalCredits') ?? member.totalCredits),
          paidAmount,
          payments,
          lastPaidAt,
          nextPaymentDue,
          // 수강 만료일은 다음 결제일과 항상 같이 움직인다
          passUntil: nextPaymentDue,
        }
      }),
    )
    notify('결제 정보가 저장되었습니다')
  }

  return (
    <main className={`appShell tab-${tab}`}>
      {tab === 'home' && (
        <HomeView
          backupAgeDays={backupAgeDays}
          backupOverdue={backupOverdue}
          onCopyText={copyText}
          expiringMembers={expiringOnly}
          lowCreditMembers={lowCreditMembers}
          members={members}
          onExport={exportData}
          onExportCsv={exportCsv}
          onImport={importData}
          onOpenSchedule={openScheduleClass}
          onSaveSmsTemplates={saveSmsTemplates}
          setTab={setTab}
          smsTemplates={smsTemplates}
          todayClasses={todayClasses}
          unpaidMembers={unpaidMembers}
        />
      )}
      {tab === 'schedule' && (
        <ScheduleView
          attendance={attendance}
          classes={classes}
          gigs={gigs}
          members={members}
          onAddGig={addGig}
          onAssignMember={assignMemberToClass}
          onCreateSlotClass={createSlotClass}
          onRemoveClass={removeClass}
          onRemoveGig={removeGig}
          onSaveAttendance={saveClassAttendance}
          onUpdateClassTime={updateClassTime}
        />
      )}
      {tab === 'members' && (
        <MembersView
          attendance={attendance}
          classes={classes}
          convertedMemberId={convertedMemberId}
          members={members}
          passTemplates={passTemplates}
          onAddMember={addMember}
          onAddPassTemplate={addPassTemplate}
          onConvertHandled={() => setConvertedMemberId(null)}
          onRemoveMember={removeMember}
          onRemovePassTemplate={removePassTemplate}
          onUpdateMember={updateMember}
          onUpdatePassTemplate={updatePassTemplate}
          query={query}
          setQuery={setQuery}
        />
      )}
      {tab === 'consultations' && (
        <ConsultationsView
          consultationMembers={consultationMembers}
          onAddConsultation={addConsultation}
          onConvertMember={convertToMember}
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
          selectedClass={selectedClass}
          selectedClassId={selectedClassId}
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
          onQuickRenew={quickRenew}
          updatePayment={updatePayment}
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
  onCopyText,
  expiringMembers,
  lowCreditMembers,
  members,
  onExport,
  onExportCsv,
  onImport,
  onOpenSchedule,
  onSaveSmsTemplates,
  setTab,
  smsTemplates,
  todayClasses,
  unpaidMembers,
}: {
  backupAgeDays: number | null
  backupOverdue: boolean
  onCopyText: (text: string) => void
  expiringMembers: Member[]
  lowCreditMembers: Member[]
  members: Member[]
  onExport: () => void
  onExportCsv: () => void
  onImport: (file: File) => void
  onOpenSchedule: (classId: string) => void
  onSaveSmsTemplates: (formData: FormData) => void
  setTab: (tab: Tab) => void
  smsTemplates: SmsTemplates
  todayClasses: DanceClass[]
  unpaidMembers: Member[]
}) {
  const now = new Date()
  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const sortedToday = [...todayClasses].sort((a, b) => a.startTime.localeCompare(b.startTime))
  const ongoingClass = sortedToday.find(
    (item) =>
      minutesFromTime(item.startTime) <= nowMinutes &&
      nowMinutes < minutesFromTime(item.endTime),
  )
  const upcomingClass = sortedToday.find((item) => minutesFromTime(item.startTime) > nowMinutes)
  const heroMessage = ongoingClass
    ? `지금 수업 중 · ${ongoingClass.name} ${ongoingClass.startTime}~${ongoingClass.endTime}`
    : upcomingClass
      ? `다음 수업 ${upcomingClass.startTime} · ${upcomingClass.name}`
      : sortedToday.length
        ? '오늘 수업이 모두 끝났어요'
        : '오늘은 예정된 수업이 없어요'

  return (
    <section className="screen">
      <section className="heroBand">
        <div className="heroInfo">
          <p>
            {today.getMonth() + 1}월 {today.getDate()}일 {weekdays[today.getDay()]}요일
          </p>
          <strong>오늘 수업 {todayClasses.length}개</strong>
          <span>{heroMessage}</span>
        </div>
        <button type="button" onClick={() => setTab('schedule')}>
          시간표 보기
          <ChevronRight size={15} />
        </button>
      </section>

      <section className="panel">
        <h2>오늘 해야 할 수업</h2>
        <div className="listStack">
          {sortedToday.map((danceClass) => {
            const assigned = members.filter((member) =>
              member.classIds.includes(danceClass.id),
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
          {!sortedToday.length && <p className="emptyText">오늘 등록된 수업이 없습니다.</p>}
        </div>
      </section>

      {unpaidMembers.length > 0 && (
        <section className="panel unpaidPanel">
          <h2>🚨 미납 회원 {unpaidMembers.length}명</h2>
          <div className="listStack">
            {unpaidMembers.map((member) => (
              <article className="taskRow danger" key={member.id}>
                <div className="taskAvatar">{member.name.slice(0, 1)}</div>
                <div className="taskBody">
                  <strong>{member.name}</strong>
                  <span>회비 미납 · {member.passType}</span>
                </div>
                <a
                  className="smsButton"
                  href={smsHref(member.phone, smsTemplates.unpaid)}
                  aria-label={`${member.name} 문자`}
                >
                  <MessageCircle size={17} />
                </a>
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
          {lowCreditMembers.map((member) => (
            <article className="taskRow warn" key={member.id}>
              <div className="taskAvatar">{member.name.slice(0, 1)}</div>
              <div className="taskBody">
                <strong>{member.name}</strong>
                <span>
                  잔여 {member.remainingCredits}/{member.totalCredits}회 · 재결제 안내 필요
                </span>
              </div>
              <a
                className="smsButton"
                href={smsHref(member.phone, smsTemplates.lowCredit)}
                aria-label={`${member.name} 문자`}
              >
                <MessageCircle size={17} />
              </a>
              <a className="callButton" href={`tel:${member.phone}`} aria-label={`${member.name} 전화`}>
                <PhoneCall size={17} />
              </a>
            </article>
          ))}
          {expiringMembers.map((member) => (
            <article className="taskRow warn" key={member.id}>
              <div className="taskAvatar">{member.name.slice(0, 1)}</div>
              <div className="taskBody">
                <strong>{member.name}</strong>
                <span>다음 결제 {member.nextPaymentDue || member.passUntil}</span>
              </div>
              <a
                className="smsButton"
                href={smsHref(member.phone, smsTemplates.expiring)}
                aria-label={`${member.name} 문자`}
              >
                <MessageCircle size={17} />
              </a>
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
          {!expiringMembers.length && !lowCreditMembers.length && !backupOverdue && (
            <p className="emptyText">확인할 항목이 없습니다.</p>
          )}
        </div>
      </section>

      <FormDrawer
        key={smsTemplates.unpaid + smsTemplates.lowCredit + smsTemplates.expiring}
        title="문자 템플릿"
        hint="문자 버튼을 누르면 이 문구가 자동으로 채워집니다"
        action={onSaveSmsTemplates}
        submitLabel="템플릿 저장"
      >
        <SmsTemplateEditor onCopy={onCopyText} smsTemplates={smsTemplates} />
      </FormDrawer>

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
            모든 데이터는 이 기기에만 저장됩니다. 복원용 백업은 이 앱에 다시 불러올 수 있고,
            엑셀 파일은 회원 명단을 공유하거나 컴퓨터에서 볼 때 사용해요.
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
    </section>
  )
}

function ScheduleView({
  attendance,
  classes,
  gigs,
  members,
  onAddGig,
  onAssignMember,
  onCreateSlotClass,
  onRemoveClass,
  onRemoveGig,
  onSaveAttendance,
  onUpdateClassTime,
}: {
  attendance: AttendanceBook
  classes: DanceClass[]
  gigs: Gig[]
  members: Member[]
  onAddGig: (date: string, startTime: string, name: string, fee: number) => void
  onAssignMember: (memberId: string, classId: string) => void
  onCreateSlotClass: (dateKey: string, startTime: string, memberIds: string[]) => void
  onRemoveClass: (classId: string) => void
  onRemoveGig: (gigId: string) => void
  onSaveAttendance: (
    date: string,
    classId: string,
    marks: Record<string, AttendanceStatus>,
  ) => void
  onUpdateClassTime: (classId: string, startTime: string) => void
}) {
  const weekDates = getWeekDates(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const [viewMonth, setViewMonth] = useState(
    () => new Date(today.getFullYear(), today.getMonth(), 1),
  )
  const monthDates = getMonthDates(viewMonth)
  const selectedWeekday = selectedDate.getDay()
  const selectedDayClasses = classesOnDate(classes, selectedDate)
  const selectedDayGigs = gigs.filter((gig) => gig.date === toDateKey(selectedDate))
  // 확정된 수업·스케줄이 있는 시간만 보여준다
  const dayClassHours = [
    ...new Set([
      ...selectedDayClasses.map((danceClass) => hourFromTime(danceClass.startTime)),
      ...selectedDayGigs.map((gig) => hourFromTime(gig.startTime)),
    ]),
  ].sort((a, b) => a - b)
  const selectedDateKey = toDateKey(selectedDate)
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
            return (
              <button
                type="button"
                className={`${toDateKey(date) === todayKey ? 'today' : ''} ${
                  isSelected ? 'selected' : ''
                }`}
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
                  } ${dateKey === selectedDateKey ? 'selected' : ''}`}
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
                      onAssignMember={onAssignMember}
                      onRemoveClass={onRemoveClass}
                      onSaveAttendance={onSaveAttendance}
                      onUpdateClassTime={onUpdateClassTime}
                      key={danceClass.id}
                    />
                  ))}
                  {rowGigs.map((gig) => (
                    <div className="timeClassCard gigCard" key={gig.id}>
                      <div className="timeClassTop">
                        <div>
                          <b className="gigBadge">내 스케줄</b>
                          <strong>{gig.name}</strong>
                          <span>{gig.startTime} - {gig.endTime}</span>
                        </div>
                        <small>{formatCurrency(gig.fee)}</small>
                      </div>
                      <button
                        type="button"
                        className="timeDeleteButton gigDelete"
                        onClick={() => {
                          if (window.confirm(`'${gig.name}' 스케줄을 삭제할까요?`)) {
                            onRemoveGig(gig.id)
                          }
                        }}
                      >
                        삭제
                      </button>
                    </div>
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
            onCreate={(startTime, memberIds) =>
              onCreateSlotClass(selectedDateKey, startTime, memberIds)
            }
          />
          <QuickAddGig
            onCreate={(startTime, name, fee) =>
              onAddGig(selectedDateKey, startTime, name, fee)
            }
          />
        </div>
      </section>

    </section>
  )
}

function TimeClassCard({
  attendance,
  danceClass,
  dateKey,
  members,
  onAssignMember,
  onRemoveClass,
  onSaveAttendance,
  onUpdateClassTime,
}: {
  attendance: AttendanceBook
  danceClass: DanceClass
  dateKey: string
  members: Member[]
  onAssignMember: (memberId: string, classId: string) => void
  onRemoveClass: (classId: string) => void
  onSaveAttendance: (
    date: string,
    classId: string,
    marks: Record<string, AttendanceStatus>,
  ) => void
  onUpdateClassTime: (classId: string, startTime: string) => void
}) {
  const [mode, setMode] = useState<'idle' | 'check' | 'assign'>('idle')
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [timeValue, setTimeValue] = useState(danceClass.startTime)
  // 기간 만료·횟수 소진(미납 판정) 회원은 출석 명단에 뜨지 않는다
  const assignedMembers = members.filter(
    (member) =>
      member.status === 'active' &&
      member.classIds.includes(danceClass.id) &&
      paymentStatusOf(member) !== 'unpaid',
  )
  // 등록·상담·대기 구분 없이 모든 회원을 검색해 추가할 수 있다
  const candidates = members.filter((member) => !member.classIds.includes(danceClass.id))
  const searchedCandidates = candidates.filter((member) =>
    `${member.name} ${member.phone}`.toLowerCase().includes(searchTerm.toLowerCase()),
  )
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

      {isPrivateClass(danceClass) && mode === 'idle' && (
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
              if (window.confirm(`'${danceClass.name}' 수업을 삭제할까요?`)) {
                onRemoveClass(danceClass.id)
              }
            }}
          >
            삭제
          </button>
        </div>
      )}

      {mode === 'idle' && (
        <div className="cardActions">
          <button type="button" className="checkStartButton" onClick={startChecking}>
            {checkedCount > 0 ? '출석 수정' : '출석 체크'}
            {assignedMembers.length > 0 && ` (${checkedCount}/${assignedMembers.length})`}
          </button>
          {candidates.length > 0 && (
            <button
              type="button"
              className="assignStartButton"
              onClick={() => {
                setSearchTerm('')
                setMode('assign')
              }}
            >
              + 회원 추가
            </button>
          )}
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

      {mode === 'assign' && (
        <div className="draftRoster">
          <p className="draftGuide">이름을 검색하고, 나온 회원을 누르면 바로 추가됩니다</p>
          <input
            type="search"
            className="pickSearch"
            placeholder="이름·전화번호 검색"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            autoFocus
          />
          {searchTerm &&
            searchedCandidates.map((member) => (
              <button
                type="button"
                className="pickRow"
                onClick={() => onAssignMember(member.id, danceClass.id)}
                key={member.id}
              >
                <span className="pickInfo">
                  <strong>
                    {member.name}
                    {member.status !== 'active' && (
                      <em className="pickStatus">{memberStatusLabel(member.status)}</em>
                    )}
                  </strong>
                  <small>{member.phone} · {member.passType}</small>
                </span>
                <b>+ 추가</b>
              </button>
            ))}
          {searchTerm && !searchedCandidates.length && (
            <em className="draftEmpty">검색 결과가 없습니다</em>
          )}
          <button type="button" className="draftCancel" onClick={() => setMode('idle')}>
            닫기
          </button>
        </div>
      )}
    </div>
  )
}

function QuickAddClass({
  members,
  onCreate,
}: {
  members: Member[]
  onCreate: (startTime: string, memberIds: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [startTime, setStartTime] = useState('10:00')
  const pickedCount = Object.values(picked).filter(Boolean).length
  const searched = searchTerm
    ? members.filter((member) =>
        `${member.name} ${member.phone}`.toLowerCase().includes(searchTerm.toLowerCase()),
      )
    : members.filter((member) => picked[member.id])

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
        <div className="labelRow">
          <span>시작 시간</span>
        </div>
        <input
          type="time"
          value={startTime}
          onChange={(event) => setStartTime(event.target.value)}
          aria-label="시작 시간"
        />
        <p className="draftGuide">수업에 넣을 회원을 검색해서 선택하세요</p>
        <input
          type="search"
          className="pickSearch"
          placeholder="이름·전화번호 검색"
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          autoFocus
        />
        {searched.map((member) => (
          <button
            type="button"
            className={picked[member.id] ? 'pickRow on' : 'pickRow'}
            onClick={() =>
              setPicked((current) => ({ ...current, [member.id]: !current[member.id] }))
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
              <small>{member.phone} · {member.passType}</small>
            </span>
            <b>{picked[member.id] ? '선택됨' : '선택'}</b>
          </button>
        ))}
        {searchTerm && !searched.length && (
          <em className="draftEmpty">검색 결과가 없습니다</em>
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
                Object.entries(picked)
                  .filter(([, isPicked]) => isPicked)
                  .map(([memberId]) => memberId),
              )
              setOpen(false)
            }}
          >
            {pickedCount ? `${startTime}에 ${pickedCount}명 수업 만들기` : '회원을 선택하세요'}
          </button>
        </div>
      </div>
    </div>
  )
}

function QuickAddGig({
  onCreate,
}: {
  onCreate: (startTime: string, name: string, fee: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [startTime, setStartTime] = useState('14:00')
  const [fee, setFee] = useState('60000')

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
              onChange={(event) => setStartTime(event.target.value)}
            />
          </Field>
          <Field label="회당 비용">
            <input
              type="number"
              min="0"
              value={fee}
              onChange={(event) => setFee(event.target.value)}
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
            onClick={() => {
              onCreate(startTime, name, Number(fee) || 0)
              setOpen(false)
              setName('')
            }}
          >
            스케줄 추가
          </button>
        </div>
      </div>
    </div>
  )
}

function MembersView({
  attendance,
  classes,
  convertedMemberId,
  members,
  passTemplates,
  onAddMember,
  onAddPassTemplate,
  onConvertHandled,
  onRemoveMember,
  onRemovePassTemplate,
  onUpdateMember,
  onUpdatePassTemplate,
  query,
  setQuery,
}: {
  attendance: AttendanceBook
  classes: DanceClass[]
  convertedMemberId: string | null
  members: Member[]
  passTemplates: PassTemplate[]
  onAddMember: (formData: FormData) => void
  onAddPassTemplate: (formData: FormData) => void
  onConvertHandled: () => void
  onRemoveMember: (memberId: string) => void
  onRemovePassTemplate: (passId: string) => void
  onUpdateMember: (memberId: string, formData: FormData) => void
  onUpdatePassTemplate: (passId: string, formData: FormData) => void
  query: string
  setQuery: (query: string) => void
}) {
  const [editingMemberId, setEditingMemberId] = useState<string | null>(convertedMemberId)
  const [openMemberId, setOpenMemberId] = useState<string | null>(convertedMemberId)
  const [quickFilter, setQuickFilter] = useState<'all' | 'unpaid' | 'soon' | 'low'>('all')
  const [passFormType, setPassFormType] = useState<LessonType>('line_group')
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
      // 검색 중에는 조건과 상관없이 전체 회원에서 찾는다
      if (query) {
        const haystack = `${member.name} ${member.phone} ${member.note}`.toLowerCase()
        return haystack.includes(query.toLowerCase())
      }
      if (quickFilter === 'unpaid' && paymentStatusOf(member) !== 'unpaid') return false
      if (quickFilter === 'soon' && paymentStatusOf(member) !== 'soon') return false
      if (
        quickFilter === 'low' &&
        !(member.totalCredits > 0 && member.remainingCredits <= 2)
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

      <FormDrawer
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
                <input name="startTime" type="time" defaultValue="10:00" />
              </Field>
              <Field label="종료 시간">
                <input name="endTime" type="time" defaultValue="10:50" />
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
          <p className="hint ruleHint">
            개인레슨은 횟수·가격만 정하면 돼요. 실제 수업 일정은 시간표에서 실시간으로
            추가합니다.
          </p>
        )}
      </FormDrawer>

      {passTemplates.length > 0 && (
        <details className="formDrawer">
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
                                  window.confirm(
                                    `'${pass.name}' 수강권과 연결된 수업을 삭제할까요?`,
                                  )
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

      <FormDrawer id="drawer-member" title="등록 회원 추가" hint="새 회원의 기본 정보와 결제 내역을 입력" action={onAddMember}>
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
        <Field label="수강권 (선택하면 수업이 자동 배정됩니다)">
          <select name="passTemplateId" defaultValue="" key={passCategory}>
            <option value="">수강권 나중에 선택</option>
            {visiblePasses.map((pass) => (
              <option value={pass.id} key={pass.id}>
                {pass.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="총 횟수">
          <input name="remainingCredits" type="number" min="0" placeholder="수강권 선택 시 자동" />
        </Field>
        <div className="split">
          <Field label="결제 금액">
            <input name="paidAmount" type="number" min="0" placeholder="수강권 기준 자동" />
          </Field>
          <Field label="최근 결제일">
            <input name="lastPaidAt" type="date" defaultValue={todayKey} />
          </Field>
        </div>
        <Field label="다음 결제일 (수강권 선택 시 자동: 그룹 3개월, 개인레슨 없음)">
          <input name="nextPaymentDue" type="date" defaultValue={addDays(30)} />
        </Field>
        <Field label="메모">
          <input name="note" placeholder="메모" />
        </Field>
      </FormDrawer>

      <section className="panel">
        <h2>회원 목록</h2>
        <div className="listStack">
          {filtered.map((member) => {
            const dueDays = daysUntil(member.nextPaymentDue || member.passUntil)
            const attendanceSummary = Object.entries(attendance).reduce(
              (summary, [key, status]) => {
                if (!key.endsWith(`|${member.id}`)) return summary
                return {
                  ...summary,
                  [status]: summary[status] + 1,
                }
              },
              { absent: 0, makeup: 0, present: 0 } as Record<AttendanceStatus, number>,
            )
            let lastPresent = ''
            for (const [key, status] of Object.entries(attendance)) {
              if (status !== 'present' || !key.endsWith(`|${member.id}`)) continue
              const date = key.split('|')[0]
              if (date > lastPresent) lastPresent = date
            }
            const isEditing = editingMemberId === member.id
            const isOpen = openMemberId === member.id || isEditing
            const payStatus = paymentStatusOf(member)
            const assignedClasses = classes.filter((danceClass) =>
              member.classIds.includes(danceClass.id),
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
                        {member.status === 'active' && (
                          <b className={`memberBadge pay ${payStatus}`}>
                            {paymentLabel(payStatus)}
                          </b>
                        )}
                      </div>
                    </div>
                    <div className="passBlock">
                      <strong>
                        {assignedClasses.length
                          ? assignedClasses.map((danceClass) => danceClass.name).join(' · ')
                          : member.interest ?? '수업 미지정'}
                      </strong>
                      <span>
                        {member.passType} · {member.lastPaidAt || todayKey} ~ {member.passUntil || '-'}
                        {member.totalCredits > 0 && ` · 잔여 ${member.remainingCredits}회`}
                      </span>
                    </div>
                  </div>
                  {isOpen && (member.status === 'active' ? (
                    <dl className="memberFacts">
                      <div>
                        <dt>다음 결제까지</dt>
                        <dd className={dueDays !== null && dueDays < 0 ? 'unpaid' : ''}>
                          {dueDays === null
                            ? '-'
                            : dueDays < 0
                              ? `${Math.abs(dueDays)}일 지남`
                              : `${dueDays}일`}
                        </dd>
                      </div>
                      {member.totalCredits > 0 && (
                        <div>
                          <dt>잔여횟수</dt>
                          <dd className={member.remainingCredits < 0 ? 'unpaid' : ''}>
                            {member.remainingCredits < 0
                              ? `${-member.remainingCredits}회 초과 사용`
                              : `${member.remainingCredits}/${member.totalCredits}회 남음`}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt>최근 출석일</dt>
                        <dd>{lastPresent || '기록 없음'}</dd>
                      </div>
                      <div>
                        <dt>출석 현황</dt>
                        <dd>
                          출석 {attendanceSummary.present + attendanceSummary.makeup} · 결석{' '}
                          {attendanceSummary.absent}
                        </dd>
                      </div>
                    </dl>
                  ) : (
                    <div className="consultInfo">
                      <span>{member.consultedAt ?? '상담일 없음'} · {member.interest || '관심 수업 미정'}</span>
                      {member.note && <p>{member.note}</p>}
                    </div>
                  ))}
                  {isOpen && (
                    <button
                      type="button"
                      className="editMemberButton"
                      onClick={() => setEditingMemberId(isEditing ? null : member.id)}
                    >
                      {isEditing ? '닫기' : '수정'}
                    </button>
                  )}
                </div>
                {isEditing && (
                <>
                  <div className="memberDetailBody">
                  <div className="memberLookupFoot">
                    <span>{member.note || '상담/진행 메모 없음'}</span>
                    <b>{formatCurrency(member.paidAmount)}</b>
                  </div>
                </div>
                <form
                  className="formGrid memberEditForm"
                  onSubmit={(event) => {
                    event.preventDefault()
                    onUpdateMember(member.id, new FormData(event.currentTarget))
                    setEditingMemberId(null)
                  }}
                >
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
                  <div className="field">
                    <span>배정 수업 (여러 개 선택 가능)</span>
                    <div className="classPicker">
                      {classes.map((danceClass) => (
                        <label key={danceClass.id}>
                          <input
                            type="checkbox"
                            name="classIds"
                            value={danceClass.id}
                            defaultChecked={member.classIds.includes(danceClass.id)}
                          />
                          <span>
                            {danceClass.name} · {weekdays[danceClass.weekday]} {danceClass.startTime}
                          </span>
                        </label>
                      ))}
                      {!classes.length && <p className="emptyText">만든 수업이 없습니다.</p>}
                    </div>
                  </div>
                  <p className="hint ruleHint">
                    횟수·금액·결제일은 결제 탭의 "결제 정보 수정"에서 관리합니다.
                  </p>
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

function ConsultationsView({
  consultationMembers,
  waitlistMembers,
  onAddConsultation,
  onConvertMember,
}: {
  consultationMembers: Member[]
  waitlistMembers: Member[]
  onAddConsultation: (formData: FormData) => void
  onConvertMember: (memberId: string) => void
}) {
  const followUpMembers = [...consultationMembers, ...waitlistMembers].sort((a, b) =>
    (b.consultedAt ?? '').localeCompare(a.consultedAt ?? ''),
  )

  return (
    <section className="screen">
      <FormDrawer id="drawer-consult" title="상담 등록" hint="문의 온 회원의 상담 내용을 기록" action={onAddConsultation}>
        <Field label="이름">
          <input name="name" placeholder="상담 회원 이름" required />
        </Field>
        <Field label="전화번호">
          <input name="phone" type="tel" placeholder="010-0000-0000" required />
        </Field>
        <div className="split">
          <Field label="상담일">
            <input name="consultedAt" type="date" defaultValue={todayKey} />
          </Field>
          <Field label="구분">
            <select name="status" defaultValue="prospect">
              <option value="prospect">상담만 한 사람</option>
              <option value="waitlist">현재 대기</option>
            </select>
          </Field>
        </div>
        <Field label="관심 수업">
          <input name="interest" placeholder="예: 오전 초급반" />
        </Field>
        <Field label="상담 메모">
          <input name="note" placeholder="상담 내역 메모" />
        </Field>
      </FormDrawer>

      <section className="panel">
        <h2>상담 내역</h2>
        <div className="listStack">
          {followUpMembers.map((member) => (
            <article className="consultCard" key={member.id}>
              <div className="consultHead">
                <div>
                  <strong>{member.name}</strong>
                  <a href={`tel:${member.phone}`}>
                    <Phone size={13} /> {member.phone}
                  </a>
                </div>
                <b className={`status-${member.status}`}>{memberStatusLabel(member.status)}</b>
              </div>
              <div className="consultBody">
                <span>{member.consultedAt ?? '상담일 없음'} · {member.interest || '관심 수업 미정'}</span>
                <p>{member.note || '상담 메모 없음'}</p>
              </div>
              <button
                type="button"
                className="convertButton"
                onClick={() => {
                  if (
                    window.confirm(
                      `${member.name}님을 등록 회원으로 전환할까요? 전환 후 회원 탭에서 수업과 수강권을 지정해 주세요.`,
                    )
                  ) {
                    onConvertMember(member.id)
                  }
                }}
              >
                등록 회원으로 전환
              </button>
            </article>
          ))}
          {!followUpMembers.length && <p className="emptyText">등록된 상담 내역이 없습니다.</p>}
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
  selectedClass,
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
  selectedClass: DanceClass | undefined
  selectedClassId: string
  setAttendanceDate: (date: string) => void
  setAttendanceStatus: (memberId: string, status: AttendanceStatus) => void
  setSelectedClassId: (classId: string) => void
}) {
  const [statSearch, setStatSearch] = useState('')
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
          // 과거 데이터의 '보강'도 출석으로 집계한다
          present += 1
          if (date.startsWith(monthKey)) monthPresent += 1
          if (date > lastPresent) lastPresent = date
        }
      }
      records.sort((a, b) => b.date.localeCompare(a.date))
      return { absent, lastPresent, member, monthPresent, present, records }
    })
    .sort(
      (a, b) =>
        b.monthPresent - a.monthPresent ||
        b.present - a.present ||
        a.member.name.localeCompare(b.member.name, 'ko'),
    )
  const summary = classMembers.reduce(
    (acc, member) => {
      const status = attendance[attendanceKey(attendanceDate, selectedClassId, member.id)]
      if (!status) acc.unchecked += 1
      else acc[status] += 1
      return acc
    },
    { present: 0, absent: 0, makeup: 0, unchecked: 0 },
  )

  return (
    <section className="screen">
      <section className="panel">
        <h2>출석 체크</h2>
        <div className="split">
          <Field label="날짜">
            <input
              type="date"
              value={attendanceDate}
              onChange={(event) => setAttendanceDate(event.target.value)}
            />
          </Field>
          <Field label="수업">
            <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
              {classes.map((danceClass) => (
                <option value={danceClass.id} key={danceClass.id}>
                  {danceClass.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        {selectedClass && (
          <p className="hint">
            {weekdays[selectedClass.weekday]} {selectedClass.startTime} · {selectedClass.location}
          </p>
        )}
        <div className="attendanceSummary">
          <span className="ok">출석 {summary.present + summary.makeup}</span>
          <span className="danger">결석 {summary.absent}</span>
          <span>미체크 {summary.unchecked}</span>
        </div>
        <p className="hint ruleHint">
          출석 체크 시 회수권 잔여횟수가 1회 차감되고, 결석·미체크로 바꾸면 복구됩니다. 결석은
          횟수가 차감되지 않아요.
        </p>
      </section>

      <section className="panel">
        <h2>수강 회원</h2>
        {summary.unchecked > 0 && (
          <button type="button" className="markAllButton" onClick={onMarkAllPresent}>
            미체크 {summary.unchecked}명 전체 출석 처리
          </button>
        )}
        <div className="listStack">
          {classMembers.map((member) => {
            const status = attendance[attendanceKey(attendanceDate, selectedClassId, member.id)]
            return (
              <article className="attendanceRow" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <span className={status ? `state-${status}` : ''}>
                    {status ? attendanceLabel(status) : '미체크'}
                    {member.totalCredits > 0 &&
                      (member.remainingCredits < 0
                        ? ` · ${-member.remainingCredits}회 초과`
                        : ` · 잔여 ${member.remainingCredits}/${member.totalCredits}회`)}
                  </span>
                </div>
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
              </article>
            )
          })}
          {!classMembers.length && <p className="emptyText">이 수업반에 배정된 회원이 없습니다.</p>}
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
          {memberStats.map(({ absent, lastPresent, member, monthPresent, present, records }) => {
            const usedCredits = Math.max(0, member.totalCredits - member.remainingCredits)
            const dueDays = daysUntil(member.nextPaymentDue || member.passUntil)
            const isCountOnly =
              member.totalCredits > 0 && !member.nextPaymentDue && !member.passUntil
            return (
              <article className="memberStatRow" key={member.id}>
                <div className="taskAvatar">{member.name.slice(0, 1)}</div>
                <div className="statBody">
                  <strong>{member.name}</strong>
                  <span>{member.passType}</span>
                </div>
                <div className="statBig">
                  {isCountOnly ? (
                    member.remainingCredits < 0 ? (
                      <>
                        <b className="unpaid">{-member.remainingCredits}</b>
                        <span>회 초과</span>
                      </>
                    ) : (
                      <>
                        <b className={member.remainingCredits <= 2 ? 'unpaid' : ''}>
                          {member.remainingCredits}
                        </b>
                        <span>/{member.totalCredits}회 남음</span>
                      </>
                    )
                  ) : dueDays !== null ? (
                    <>
                      <b className={dueDays < 0 ? 'unpaid' : ''}>
                        {dueDays < 0 ? `${Math.abs(dueDays)}일` : `${dueDays}일`}
                      </b>
                      <span>{dueDays < 0 ? '지남' : '남음'}</span>
                    </>
                  ) : (
                    <span>-</span>
                  )}
                </div>
                {member.totalCredits > 0 && (
                  <div
                    className="statProgress"
                    role="progressbar"
                    aria-label={`${member.name} 수강권 사용 현황`}
                    aria-valuemin={0}
                    aria-valuemax={member.totalCredits}
                    aria-valuenow={usedCredits}
                  >
                    <i
                      style={{
                        width: `${Math.min(100, Math.round((usedCredits / member.totalCredits) * 100))}%`,
                      }}
                    />
                  </div>
                )}
                <div className="statChips">
                  <b className="ok">출석 {present}</b>
                  <b className="danger">결석 {absent}</b>
                  {member.totalCredits > 0 && (
                    <b className={member.remainingCredits <= 2 ? 'danger' : ''}>
                      {member.remainingCredits < 0
                        ? `초과 ${-member.remainingCredits}회`
                        : `잔여 ${member.remainingCredits}회`}
                    </b>
                  )}
                  <b>이번 달 {monthPresent}회</b>
                  <b>{lastPresent ? `최근 ${lastPresent.slice(5).replace('-', '/')}` : '기록 없음'}</b>
                </div>
                {records.length > 0 && (
                  <details className="historyDetails">
                    <summary>날짜별 이력 보기 ({records.length}건)</summary>
                    <p className="hint historyHint">
                      항목을 누르면 그 날짜 출석부로 이동해서 수정할 수 있어요.
                    </p>
                    <ul>
                      {records.slice(0, 12).map((record) => {
                        const recordClass = classes.find(
                          (danceClass) => danceClass.id === record.classId,
                        )
                        return (
                          <li key={`${record.date}-${record.classId}`}>
                            <button
                              type="button"
                              disabled={!recordClass}
                              onClick={() => {
                                if (!recordClass) return
                                setSelectedClassId(record.classId)
                                setAttendanceDate(record.date)
                                window.scrollTo({ behavior: 'smooth', top: 0 })
                              }}
                            >
                              <span>{record.date}</span>
                              <em>{recordClass?.name ?? '삭제된 수업'}</em>
                              <b className={`state-${record.status}`}>
                                {attendanceLabel(record.status)}
                              </b>
                            </button>
                          </li>
                        )
                      })}
                      {records.length > 12 && <li className="moreRecords">외 {records.length - 12}건</li>}
                    </ul>
                  </details>
                )}
              </article>
            )
          })}
          {!memberStats.length && <p className="emptyText">등록된 회원이 없습니다.</p>}
        </div>
      </section>
    </section>
  )
}

function PaymentsView({
  classes,
  gigs,
  members,
  onQuickRenew,
  updatePayment,
}: {
  classes: DanceClass[]
  gigs: Gig[]
  members: Member[]
  onQuickRenew: (memberId: string) => void
  updatePayment: (memberId: string, formData: FormData) => void
}) {
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all')
  const [openEditorId, setOpenEditorId] = useState<string | null>(null)
  const [logMonth, setLogMonth] = useState<'this' | 'last' | 'all'>('this')
  const counts = {
    paid: members.filter((member) => paymentStatusOf(member) === 'paid').length,
    soon: members.filter((member) => paymentStatusOf(member) === 'soon').length,
    unpaid: members.filter((member) => paymentStatusOf(member) === 'unpaid').length,
  }
  const monthKey = todayKey.slice(0, 7)
  const allPayments = members
    .flatMap((member) =>
      member.payments.map((payment) => ({ ...payment, memberName: member.name })),
    )
    .sort((a, b) => b.date.localeCompare(a.date))
  const monthTotal = allPayments
    .filter((payment) => payment.date.startsWith(monthKey))
    .reduce((sum, payment) => sum + payment.amount, 0)
  const lastMonthDate = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const lastMonthKey = `${lastMonthDate.getFullYear()}-${String(lastMonthDate.getMonth() + 1).padStart(2, '0')}`
  const lastMonthTotal = allPayments
    .filter((payment) => payment.date.startsWith(lastMonthKey))
    .reduce((sum, payment) => sum + payment.amount, 0)
  const monthCount = allPayments.filter((payment) => payment.date.startsWith(monthKey)).length
  const unpaidTotal = members
    .filter((member) => paymentStatusOf(member) === 'unpaid')
    .reduce((sum, member) => sum + member.paidAmount, 0)
  // 월 평균: 수납 기록이 있는 달 기준
  const paidMonthKeys = [...new Set(allPayments.map((payment) => payment.date.slice(0, 7)))]
  const monthlyAverage = paidMonthKeys.length
    ? Math.round(
        allPayments.reduce((sum, payment) => sum + payment.amount, 0) / paidMonthKeys.length,
      )
    : 0
  // 외부 강의(내 스케줄) 수입
  const monthGigs = gigs.filter((gig) => gig.date.startsWith(monthKey))
  const monthGigTotal = monthGigs.reduce((sum, gig) => sum + gig.fee, 0)
  const visiblePayments =
    logMonth === 'all'
      ? allPayments
      : allPayments.filter((payment) =>
          payment.date.startsWith(logMonth === 'this' ? monthKey : lastMonthKey),
        )
  const visibleMembers =
    statusFilter === 'all'
      ? members
      : members.filter((member) => paymentStatusOf(member) === statusFilter)
  const filters: Array<{ label: string; value: PaymentStatus | 'all' }> = [
    { label: `전체 ${members.length}`, value: 'all' },
    { label: `완납 ${counts.paid}`, value: 'paid' },
    { label: `임박 ${counts.soon}`, value: 'soon' },
    { label: `미납 ${counts.unpaid}`, value: 'unpaid' },
  ]

  return (
    <section className="screen">
      <section className="paymentHero">
        <p>이번 달 받은 회비{monthCount > 0 && ` (${monthCount}건)`}</p>
        <strong>{formatCurrency(monthTotal)}</strong>
        <span>지난달 {formatCurrency(lastMonthTotal)}</span>
        <span>월 평균 {formatCurrency(monthlyAverage)}</span>
        {monthGigTotal > 0 && (
          <span>
            내 스케줄 수입 {formatCurrency(monthGigTotal)} · {monthGigs.length}회
          </span>
        )}
        <span>완납 {counts.paid} · 임박 {counts.soon} · 미납 {counts.unpaid}</span>
        {unpaidTotal > 0 && (
          <span className="heroDanger">밀린 회비 {formatCurrency(unpaidTotal)}</span>
        )}
      </section>

      <section className="panel">
        <h2>결제와 수강권</h2>
        <p className="hint storageHint">
          완납·임박·미납 상태는 다음 결제일과 잔여횟수 기준으로 자동 표시됩니다.
        </p>
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
            const assignedNames = classes
              .filter((danceClass) => member.classIds.includes(danceClass.id))
              .map((danceClass) => danceClass.name)
            const payStatus = paymentStatusOf(member)
            const totalPaid = member.payments.reduce((sum, payment) => sum + payment.amount, 0)
            const dueDays = daysUntil(member.nextPaymentDue || member.passUntil)
            return (
              <article className="paymentCard" key={member.id}>
                <div className="paymentHead">
                  <div>
                    <strong>{member.name}</strong>
                    <span>{assignedNames.length ? assignedNames.join(' · ') : '수업 미지정'} · {member.passType}</span>
                  </div>
                  <b className={payStatus}>{paymentLabel(payStatus)}</b>
                </div>
                {payStatus === 'unpaid' && (
                  <p className="dueNotice">
                    받아야 할 회비 <b>{formatCurrency(member.paidAmount)}</b>
                    {dueDays !== null && dueDays < 0 && ` · ${Math.abs(dueDays)}일 지남`}
                  </p>
                )}
                <div className="paymentSummary">
                  {member.totalCredits > 0 ? (
                    <span>
                      남은 횟수{' '}
                      <b className={member.remainingCredits < 0 ? 'unpaid' : ''}>
                        {member.remainingCredits < 0
                          ? `${-member.remainingCredits}회 초과`
                          : `${member.remainingCredits}/${member.totalCredits}회`}
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
                  <span>회비(1회 결제) <b>{formatCurrency(member.paidAmount)}</b></span>
                  <span>
                    누적 결제 <b>{formatCurrency(totalPaid)}{member.payments.length > 0 && ` (${member.payments.length}건)`}</b>
                  </span>
                  <span>최근 결제 <b>{member.lastPaidAt || '-'}</b></span>
                  <span>다음 결제 <b>{member.nextPaymentDue || '-'}</b></span>
                </div>
                <button
                  type="button"
                  className={payStatus === 'paid' ? 'renewButton subtle' : 'renewButton'}
                  onClick={() => {
                    const overuse = Math.min(0, member.remainingCredits)
                    if (
                      window.confirm(
                        `${member.name}님 재결제 처리할까요?\n· 결제일: 오늘${
                          member.totalCredits > 0
                            ? `\n· 잔여횟수 ${member.totalCredits + overuse}회로 충전${overuse < 0 ? ` (초과 ${-overuse}회 차감)` : ''}${member.nextPaymentDue ? '\n· 유효기간 3개월 연장' : ''}`
                            : '\n· 다음 결제일 1개월 뒤로'
                        }\n\n적용 후 아래에서 날짜·횟수를 직접 고칠 수 있어요.`,
                      )
                    ) {
                      onQuickRenew(member.id)
                      setOpenEditorId(member.id)
                    }
                  }}
                >
                  재결제 받음 (완납 처리)
                </button>
                <div className="paymentEditor">
                  <button
                    type="button"
                    className="paymentEditorToggle"
                    onClick={() =>
                      setOpenEditorId(openEditorId === member.id ? null : member.id)
                    }
                  >
                    결제 정보 수정
                  </button>
                  {openEditorId === member.id && (
                  <form
                    className="paymentForm"
                    onSubmit={(event) => {
                      event.preventDefault()
                      updatePayment(member.id, new FormData(event.currentTarget))
                    }}
                  >
                    <Field label="결제 유형">
                      <select name="passType" defaultValue={member.passType}>
                        {!['월회비', '10회권', '기간권'].includes(member.passType) && (
                          <option>{member.passType}</option>
                        )}
                        <option>월회비</option>
                        <option>10회권</option>
                        <option>기간권</option>
                      </select>
                    </Field>
                    <Field label="총 횟수">
                      <input name="totalCredits" type="number" min="0" defaultValue={member.totalCredits} />
                    </Field>
                    <Field label="잔여 횟수">
                      <input name="remainingCredits" type="number" defaultValue={member.remainingCredits} />
                    </Field>
                    <Field label="결제 금액">
                      <input name="paidAmount" type="number" min="0" defaultValue={member.paidAmount} />
                    </Field>
                    <Field label="최근 결제일">
                      <input name="lastPaidAt" type="date" defaultValue={member.lastPaidAt || todayKey} />
                    </Field>
                    <Field label="다음 결제일 (유효기간)">
                      <input name="nextPaymentDue" type="date" defaultValue={member.nextPaymentDue || addDays(30)} />
                    </Field>
                    <button type="submit">저장</button>
                  </form>
                  )}
                </div>
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
              onClick={() => setLogMonth(option.value)}
              key={option.value}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="listStack">
          {visiblePayments.slice(0, 30).map((payment) => (
            <div className="paymentLogRow" key={`${payment.date}-${payment.memberName}-${payment.amount}`}>
              <span className="paymentLogDate">{payment.date.slice(2).replaceAll('-', '/')}</span>
              <strong>{payment.memberName}</strong>
              <b>{formatCurrency(payment.amount)}</b>
            </div>
          ))}
          {!visiblePayments.length && (
            <p className="emptyText">이 기간에는 수납 기록이 없습니다.</p>
          )}
        </div>
      </section>
    </section>
  )
}

function FormDrawer({
  action,
  children,
  hint,
  id,
  submitLabel = '추가',
  title,
}: {
  action: (formData: FormData) => void
  children: React.ReactNode
  hint?: string
  id?: string
  submitLabel?: string
  title: string
}) {
  return (
    <details className="formDrawer" id={id}>
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

function SmsTemplateEditor({
  onCopy,
  smsTemplates,
}: {
  onCopy: (text: string) => void
  smsTemplates: SmsTemplates
}) {
  const unpaidRef = useRef<HTMLTextAreaElement | null>(null)
  const lowCreditRef = useRef<HTMLTextAreaElement | null>(null)
  const expiringRef = useRef<HTMLTextAreaElement | null>(null)
  const fields: Array<{
    label: string
    name: keyof SmsTemplates
    ref: React.MutableRefObject<HTMLTextAreaElement | null>
  }> = [
    { label: '미납 안내', name: 'unpaid', ref: unpaidRef },
    { label: '재등록 안내', name: 'lowCredit', ref: lowCreditRef },
    { label: '결제일 임박 안내', name: 'expiring', ref: expiringRef },
  ]

  return (
    <>
      <p className="hint ruleHint">
        자주 쓰는 안내 문구를 저장해 두고, 전체 복사해서 문자·카톡에 붙여넣으세요.
      </p>
      {fields.map((field) => (
        <div className="field" key={field.name}>
          <div className="labelRow">
            <span>{field.label}</span>
            <button
              type="button"
              className="copyButton"
              onClick={() => onCopy(field.ref.current?.value ?? '')}
            >
              전체 복사
            </button>
          </div>
          <textarea
            name={field.name}
            defaultValue={smsTemplates[field.name]}
            rows={3}
            ref={field.ref}
          />
        </div>
      ))}
    </>
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

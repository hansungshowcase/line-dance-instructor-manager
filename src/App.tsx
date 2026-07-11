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
import { useEffect, useState } from 'react'
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
const storageKey = 'line-dance-manager-v2'
const backupKey = 'line-dance-backup-at'
const smsTemplateKey = 'line-dance-sms-templates'

const defaultSmsTemplates = {
  unpaid: '{이름}님 안녕하세요~ 수강료 결제일이 지나서 안내드려요. 확인 부탁드립니다 :)',
  lowCredit: '{이름}님 안녕하세요~ 수강권이 {잔여}회 남아서 재등록 안내드려요. 계속 함께해요 :)',
  expiring: '{이름}님 안녕하세요~ 다음 결제일({결제일})이 다가와서 미리 안내드려요 :)',
}

type SmsTemplates = typeof defaultSmsTemplates
const startHour = 10
const endHour = 22

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
function paymentStatusOf(member: Member): PaymentStatus {
  if (member.totalCredits > 0 && member.remainingCredits <= 0) return 'unpaid'
  const dueDate = member.nextPaymentDue || member.passUntil
  if (!dueDate) return member.paymentStatus
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

function useStoredData() {
  const [members, setMembers] = useState<Member[]>(seedMembers)
  const [classes, setClasses] = useState<DanceClass[]>(seedClasses)
  const [passTemplates, setPassTemplates] = useState<PassTemplate[]>(seedPassTemplates)
  const [attendance, setAttendance] = useState<AttendanceBook>({})

  useEffect(() => {
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
    } catch {
      localStorage.removeItem(storageKey)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(
      storageKey,
      JSON.stringify({ members, classes, passTemplates, attendance }),
    )
  }, [members, classes, passTemplates, attendance])

  return {
    attendance,
    classes,
    members,
    passTemplates,
    setAttendance,
    setClasses,
    setMembers,
    setPassTemplates,
  }
}

function App() {
  const {
    attendance,
    classes,
    members,
    passTemplates,
    setAttendance,
    setClasses,
    setMembers,
    setPassTemplates,
  } = useStoredData()
  const [tab, setTab] = useState<Tab>('home')
  const [query, setQuery] = useState('')
  const [selectedClassId, setSelectedClassId] = useState(seedClasses[0].id)
  const [attendanceDate, setAttendanceDate] = useState(todayKey)
  const [convertedMemberId, setConvertedMemberId] = useState<string | null>(null)
  const [lastBackupAt, setLastBackupAt] = useState(() => localStorage.getItem(backupKey) ?? '')
  const [toast, setToast] = useState<string | null>(null)
  const [smsTemplates, setSmsTemplates] = useState<SmsTemplates>(() => {
    try {
      return {
        ...defaultSmsTemplates,
        ...(JSON.parse(localStorage.getItem(smsTemplateKey) ?? '{}') as Partial<SmsTemplates>),
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

  function buildSms(kind: keyof SmsTemplates, member: Member) {
    return smsTemplates[kind]
      .replaceAll('{이름}', member.name)
      .replaceAll('{잔여}', String(member.remainingCredits))
      .replaceAll('{결제일}', member.nextPaymentDue || member.passUntil || '')
  }

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const activeMembers = members.filter((member) => member.status === 'active')
  const consultationMembers = members.filter((member) => member.status === 'prospect')
  const waitlistMembers = members.filter((member) => member.status === 'waitlist')
  const todayClasses = classes.filter((item) => item.weekday === today.getDay())
  const unpaidMembers = activeMembers.filter((member) => paymentStatusOf(member) === 'unpaid')
  const expiringMembers = activeMembers.filter((member) => {
    if (paymentStatusOf(member) === 'unpaid') return false
    const dueDate = new Date(member.nextPaymentDue || member.passUntil)
    const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
    return daysLeft <= 10
  })
  const selectedClass = classes.find((item) => item.id === selectedClassId) ?? classes[0]
  const classMembers = selectedClass
    ? activeMembers.filter((member) => member.classIds.includes(selectedClass.id))
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
  const seedMemberIds = new Set(seedMembers.map((member) => member.id))
  const hasSampleData = members.some((member) => seedMemberIds.has(member.id))
  const hasRealData = members.some((member) => !seedMemberIds.has(member.id))
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
        nextPaymentDue: String(formData.get('nextPaymentDue') ?? addDays(30)),
        passUntil: String(formData.get('passUntil') ?? addDays(30)),
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
    const classIds = templateWeekdays.map(() => makeId('class'))

    const newClasses = templateWeekdays.map((weekday, index) => ({
      id: classIds[index],
      name,
      weekday,
      startTime,
      endTime,
      location: type === 'private' ? '개인레슨' : '스튜디오',
      capacity,
      tuitionFee,
      level,
    }))

    setClasses((current) => [...newClasses, ...current])
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

  function updateClass(classId: string, formData: FormData) {
    setClasses((current) =>
      current.map((danceClass) =>
        danceClass.id === classId
          ? {
              ...danceClass,
              name: String(formData.get('name') ?? danceClass.name),
              weekday: Number(formData.get('weekday') ?? danceClass.weekday),
              startTime: String(formData.get('startTime') ?? danceClass.startTime),
              endTime: String(formData.get('endTime') ?? danceClass.endTime),
              location: String(formData.get('location') ?? danceClass.location),
              capacity: Number(formData.get('capacity') ?? danceClass.capacity),
              tuitionFee: Number(formData.get('tuitionFee') ?? danceClass.tuitionFee),
              level: String(formData.get('level') ?? danceClass.level),
            }
          : danceClass,
      ),
    )
    notify('수업 정보가 저장되었습니다')
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
                  remainingCredits: Math.min(
                    member.totalCredits,
                    Math.max(0, member.remainingCredits + delta),
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
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              paymentStatus: 'paid' as PaymentStatus,
              lastPaidAt: todayKey,
              nextPaymentDue: addDays(30),
              passUntil: addDays(30),
              remainingCredits:
                member.totalCredits > 0 ? member.totalCredits : member.remainingCredits,
              payments: [
                ...member.payments.filter((payment) => payment.date !== todayKey),
                { amount: member.paidAmount, date: todayKey },
              ],
            }
          : member,
      ),
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

  function assignMemberToClass(memberId: string, classId: string) {
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId && !member.classIds.includes(classId)
          ? { ...member, classIds: [...member.classIds, classId] }
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
    setPassTemplates((current) => current.filter((pass) => pass.id !== passId))
    notify('수강권이 삭제되었습니다')
  }

  function exportData() {
    const payload = JSON.stringify({ members, classes, passTemplates, attendance }, null, 2)
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

  function openAttendance(classId: string) {
    setSelectedClassId(classId)
    setAttendanceDate(todayKey)
    setTab('attendance')
  }

  function clearSampleData() {
    if (
      !window.confirm(
        '샘플 회원·수업·수강권을 모두 지울까요? 직접 등록한 데이터는 그대로 남습니다.',
      )
    )
      return
    const sampleClassIds = new Set(seedClasses.map((danceClass) => danceClass.id))
    const samplePassIds = new Set(seedPassTemplates.map((pass) => pass.id))
    setMembers((current) => current.filter((member) => !seedMemberIds.has(member.id)))
    setClasses((current) => current.filter((danceClass) => !sampleClassIds.has(danceClass.id)))
    setPassTemplates((current) => current.filter((pass) => !samplePassIds.has(pass.id)))
    setAttendance((current) =>
      Object.fromEntries(
        Object.entries(current).filter(([key]) => {
          const [, classId, memberId] = key.split('|')
          return !seedMemberIds.has(memberId) && !sampleClassIds.has(classId)
        }),
      ),
    )
    notify('샘플 데이터를 정리했습니다')
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
          nextPaymentDue: String(formData.get('nextPaymentDue') ?? member.nextPaymentDue),
          passUntil: String(formData.get('passUntil') ?? member.passUntil),
        }
      }),
    )
    notify('결제 정보가 저장되었습니다')
  }

  return (
    <main className={`appShell tab-${tab}`}>
      {tab === 'home' && (
        <HomeView
          activeCount={activeMembers.length}
          backupAgeDays={backupAgeDays}
          backupOverdue={backupOverdue}
          buildSms={buildSms}
          consultationCount={consultationMembers.length}
          expiringMembers={expiringOnly}
          hasSampleData={hasSampleData}
          lowCreditMembers={lowCreditMembers}
          members={members}
          onClearSamples={clearSampleData}
          onExport={exportData}
          onImport={importData}
          onOpenAttendance={openAttendance}
          onSaveSmsTemplates={saveSmsTemplates}
          setTab={setTab}
          smsTemplates={smsTemplates}
          todayClasses={todayClasses}
          unpaidMembers={unpaidMembers}
          waitlistCount={waitlistMembers.length}
        />
      )}
      {tab === 'schedule' && (
        <ScheduleView
          attendance={attendance}
          classes={classes}
          members={members}
          onAssignMember={assignMemberToClass}
          onRemoveClass={removeClass}
          onSaveAttendance={saveClassAttendance}
          onUpdateClass={updateClass}
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
  activeCount,
  backupAgeDays,
  backupOverdue,
  buildSms,
  consultationCount,
  expiringMembers,
  hasSampleData,
  lowCreditMembers,
  members,
  onClearSamples,
  onExport,
  onImport,
  onOpenAttendance,
  onSaveSmsTemplates,
  setTab,
  smsTemplates,
  todayClasses,
  unpaidMembers,
  waitlistCount,
}: {
  activeCount: number
  backupAgeDays: number | null
  backupOverdue: boolean
  buildSms: (kind: keyof SmsTemplates, member: Member) => string
  consultationCount: number
  expiringMembers: Member[]
  hasSampleData: boolean
  lowCreditMembers: Member[]
  members: Member[]
  onClearSamples: () => void
  onExport: () => void
  onImport: (file: File) => void
  onOpenAttendance: (classId: string) => void
  onSaveSmsTemplates: (formData: FormData) => void
  setTab: (tab: Tab) => void
  smsTemplates: SmsTemplates
  todayClasses: DanceClass[]
  unpaidMembers: Member[]
  waitlistCount: number
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

      {hasSampleData && (
        <section className="sampleBanner">
          <p>
            <b>지금 보이는 회원·수업은 연습용 샘플이에요.</b> 사용법을 익힌 뒤 지우고
            시작하세요.
          </p>
          <button type="button" onClick={onClearSamples}>
            샘플 모두 지우기
          </button>
        </section>
      )}

      <div className="metricGrid">
        <Metric label="등록 회원" value={`${activeCount}명`} onClick={() => setTab('members')} />
        <Metric
          label="상담만 한 회원"
          value={`${consultationCount}명`}
          onClick={() => setTab('consultations')}
        />
        <Metric
          label="현재 대기"
          value={`${waitlistCount}명`}
          tone="warn"
          onClick={() => setTab('consultations')}
        />
        <Metric
          label="미납"
          value={`${unpaidMembers.length}명`}
          tone="danger"
          onClick={() => setTab('payments')}
        />
      </div>

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
                onClick={() => onOpenAttendance(danceClass.id)}
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
                    <MapPin size={12} /> {danceClass.location} · {danceClass.level} · 탭하면
                    출석부
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
                  href={smsHref(member.phone, buildSms('unpaid', member))}
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
                href={smsHref(member.phone, buildSms('lowCredit', member))}
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
                href={smsHref(member.phone, buildSms('expiring', member))}
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
        <p className="hint ruleHint">
          {'{이름} {잔여} {결제일}'} 부분은 회원에 맞게 자동으로 바뀝니다.
        </p>
        <Field label="미납 안내">
          <textarea name="unpaid" defaultValue={smsTemplates.unpaid} rows={3} />
        </Field>
        <Field label="재등록(잔여횟수) 안내">
          <textarea name="lowCredit" defaultValue={smsTemplates.lowCredit} rows={3} />
        </Field>
        <Field label="결제일 임박 안내">
          <textarea name="expiring" defaultValue={smsTemplates.expiring} rows={3} />
        </Field>
      </FormDrawer>

      <section className="panel">
        <h2>데이터 백업</h2>
        <p className="hint ruleHint">
          모든 데이터는 이 기기에만 저장됩니다. 폰을 바꾸거나 브라우저 데이터를 지우면 사라지니
          주기적으로 파일로 내보내 두세요.
          {backupAgeDays !== null && ` (마지막 백업: ${backupAgeDays === 0 ? '오늘' : `${backupAgeDays}일 전`})`}
        </p>
        <div className="split backupActions">
          <button type="button" className="secondaryButton" onClick={onExport}>
            파일로 내보내기
          </button>
          <label className="secondaryButton importButton">
            백업 가져오기
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
        </div>
      </section>
    </section>
  )
}

function ScheduleView({
  attendance,
  classes,
  members,
  onAssignMember,
  onRemoveClass,
  onSaveAttendance,
  onUpdateClass,
}: {
  attendance: AttendanceBook
  classes: DanceClass[]
  members: Member[]
  onAssignMember: (memberId: string, classId: string) => void
  onRemoveClass: (classId: string) => void
  onSaveAttendance: (
    date: string,
    classId: string,
    marks: Record<string, AttendanceStatus>,
  ) => void
  onUpdateClass: (classId: string, formData: FormData) => void
}) {
  const weekDates = getWeekDates(today)
  const monthDates = getMonthDates(today)
  const [selectedDate, setSelectedDate] = useState(today)
  const classHours = classes.map((danceClass) => hourFromTime(danceClass.startTime))
  const firstHour = classHours.length ? Math.min(startHour, ...classHours) : startHour
  const lastHour = classHours.length ? Math.max(endHour, ...classHours) : endHour
  const hourRows = Array.from({ length: lastHour - firstHour + 1 }, (_, index) => firstHour + index)
  const selectedWeekday = selectedDate.getDay()
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
            const count = classes.filter((item) => item.weekday === date.getDay()).length
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
            <strong>{today.getFullYear()}.{String(today.getMonth() + 1).padStart(2, '0')}</strong>
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
              const dayClasses = classes
                .filter((danceClass) => danceClass.weekday === date.getDay())
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
              return (
                <button
                  type="button"
                  className={`${date.getMonth() !== today.getMonth() ? 'outside' : ''} ${
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
                  {dayClasses.slice(0, 2).map((danceClass) => (
                    <span
                      className={`eventChip chip-${classColorIndex.get(danceClass.id) ?? 0}`}
                      key={danceClass.id}
                    >
                      {danceClass.name}
                    </span>
                  ))}
                  {dayClasses.length > 2 && <i className="moreChip">+{dayClasses.length - 2}</i>}
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
          {hourRows.map((hour) => {
            const rowClasses = classes
              .filter(
                (danceClass) =>
                  danceClass.weekday === selectedWeekday &&
                  hourFromTime(danceClass.startTime) === hour,
              )
              .sort((a, b) => a.weekday - b.weekday || a.startTime.localeCompare(b.startTime))
            return (
              <article className={rowClasses.length ? 'hourRow hasClass' : 'hourRow'} key={hour}>
                <div className="hourStamp">{hour}:00</div>
                <div className="hourCards">
                  {rowClasses.map((danceClass) => (
                    <TimeClassCard
                      attendance={attendance}
                      danceClass={danceClass}
                      dateKey={selectedDateKey}
                      members={members}
                      onAssignMember={onAssignMember}
                      onSaveAttendance={onSaveAttendance}
                      key={danceClass.id}
                    />
                  ))}
                  {!rowClasses.length && <span className="noClass">수업 없음</span>}
                </div>
              </article>
            )
          })}
        </div>
      </section>

      <section className="panel">
        <h2>수업반 수정</h2>
        <div className="listStack">
          {classes.map((danceClass) => (
            <details className="classEditor" key={danceClass.id}>
              <summary>
                <span>
                  <strong>{danceClass.name}</strong>
                  <small>
                    {weekdays[danceClass.weekday]} {danceClass.startTime} ·{' '}
                    {formatCurrency(danceClass.tuitionFee)}
                  </small>
                </span>
                <Settings2 size={17} />
              </summary>
              <form
                className="formGrid compact"
                onSubmit={(event) => {
                  event.preventDefault()
                  onUpdateClass(danceClass.id, new FormData(event.currentTarget))
                }}
              >
                <Field label="수업 이름">
                  <input name="name" defaultValue={danceClass.name} />
                </Field>
                <div className="split">
                  <Field label="요일">
                    <select name="weekday" defaultValue={danceClass.weekday}>
                      {weekdays.map((day, index) => (
                        <option value={index} key={day}>
                          {day}요일
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="정원">
                    <input name="capacity" type="number" min="1" defaultValue={danceClass.capacity} />
                  </Field>
                </div>
                <div className="split">
                  <Field label="시작 시간">
                    <input name="startTime" type="time" defaultValue={danceClass.startTime} />
                  </Field>
                  <Field label="종료 시간">
                    <input name="endTime" type="time" defaultValue={danceClass.endTime} />
                  </Field>
                </div>
                <div className="split">
                  <Field label="장소">
                    <input name="location" defaultValue={danceClass.location} />
                  </Field>
                  <Field label="수강료">
                    <input name="tuitionFee" type="number" min="0" defaultValue={danceClass.tuitionFee} />
                  </Field>
                </div>
                <Field label="레벨">
                  <select name="level" defaultValue={danceClass.level}>
                    <option>입문</option>
                    <option>초급</option>
                    <option>중급</option>
                    <option>고급</option>
                    <option>전체</option>
                  </select>
                </Field>
                <button type="submit" className="secondaryButton">수정 저장</button>
                <button
                  type="button"
                  className="dangerButton"
                  onClick={() => {
                    if (
                      window.confirm(
                        `'${danceClass.name}' 수업을 삭제할까요? 배정된 회원은 수업 미지정 상태가 됩니다.`,
                      )
                    ) {
                      onRemoveClass(danceClass.id)
                    }
                  }}
                >
                  수업 삭제
                </button>
              </form>
            </details>
          ))}
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
  onSaveAttendance,
}: {
  attendance: AttendanceBook
  danceClass: DanceClass
  dateKey: string
  members: Member[]
  onAssignMember: (memberId: string, classId: string) => void
  onSaveAttendance: (
    date: string,
    classId: string,
    marks: Record<string, AttendanceStatus>,
  ) => void
}) {
  const [checking, setChecking] = useState(false)
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({})
  const [pickedMemberId, setPickedMemberId] = useState('')
  const assignedMembers = members.filter(
    (member) => member.status === 'active' && member.classIds.includes(danceClass.id),
  )
  const candidates = members.filter(
    (member) => member.status === 'active' && !member.classIds.includes(danceClass.id),
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
    setChecking(true)
  }

  function confirmChecking() {
    onSaveAttendance(dateKey, danceClass.id, draft)
    setChecking(false)
  }

  return (
    <div className="timeClassCard">
      <div className="timeClassTop">
        <div>
          <b>{weekdays[danceClass.weekday]}</b>
          <strong>{danceClass.name}</strong>
          <span>{danceClass.startTime} - {danceClass.endTime}</span>
        </div>
        <small>
          {assignedMembers.length}/{danceClass.capacity}명 · {formatCurrency(danceClass.tuitionFee)}
        </small>
      </div>

      {!checking ? (
        <button type="button" className="checkStartButton" onClick={startChecking}>
          출석 체크
          {assignedMembers.length > 0 && ` (${checkedCount}/${assignedMembers.length}명 완료)`}
        </button>
      ) : (
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
            <button type="button" className="draftCancel" onClick={() => setChecking(false)}>
              취소
            </button>
            <button type="button" className="draftConfirm" onClick={confirmChecking}>
              확인
            </button>
          </div>
        </div>
      )}

      {candidates.length > 0 && (
        <div className="assignRow">
          <select
            value={pickedMemberId}
            onChange={(event) => setPickedMemberId(event.target.value)}
            aria-label="이 수업에 배정할 회원"
          >
            <option value="">기존 회원 수강 추가…</option>
            {candidates.map((member) => (
              <option value={member.id} key={member.id}>
                {member.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pickedMemberId}
            onClick={() => {
              if (!pickedMemberId) return
              onAssignMember(pickedMemberId, danceClass.id)
              setPickedMemberId('')
            }}
          >
            추가
          </button>
        </div>
      )}
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
  query: string
  setQuery: (query: string) => void
}) {
  const [memberFilter, setMemberFilter] = useState<MemberStatus>('active')
  const [editingMemberId, setEditingMemberId] = useState<string | null>(convertedMemberId)
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
  const categories: Array<{ label: string; status: MemberStatus }> = [
    { label: '등록한 사람', status: 'active' },
    { label: '상담만 한 사람', status: 'prospect' },
    { label: '현재 대기', status: 'waitlist' },
  ]
  const filtered = members
    .filter((member) => {
      if (member.status !== memberFilter) return false
      const haystack = `${member.name} ${member.phone} ${member.level} ${member.note}`.toLowerCase()
      return haystack.includes(query.toLowerCase())
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'))

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
        <div className="memberCategoryTabs" aria-label="회원 분류">
          {categories.map((category) => {
            const count = members.filter((member) => member.status === category.status).length
            return (
              <button
                type="button"
                className={memberFilter === category.status ? 'active' : ''}
                onClick={() => setMemberFilter(category.status)}
                key={category.status}
              >
                <span>{category.label}</span>
                <b>{count}</b>
              </button>
            )
          })}
        </div>
        <div className="memberResultBar">
          <span>총 <b>{filtered.length}</b>명</span>
          <small>가나다순 정렬</small>
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
            <input name="sessionCount" type="number" min="1" defaultValue="8" />
          </Field>
        </div>
        <Field label="수강권 이름">
          <input name="name" placeholder="예: 초급 라인댄스 8회" required />
        </Field>
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
                <input name="weekdays" type="checkbox" value={index} defaultChecked={index === today.getDay()} />
                <span>{day}</span>
              </label>
            ))}
          </div>
        </div>
        {passFormType === 'private' ? (
          <Field label="수강료">
            <input name="tuitionFee" type="number" min="0" defaultValue="90000" />
          </Field>
        ) : (
          <div className="split">
            <Field label="최대 인원">
              <input name="capacity" type="number" min="1" defaultValue="12" />
            </Field>
            <Field label="수강료">
              <input name="tuitionFee" type="number" min="0" defaultValue="90000" />
            </Field>
          </div>
        )}
        {passTemplates.length > 0 && (
          <div className="field">
            <span>만든 수강권</span>
            <div className="passList">
              {passTemplates.map((pass) => (
                <div className="passListItem" key={pass.id}>
                  <span>
                    {passCategoryLabel(pass.type)} · {pass.name}
                    {pass.sessionCount > 0 && ` (${pass.sessionCount}회)`}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      if (window.confirm(`'${pass.name}' 수강권을 삭제할까요? 이미 등록된 회원에게는 영향이 없습니다.`)) {
                        onRemovePassTemplate(pass.id)
                      }
                    }}
                  >
                    삭제
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </FormDrawer>

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
                {passCategoryLabel(pass.type)} · {pass.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="split">
          <Field label="레벨">
            <select name="level" defaultValue="초급">
              <option>입문</option>
              <option>초급</option>
              <option>중급</option>
              <option>고급</option>
            </select>
          </Field>
          <Field label="총 횟수">
            <input name="remainingCredits" type="number" min="0" placeholder="수강권 선택 시 자동" />
          </Field>
        </div>
        <div className="split">
          <Field label="결제 금액">
            <input name="paidAmount" type="number" min="0" placeholder="수강권 기준 자동" />
          </Field>
          <Field label="최근 결제일">
            <input name="lastPaidAt" type="date" defaultValue={todayKey} />
          </Field>
        </div>
        <div className="split">
          <Field label="다음 결제일">
            <input name="nextPaymentDue" type="date" defaultValue={addDays(30)} />
          </Field>
          <Field label="수강 만료일">
            <input name="passUntil" type="date" defaultValue={addDays(30)} />
          </Field>
        </div>
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
            const payStatus = paymentStatusOf(member)
            const assignedClasses = classes.filter((danceClass) =>
              member.classIds.includes(danceClass.id),
            )
            return (
              <article className="memberCard memberLookupCard" key={member.id}>
                <div className="memberLookupSummary">
                  <div className="memberLookupTop">
                    <div className="memberAvatar">{member.name.slice(0, 1)}</div>
                    <div className="memberMain">
                      <strong>{member.name}</strong>
                      <a href={`tel:${member.phone}`}>
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
                    </span>
                  </div>
                  {member.status === 'active' ? (
                    <dl className="memberFacts">
                      <div>
                        <dt>잔여기간</dt>
                        <dd className={dueDays !== null && dueDays < 0 ? 'unpaid' : ''}>
                          {dueDays === null
                            ? '-'
                            : dueDays < 0
                              ? `${Math.abs(dueDays)}일 지남`
                              : `${dueDays}일 남음`}
                        </dd>
                      </div>
                      {member.totalCredits > 0 && (
                        <div>
                          <dt>잔여횟수</dt>
                          <dd>{member.remainingCredits}/{member.totalCredits}회 남음</dd>
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
                  )}
                  <button
                    type="button"
                    className="editMemberButton"
                    onClick={() => setEditingMemberId(isEditing ? null : member.id)}
                  >
                    {isEditing ? '닫기' : '수정'}
                  </button>
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
                  <div className="split">
                    <Field label="레벨">
                      <select name="level" defaultValue={member.level}>
                        <option>입문</option>
                        <option>초급</option>
                        <option>중급</option>
                        <option>고급</option>
                      </select>
                    </Field>
                    <Field label="결제 유형">
                      <select name="passType" defaultValue={member.passType}>
                        <option>월회비</option>
                        <option>10회권</option>
                        <option>기간권</option>
                        <option>상담</option>
                        <option>대기</option>
                      </select>
                    </Field>
                  </div>
                  <div className="split">
                    <Field label="총 횟수">
                      <input name="totalCredits" type="number" min="0" defaultValue={member.totalCredits} />
                    </Field>
                    <Field label="잔여 횟수">
                      <input name="remainingCredits" type="number" min="0" defaultValue={member.remainingCredits} />
                    </Field>
                  </div>
                  <div className="split">
                    <Field label="결제 금액">
                      <input name="paidAmount" type="number" min="0" defaultValue={member.paidAmount} />
                    </Field>
                    <Field label="최근 결제일">
                      <input name="lastPaidAt" type="date" defaultValue={member.lastPaidAt || todayKey} />
                    </Field>
                  </div>
                  <div className="split">
                    <Field label="다음 결제일">
                      <input name="nextPaymentDue" type="date" defaultValue={member.nextPaymentDue || addDays(30)} />
                    </Field>
                    <Field label="수강 만료일">
                      <input name="passUntil" type="date" defaultValue={member.passUntil || addDays(30)} />
                    </Field>
                  </div>
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
                  <button type="submit" className="secondaryButton">회원 정보 저장</button>
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
                    회원 삭제
                  </button>
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
      <div className="metricGrid two">
        <Metric label="상담만 한 회원" value={`${consultationMembers.length}명`} />
        <Metric label="현재 대기" value={`${waitlistMembers.length}명`} tone="warn" />
      </div>

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
        <Field label="레벨">
          <select name="level" defaultValue="입문">
            <option>입문</option>
            <option>초급</option>
            <option>중급</option>
            <option>고급</option>
          </select>
        </Field>
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
  const monthKey = todayKey.slice(0, 7)
  const memberStats = allMembers
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
                      ` · 잔여 ${member.remainingCredits}/${member.totalCredits}회`}
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
        <p className="hint storageHint">
          출석 기록은 이 기기(브라우저)에 자동 저장되어 앱을 껐다 켜도 유지됩니다.
        </p>
        <div className="listStack">
          {memberStats.map(({ absent, lastPresent, member, monthPresent, present, records }) => {
            const usedCredits = Math.max(0, member.totalCredits - member.remainingCredits)
            const passDays = daysUntil(member.passUntil)
            return (
              <article className="memberStatRow" key={member.id}>
                <div className="taskAvatar">{member.name.slice(0, 1)}</div>
                <div className="statBody">
                  <strong>{member.name}</strong>
                  <span>
                    {member.passType}
                    {member.totalCredits > 0
                      ? <> · 잔여 <b>{member.remainingCredits}/{member.totalCredits}회</b></>
                      : passDays !== null
                        ? <> · 만료까지 <b>{passDays < 0 ? `${Math.abs(passDays)}일 지남` : `${passDays}일`}</b></>
                        : null}
                  </span>
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
                  <b className="danger">결석 {absent} (차감 없음)</b>
                  <b>이번 달 {monthPresent}회</b>
                  <b>{lastPresent ? `최근 출석 ${lastPresent.slice(5).replace('-', '/')}` : '출석 기록 없음'}</b>
                </div>
                {records.length > 0 && (
                  <details className="historyDetails">
                    <summary>날짜별 이력 보기 ({records.length}건)</summary>
                    <ul>
                      {records.slice(0, 12).map((record) => (
                        <li key={`${record.date}-${record.classId}`}>
                          <span>{record.date}</span>
                          <em>
                            {classes.find((danceClass) => danceClass.id === record.classId)
                              ?.name ?? '삭제된 수업'}
                          </em>
                          <b className={`state-${record.status}`}>
                            {attendanceLabel(record.status)}
                          </b>
                        </li>
                      ))}
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
  members,
  onQuickRenew,
  updatePayment,
}: {
  classes: DanceClass[]
  members: Member[]
  onQuickRenew: (memberId: string) => void
  updatePayment: (memberId: string, formData: FormData) => void
}) {
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all')
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
        <p>이번 달 수납액</p>
        <strong>{formatCurrency(monthTotal)}</strong>
        <span>지난달 {formatCurrency(lastMonthTotal)}</span>
        <span>완납 {counts.paid} · 임박 {counts.soon} · 미납 {counts.unpaid}</span>
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
            return (
              <article className="paymentCard" key={member.id}>
                <div className="paymentHead">
                  <div>
                    <strong>{member.name}</strong>
                    <span>{assignedNames.length ? assignedNames.join(' · ') : '수업 미지정'} · {member.passType}</span>
                  </div>
                  <b className={payStatus}>{paymentLabel(payStatus)}</b>
                </div>
                <div className="paymentSummary">
                  {member.totalCredits > 0 ? (
                    <span>
                      남은 횟수 <b>{member.remainingCredits}/{member.totalCredits}회</b>
                    </span>
                  ) : (
                    <span>
                      잔여기간{' '}
                      <b>
                        {(() => {
                          const days = daysUntil(member.nextPaymentDue || member.passUntil)
                          if (days === null) return '-'
                          return days < 0 ? `${Math.abs(days)}일 지남` : `${days}일 남음`
                        })()}
                      </b>
                    </span>
                  )}
                  <span>결제 금액 <b>{formatCurrency(member.paidAmount)}</b></span>
                  <span>최근 결제 <b>{member.lastPaidAt || '-'}</b></span>
                  <span>다음 결제 <b>{member.nextPaymentDue || '-'}</b></span>
                </div>
                <button
                  type="button"
                  className={payStatus === 'paid' ? 'renewButton subtle' : 'renewButton'}
                  onClick={() => {
                    if (
                      window.confirm(
                        `${member.name}님 재결제 처리할까요?\n· 결제일: 오늘\n· 다음 결제: 30일 뒤${
                          member.totalCredits > 0
                            ? `\n· 잔여횟수: ${member.totalCredits}회로 초기화`
                            : ''
                        }`,
                      )
                    ) {
                      onQuickRenew(member.id)
                    }
                  }}
                >
                  재결제 받음 (완납 처리)
                </button>
                <details className="paymentEditor">
                  <summary>결제 정보 수정</summary>
                  <form
                    className="paymentForm"
                    onSubmit={(event) => {
                      event.preventDefault()
                      updatePayment(member.id, new FormData(event.currentTarget))
                    }}
                  >
                    <Field label="결제 유형">
                      <select name="passType" defaultValue={member.passType}>
                        <option>월회비</option>
                        <option>10회권</option>
                        <option>기간권</option>
                      </select>
                    </Field>
                    <Field label="총 횟수">
                      <input name="totalCredits" type="number" min="0" defaultValue={member.totalCredits} />
                    </Field>
                    <Field label="잔여 횟수">
                      <input name="remainingCredits" type="number" min="0" defaultValue={member.remainingCredits} />
                    </Field>
                    <Field label="결제 금액">
                      <input name="paidAmount" type="number" min="0" defaultValue={member.paidAmount} />
                    </Field>
                    <Field label="최근 결제일">
                      <input name="lastPaidAt" type="date" defaultValue={member.lastPaidAt || todayKey} />
                    </Field>
                    <Field label="다음 결제일">
                      <input name="nextPaymentDue" type="date" defaultValue={member.nextPaymentDue || addDays(30)} />
                    </Field>
                    <Field label="수강 만료일">
                      <input name="passUntil" type="date" defaultValue={member.passUntil} />
                    </Field>
                    <button type="submit">저장</button>
                  </form>
                </details>
              </article>
            )
          })}
          {!visibleMembers.length && <p className="emptyText">해당 상태의 회원이 없습니다.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>최근 수납 내역</h2>
        <p className="hint storageHint">
          재결제 처리하거나 결제 정보의 최근 결제일을 바꾸면 자동으로 기록됩니다.
        </p>
        <div className="listStack">
          {allPayments.slice(0, 10).map((payment) => (
            <div className="paymentLogRow" key={`${payment.date}-${payment.memberName}-${payment.amount}`}>
              <span className="paymentLogDate">{payment.date.slice(5).replace('-', '/')}</span>
              <strong>{payment.memberName}</strong>
              <b>{formatCurrency(payment.amount)}</b>
            </div>
          ))}
          {!allPayments.length && <p className="emptyText">아직 수납 기록이 없습니다.</p>}
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

function Field({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  )
}

function Metric({
  label,
  onClick,
  tone,
  value,
}: {
  label: string
  onClick?: () => void
  tone?: 'danger' | 'warn'
  value: string
}) {
  return (
    <button type="button" className={`metric ${tone ?? ''}`} onClick={onClick}>
      <span>{label}</span>
      <strong>{value}</strong>
      {onClick && <ChevronRight size={15} className="metricArrow" />}
    </button>
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

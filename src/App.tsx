import {
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Home,
  Phone,
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

type Member = {
  id: string
  name: string
  phone: string
  level: string
  status: MemberStatus
  classIds: string[]
  passType: string
  remainingCredits: number
  paidAmount: number
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
    paidAmount: 90000,
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
    paidAmount: 120000,
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
    paidAmount: 0,
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
    paidAmount: 0,
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
    paidAmount: 0,
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
  return date.toISOString().slice(0, 10)
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
  return Math.max(
    0,
    Math.ceil((new Date(dateKey).getTime() - today.getTime()) / 86400000),
  )
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
        members?: Member[]
        classes?: DanceClass[]
        passTemplates?: PassTemplate[]
        attendance?: AttendanceBook
      }
      if (saved.members?.length) setMembers(saved.members)
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

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [tab])

  const activeMembers = members.filter((member) => member.status === 'active')
  const consultationMembers = members.filter((member) => member.status === 'prospect')
  const waitlistMembers = members.filter((member) => member.status === 'waitlist')
  const todayClasses = classes.filter((item) => item.weekday === today.getDay())
  const unpaidMembers = activeMembers.filter((member) => member.paymentStatus === 'unpaid')
  const expiringMembers = activeMembers.filter((member) => {
    const dueDate = new Date(member.nextPaymentDue || member.passUntil)
    const daysLeft = Math.ceil((dueDate.getTime() - today.getTime()) / 86400000)
    return daysLeft <= 10
  })
  const selectedClass = classes.find((item) => item.id === selectedClassId)
  const classMembers = selectedClass
    ? activeMembers.filter((member) => member.classIds.includes(selectedClass.id))
    : []

  function addMember(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    const passTemplateId = String(formData.get('passTemplateId') ?? '')
    const selectedPass = passTemplates.find((pass) => pass.id === passTemplateId)
    const classId = String(formData.get('classId') ?? '')
    const customClassName = String(formData.get('customClassName') ?? '').trim()
    const customClassId = customClassName ? makeId('class') : ''
    const assignedClassIds = selectedPass?.classIds.length
      ? selectedPass.classIds
      : [customClassId || classId].filter(Boolean)
    const chosenClass = classes.find((item) => item.id === classId)
    if (!name || !phone || !assignedClassIds.length) return

    if (customClassName) {
      setClasses((current) => [
        {
          id: customClassId,
          name: customClassName,
          weekday: today.getDay(),
          startTime: '10:00',
          endTime: '10:50',
          location: '스튜디오',
          capacity: 12,
          tuitionFee: Number(formData.get('paidAmount') ?? 0),
          level: String(formData.get('level') ?? '초급'),
        },
        ...current,
      ])
    }

    setMembers((current) => [
      {
        id: makeId('member'),
        name,
        phone,
        level: String(formData.get('level') ?? chosenClass?.level ?? '초급'),
        status: 'active',
        classIds: assignedClassIds,
        passType: selectedPass?.name ?? String(formData.get('passType') ?? '월회비'),
        remainingCredits: Number(
          formData.get('remainingCredits') || selectedPass?.sessionCount || 0,
        ),
        paidAmount: Number(
          formData.get('paidAmount') || selectedPass?.tuitionFee || chosenClass?.tuitionFee || 0,
        ),
        lastPaidAt: String(formData.get('lastPaidAt') ?? todayKey),
        nextPaymentDue: String(formData.get('nextPaymentDue') ?? addDays(30)),
        passUntil: String(formData.get('passUntil') ?? addDays(30)),
        paymentStatus: 'paid',
        note: String(formData.get('note') ?? ''),
      },
      ...current,
    ])
  }

  function addPassTemplate(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return

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
  }

  function updateMember(memberId: string, formData: FormData) {
    const classId = String(formData.get('classId') ?? '')
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              name: String(formData.get('name') ?? member.name),
              phone: String(formData.get('phone') ?? member.phone),
              level: String(formData.get('level') ?? member.level),
              status: String(formData.get('status') ?? member.status) as MemberStatus,
              classIds: classId ? [classId] : member.classIds,
              passType: String(formData.get('passType') ?? member.passType),
              remainingCredits: Number(
                formData.get('remainingCredits') ?? member.remainingCredits,
              ),
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
  }

  function addConsultation(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    const phone = String(formData.get('phone') ?? '').trim()
    if (!name || !phone) return

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
        paidAmount: 0,
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
  }

  function addClass(formData: FormData) {
    const name = String(formData.get('name') ?? '').trim()
    if (!name) return
    setClasses((current) => [
      {
        id: makeId('class'),
        name,
        weekday: Number(formData.get('weekday') ?? 1),
        startTime: String(formData.get('startTime') ?? '10:00'),
        endTime: String(formData.get('endTime') ?? '10:50'),
        location: String(formData.get('location') ?? '스튜디오'),
        capacity: Number(formData.get('capacity') ?? 12),
        tuitionFee: Number(formData.get('tuitionFee') ?? 0),
        level: String(formData.get('level') ?? '초급'),
      },
      ...current,
    ])
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
  }

  function markAttendance(
    date: string,
    classId: string,
    memberId: string,
    status: AttendanceStatus,
  ) {
    setAttendance((current) => ({
      ...current,
      [attendanceKey(date, classId, memberId)]: status,
    }))
  }

  function setAttendanceStatus(memberId: string, status: AttendanceStatus) {
    if (!selectedClass) return
    markAttendance(attendanceDate, selectedClass.id, memberId, status)
  }

  function updatePayment(memberId: string, formData: FormData) {
    setMembers((current) =>
      current.map((member) =>
        member.id === memberId
          ? {
              ...member,
              paymentStatus: String(
                formData.get('paymentStatus') ?? member.paymentStatus,
              ) as PaymentStatus,
              passType: String(formData.get('passType') ?? member.passType),
              remainingCredits: Number(
                formData.get('remainingCredits') ?? member.remainingCredits,
              ),
              paidAmount: Number(formData.get('paidAmount') ?? member.paidAmount),
              lastPaidAt: String(formData.get('lastPaidAt') ?? member.lastPaidAt),
              nextPaymentDue: String(
                formData.get('nextPaymentDue') ?? member.nextPaymentDue,
              ),
              passUntil: String(formData.get('passUntil') ?? member.passUntil),
            }
          : member,
      ),
    )
  }

  return (
    <main className={`appShell tab-${tab}`}>
      <header className="topBar">
        <div>
          <span className="eyebrow">Line Dance Admin</span>
          <h1>강사용 운영관리</h1>
        </div>
        <div className="datePill">{todayKey}</div>
      </header>

      {tab === 'home' && (
        <HomeView
          activeCount={activeMembers.length}
          consultationCount={consultationMembers.length}
          expiringMembers={expiringMembers}
          members={members}
          setTab={setTab}
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
          onAddClass={addClass}
          onMarkAttendance={markAttendance}
          onUpdateClass={updateClass}
        />
      )}
      {tab === 'members' && (
        <MembersView
          attendance={attendance}
          classes={classes}
          members={members}
          passTemplates={passTemplates}
          onAddMember={addMember}
          onAddPassTemplate={addPassTemplate}
          onUpdateMember={updateMember}
          query={query}
          setQuery={setQuery}
        />
      )}
      {tab === 'consultations' && (
        <ConsultationsView
          consultationMembers={consultationMembers}
          onAddConsultation={addConsultation}
          waitlistMembers={waitlistMembers}
        />
      )}
      {tab === 'attendance' && (
        <AttendanceView
          attendance={attendance}
          attendanceDate={attendanceDate}
          classMembers={classMembers}
          classes={classes}
          selectedClass={selectedClass}
          selectedClassId={selectedClassId}
          setAttendanceDate={setAttendanceDate}
          setAttendanceStatus={setAttendanceStatus}
          setSelectedClassId={setSelectedClassId}
        />
      )}
      {tab === 'payments' && (
        <PaymentsView classes={classes} members={activeMembers} updatePayment={updatePayment} />
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
  consultationCount,
  expiringMembers,
  members,
  setTab,
  todayClasses,
  unpaidMembers,
  waitlistCount,
}: {
  activeCount: number
  consultationCount: number
  expiringMembers: Member[]
  members: Member[]
  setTab: (tab: Tab) => void
  todayClasses: DanceClass[]
  unpaidMembers: Member[]
  waitlistCount: number
}) {
  return (
    <section className="screen">
      <section className="heroBand">
        <div>
          <p>오늘 수업</p>
          <strong>{todayClasses.length}개</strong>
          <span>10시 이후 일정만 집중해서 관리</span>
        </div>
        <button type="button" onClick={() => setTab('schedule')}>
          시간표 보기
        </button>
      </section>

      <div className="metricGrid">
        <Metric label="등록 회원" value={`${activeCount}명`} />
        <Metric label="상담만 한 회원" value={`${consultationCount}명`} />
        <Metric label="현재 대기" value={`${waitlistCount}명`} tone="warn" />
        <Metric label="미납" value={`${unpaidMembers.length}명`} tone="danger" />
      </div>

      <section className="panel">
        <h2>오늘 해야 할 수업</h2>
        <div className="listStack">
          {todayClasses.map((danceClass) => {
            const assigned = members.filter((member) =>
              member.classIds.includes(danceClass.id),
            ).length
            return (
              <article className="rowItem" key={danceClass.id}>
                <div>
                  <strong>{danceClass.name}</strong>
                  <span>{danceClass.startTime} - {danceClass.endTime}</span>
                  <small>{danceClass.location}</small>
                </div>
                <b>{assigned}/{danceClass.capacity}</b>
              </article>
            )
          })}
          {!todayClasses.length && <p className="emptyText">오늘 등록된 수업이 없습니다.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>우선 확인</h2>
        <div className="alertList">
          {unpaidMembers.map((member) => (
            <span className="alertChip danger" key={member.id}>
              {member.name} 미납
            </span>
          ))}
          {expiringMembers.map((member) => (
            <span className="alertChip warn" key={member.id}>
              {member.name} 다음 결제 {member.nextPaymentDue || member.passUntil}
            </span>
          ))}
          {!unpaidMembers.length && !expiringMembers.length && (
            <p className="emptyText">긴급 확인 항목이 없습니다.</p>
          )}
        </div>
      </section>
    </section>
  )
}

function ScheduleView({
  attendance,
  classes,
  members,
  onAddClass,
  onMarkAttendance,
  onUpdateClass,
}: {
  attendance: AttendanceBook
  classes: DanceClass[]
  members: Member[]
  onAddClass: (formData: FormData) => void
  onMarkAttendance: (
    date: string,
    classId: string,
    memberId: string,
    status: AttendanceStatus,
  ) => void
  onUpdateClass: (classId: string, formData: FormData) => void
}) {
  const weekDates = getWeekDates(today)
  const monthDates = getMonthDates(today)
  const [selectedWeekday, setSelectedWeekday] = useState(today.getDay())
  const hourRows = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
  const selectedDate = weekDates.find((date) => date.getDay() === selectedWeekday) ?? today

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
            const isSelected = selectedWeekday === date.getDay()
            return (
              <button
                type="button"
                className={`${toDateKey(date) === todayKey ? 'today' : ''} ${
                  isSelected ? 'selected' : ''
                }`}
                onClick={() => setSelectedWeekday(date.getDay())}
                key={toDateKey(date)}
              >
                <strong>{weekdays[date.getDay()]}</strong>
                <span>{formatMonthDay(date)}</span>
                <b>{count}</b>
              </button>
            )
          })}
        </div>

        <div className="timelineTitle">
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
{rowClasses.map((danceClass) => {
                    const selectedDateKey = toDateKey(selectedDate)
                    const assignedMembers = members.filter(
                      (member) =>
                        member.status === 'active' &&
                        member.classIds.includes(danceClass.id),
                    )
                    return (
                      <div className="timeClassCard" key={danceClass.id}>
                        <div>
                          <b>{weekdays[danceClass.weekday]}</b>
                          <strong>{danceClass.name}</strong>
                          <span>{danceClass.startTime} - {danceClass.endTime}</span>
                        </div>
                        <small>
                          {assignedMembers.length}/{danceClass.capacity}명 · {formatCurrency(danceClass.tuitionFee)}
                        </small>
                        <div className="scheduleRoster">
                          {assignedMembers.map((member) => {
                            const status =
                              attendance[
                                attendanceKey(selectedDateKey, danceClass.id, member.id)
                              ]
                            return (
                              <button
                                type="button"
                                className={status === 'present' ? 'present' : ''}
                                onClick={() =>
                                  onMarkAttendance(
                                    selectedDateKey,
                                    danceClass.id,
                                    member.id,
                                    'present',
                                  )
                                }
                                key={member.id}
                              >
                                <span>{member.name}</span>
                                <b>{status === 'present' ? '출석완료' : '출석체크'}</b>
                              </button>
                            )
                          })}
                          {!assignedMembers.length && <em>배정된 회원 없음</em>}
                        </div>
                      </div>
                    )
                  })}
                  {!rowClasses.length && <span className="noClass">수업 없음</span>}
                </div>
              </article>
            )
          })}
        </div>
        <div className="monthCalendar">
          <div className="monthCalendarHead">
            <strong>{today.getFullYear()}.{String(today.getMonth() + 1).padStart(2, '0')}</strong>
            <span>{weekdays[selectedWeekday]}요일 선택됨</span>
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
                  } ${date.getDay() === selectedWeekday ? 'selected' : ''}`}
                  onClick={() => setSelectedWeekday(date.getDay())}
                  key={dateKey}
                >
                  <b>{date.getDate()}</b>
                  {dayClasses.slice(0, 2).map((danceClass) => (
                    <span key={danceClass.id}>{danceClass.startTime}</span>
                  ))}
                </button>
              )
            })}
          </div>
        </div>
      </section>

      <FormPanel title="수업반 추가" action={onAddClass}>
        <input name="name" placeholder="예: 초급 라인댄스" required />
        <div className="split">
          <select name="weekday" defaultValue={today.getDay()}>
            {weekdays.map((day, index) => (
              <option value={index} key={day}>
                {day}요일
              </option>
            ))}
          </select>
          <input name="capacity" type="number" min="1" defaultValue="12" aria-label="정원" />
        </div>
        <div className="split">
          <input name="startTime" type="time" defaultValue="10:00" />
          <input name="endTime" type="time" defaultValue="10:50" />
        </div>
        <div className="split">
          <input name="location" placeholder="장소" defaultValue="스튜디오" />
          <input name="tuitionFee" type="number" min="0" defaultValue="90000" aria-label="수강료" />
        </div>
        <select name="level" defaultValue="초급">
          <option>입문</option>
          <option>초급</option>
          <option>중급</option>
          <option>고급</option>
          <option>전체</option>
        </select>
      </FormPanel>

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
                <input name="name" defaultValue={danceClass.name} />
                <div className="split">
                  <select name="weekday" defaultValue={danceClass.weekday}>
                    {weekdays.map((day, index) => (
                      <option value={index} key={day}>
                        {day}요일
                      </option>
                    ))}
                  </select>
                  <input name="capacity" type="number" min="1" defaultValue={danceClass.capacity} />
                </div>
                <div className="split">
                  <input name="startTime" type="time" defaultValue={danceClass.startTime} />
                  <input name="endTime" type="time" defaultValue={danceClass.endTime} />
                </div>
                <div className="split">
                  <input name="location" defaultValue={danceClass.location} />
                  <input name="tuitionFee" type="number" min="0" defaultValue={danceClass.tuitionFee} />
                </div>
                <select name="level" defaultValue={danceClass.level}>
                  <option>입문</option>
                  <option>초급</option>
                  <option>중급</option>
                  <option>고급</option>
                  <option>전체</option>
                </select>
                <button type="submit" className="secondaryButton">수정 저장</button>
              </form>
            </details>
          ))}
        </div>
      </section>
    </section>
  )
}

function MembersView({
  attendance,
  classes,
  members,
  passTemplates,
  onAddMember,
  onAddPassTemplate,
  onUpdateMember,
  query,
  setQuery,
}: {
  attendance: AttendanceBook
  classes: DanceClass[]
  members: Member[]
  passTemplates: PassTemplate[]
  onAddMember: (formData: FormData) => void
  onAddPassTemplate: (formData: FormData) => void
  onUpdateMember: (memberId: string, formData: FormData) => void
  query: string
  setQuery: (query: string) => void
}) {
  const [memberFilter, setMemberFilter] = useState<MemberStatus>('active')
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null)
  const categories: Array<{ label: string; status: MemberStatus }> = [
    { label: '등록한 사람', status: 'active' },
    { label: '상담만 한 사람', status: 'prospect' },
    { label: '현재 대기', status: 'waitlist' },
  ]
  const filtered = members.filter((member) => {
    if (member.status !== memberFilter) return false
    const haystack = `${member.name} ${member.phone} ${member.level}`.toLowerCase()
    return haystack.includes(query.toLowerCase())
  })

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
        <div className="memberFilterChips">
          <span className="filterBadge">조건 1</span>
          <button type="button">이용회원 {members.filter((member) => member.status === 'active').length}</button>
          <button type="button">수강권 전체</button>
          <button type="button">레벨 전체</button>
        </div>
        <div className="memberResultBar">
          <span>총 <b>{filtered.length}</b>명</span>
          <button type="button">이름 오름차순</button>
        </div>
      </section>

      <details className="passBuilder">
        <summary>
          <span>
            <strong>수강권 만들기</strong>
            <small>라인댄스 단체반 / 라틴댄스 단체반 / 개인레슨으로 수강권을 세분화</small>
          </span>
          <Plus size={18} />
        </summary>
        <form
          className="formGrid"
          onSubmit={(event) => {
            event.preventDefault()
            onAddPassTemplate(new FormData(event.currentTarget))
            event.currentTarget.reset()
          }}
        >
          <div className="split">
            <select name="type" defaultValue="line_group">
              <option value="line_group">라인댄스 단체반</option>
              <option value="latin_group">라틴댄스 단체반</option>
              <option value="private">개인레슨</option>
            </select>
            <input name="sessionCount" type="number" min="1" defaultValue="8" aria-label="수업 횟수" />
          </div>
          <input name="name" placeholder="수강권 / 수업 이름 예: 초급 라인댄스 8회" required />
          <div className="split">
            <input name="startTime" type="time" defaultValue="10:00" />
            <input name="endTime" type="time" defaultValue="10:50" />
          </div>
          <div className="weekdayPicker" aria-label="매주 수업 요일">
            {weekdays.map((day, index) => (
              <label key={day}>
                <input name="weekdays" type="checkbox" value={index} defaultChecked={index === today.getDay()} />
                <span>{day}</span>
              </label>
            ))}
          </div>
          <div className="split">
            <input name="capacity" type="number" min="1" defaultValue="12" aria-label="최대 인원" />
            <input name="tuitionFee" type="number" min="0" defaultValue="90000" aria-label="수강료" />
          </div>
          <select name="level" defaultValue="초급">
            <option>입문</option>
            <option>초급</option>
            <option>중급</option>
            <option>고급</option>
            <option>전체</option>
          </select>
          <button type="submit" className="secondaryButton">수강권 저장</button>
        </form>
      </details>

      <FormPanel title="등록 회원 추가" action={onAddMember}>
        <input name="name" placeholder="회원 이름" required />
        <input name="phone" placeholder="010-0000-0000" required />
        <select name="passTemplateId" defaultValue="">
          <option value="">수강권 선택 없이 직접 등록</option>
          {passTemplates.map((pass) => (
            <option value={pass.id} key={pass.id}>
              {passCategoryLabel(pass.type)} · {pass.name}
            </option>
          ))}
        </select>
        <div className="split">
          <select name="classId" defaultValue={classes[0]?.id ?? ''}>
            {classes.map((danceClass) => (
              <option value={danceClass.id} key={danceClass.id}>
                {danceClass.name}
              </option>
            ))}
          </select>
          <select name="level" defaultValue="초급">
            <option>입문</option>
            <option>초급</option>
            <option>중급</option>
            <option>고급</option>
          </select>
        </div>
        <input
          name="customClassName"
          placeholder="새 강의명 직접 입력 예: 야간 초급 라인댄스"
        />
        <div className="split">
          <select name="passType" defaultValue="월회비">
            <option>월회비</option>
            <option>10회권</option>
            <option>기간권</option>
          </select>
          <input name="remainingCredits" type="number" min="0" defaultValue="0" aria-label="잔여 횟수" />
        </div>
        <div className="split">
          <input name="paidAmount" type="number" min="0" defaultValue="90000" aria-label="결제 금액" />
          <input name="lastPaidAt" type="date" defaultValue={todayKey} aria-label="최근 결제일" />
        </div>
        <div className="split">
          <input name="nextPaymentDue" type="date" defaultValue={addDays(30)} aria-label="다음 결제일" />
          <input name="passUntil" type="date" defaultValue={addDays(30)} aria-label="수강 만료일" />
        </div>
        <input name="note" placeholder="메모" />
      </FormPanel>

      <section className="panel">
        <h2>회원 목록</h2>
        <div className="listStack">
          {filtered.map((member) => {
            const primaryClass = classes.find((danceClass) =>
              member.classIds.includes(danceClass.id),
            )
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
            const isEditing = editingMemberId === member.id
            return (
              <article className="memberCard memberLookupCard" key={member.id}>
                <div className="memberLookupSummary">
                  <div className="memberLookupTop">
                    <div className="memberAvatar">{member.name.slice(0, 1)}</div>
                    <div className="memberMain">
                      <strong>{member.name}</strong>
                      <span>
                        <Phone size={14} /> {member.phone}
                      </span>
                    </div>
                    <b className={`memberBadge status-${member.status}`}>
                      {memberStatusLabel(member.status)}
                    </b>
                  </div>
                  <div className="passBlock">
                    <strong>{primaryClass?.name ?? member.interest ?? '수업 미지정'}</strong>
                    <span>{member.lastPaidAt || todayKey} ~ {member.passUntil || '-'}</span>
                  </div>
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
                  <div className="memberLookupStats">
                    <span>잔여기간</span>
                    <b>{dueDays === null ? '-' : `${dueDays}일 남음`}</b>
                    <span>잔여횟수</span>
                    <b>{member.remainingCredits}회 남음</b>
                    <span>결제금액</span>
                    <b>{formatCurrency(member.paidAmount)}</b>
                    <span>다음 결제</span>
                    <b>{member.nextPaymentDue || '-'}</b>
                    <span>출석현황</span>
                    <b>
                      출석 {attendanceSummary.present} · 결석 {attendanceSummary.absent} · 보강{' '}
                      {attendanceSummary.makeup}
                    </b>
                  </div>
                  <div className="memberLookupFoot">
                    <span>{member.note || '상담/진행 메모 없음'}</span>
                    {member.status === 'active' && (
                      <b className={member.paymentStatus}>{paymentLabel(member.paymentStatus)}</b>
                    )}
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
                  <input name="name" defaultValue={member.name} aria-label="회원 이름" />
                  <input name="phone" defaultValue={member.phone} aria-label="전화번호" />
                  <div className="split">
                    <select name="status" defaultValue={member.status}>
                      <option value="active">등록한 사람</option>
                      <option value="prospect">상담만 한 사람</option>
                      <option value="waitlist">현재 대기</option>
                    </select>
                    <select name="classId" defaultValue={member.classIds[0] ?? ''}>
                      <option value="">수업 미지정</option>
                      {classes.map((danceClass) => (
                        <option value={danceClass.id} key={danceClass.id}>
                          {danceClass.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="split">
                    <select name="level" defaultValue={member.level}>
                      <option>입문</option>
                      <option>초급</option>
                      <option>중급</option>
                      <option>고급</option>
                    </select>
                    <select name="passType" defaultValue={member.passType}>
                      <option>월회비</option>
                      <option>10회권</option>
                      <option>기간권</option>
                      <option>상담</option>
                      <option>대기</option>
                    </select>
                  </div>
                  <div className="split">
                    <input name="remainingCredits" type="number" min="0" defaultValue={member.remainingCredits} />
                    <input name="paidAmount" type="number" min="0" defaultValue={member.paidAmount} />
                  </div>
                  <div className="split">
                    <input name="lastPaidAt" type="date" defaultValue={member.lastPaidAt || todayKey} />
                    <input name="nextPaymentDue" type="date" defaultValue={member.nextPaymentDue || addDays(30)} />
                  </div>
                  <input name="passUntil" type="date" defaultValue={member.passUntil || addDays(30)} />
                  <input name="interest" defaultValue={member.interest ?? ''} placeholder="관심 수업 / 상담 주제" />
                  <textarea
                    name="note"
                    defaultValue={member.note}
                    placeholder="상담 진행 메모, 연락 이력, 특이사항"
                    rows={4}
                  />
                  <button type="submit" className="secondaryButton">회원 정보 저장</button>
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
}: {
  consultationMembers: Member[]
  waitlistMembers: Member[]
  onAddConsultation: (formData: FormData) => void
}) {
  const followUpMembers = [...consultationMembers, ...waitlistMembers].sort((a, b) =>
    (b.consultedAt ?? '').localeCompare(a.consultedAt ?? ''),
  )

  return (
    <section className="screen">
      <FormPanel title="상담 등록" action={onAddConsultation}>
        <input name="name" placeholder="상담 회원 이름" required />
        <input name="phone" placeholder="010-0000-0000" required />
        <div className="split">
          <input name="consultedAt" type="date" defaultValue={todayKey} />
          <select name="status" defaultValue="prospect">
            <option value="prospect">상담만 한 사람</option>
            <option value="waitlist">현재 대기</option>
          </select>
        </div>
        <select name="level" defaultValue="입문">
          <option>입문</option>
          <option>초급</option>
          <option>중급</option>
          <option>고급</option>
        </select>
        <input name="interest" placeholder="관심 수업 예: 오전 초급반" />
        <input name="note" placeholder="상담 내역 메모" />
      </FormPanel>

      <section className="panel">
        <h2>상담 내역</h2>
        <div className="listStack">
          {followUpMembers.map((member) => (
            <article className="consultCard" key={member.id}>
              <div className="consultHead">
                <div>
                  <strong>{member.name}</strong>
                  <span>
                    <Phone size={14} /> {member.phone}
                  </span>
                </div>
                <b className={`status-${member.status}`}>{memberStatusLabel(member.status)}</b>
              </div>
              <div className="consultBody">
                <span>{member.consultedAt ?? '상담일 없음'} · {member.interest || '관심 수업 미정'}</span>
                <p>{member.note || '상담 메모 없음'}</p>
              </div>
            </article>
          ))}
          {!followUpMembers.length && <p className="emptyText">등록된 상담 내역이 없습니다.</p>}
        </div>
      </section>
    </section>
  )
}

function AttendanceView({
  attendance,
  attendanceDate,
  classMembers,
  classes,
  selectedClass,
  selectedClassId,
  setAttendanceDate,
  setAttendanceStatus,
  setSelectedClassId,
}: {
  attendance: AttendanceBook
  attendanceDate: string
  classMembers: Member[]
  classes: DanceClass[]
  selectedClass: DanceClass | undefined
  selectedClassId: string
  setAttendanceDate: (date: string) => void
  setAttendanceStatus: (memberId: string, status: AttendanceStatus) => void
  setSelectedClassId: (classId: string) => void
}) {
  return (
    <section className="screen">
      <section className="panel">
        <h2>출석 체크</h2>
        <div className="split">
          <input
            type="date"
            value={attendanceDate}
            onChange={(event) => setAttendanceDate(event.target.value)}
          />
          <select value={selectedClassId} onChange={(event) => setSelectedClassId(event.target.value)}>
            {classes.map((danceClass) => (
              <option value={danceClass.id} key={danceClass.id}>
                {danceClass.name}
              </option>
            ))}
          </select>
        </div>
        {selectedClass && (
          <p className="hint">
            {weekdays[selectedClass.weekday]} {selectedClass.startTime} · {selectedClass.location}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>수강 회원</h2>
        <div className="listStack">
          {classMembers.map((member) => {
            const status = attendance[attendanceKey(attendanceDate, selectedClassId, member.id)]
            return (
              <article className="attendanceRow" key={member.id}>
                <div>
                  <strong>{member.name}</strong>
                  <span>{status ? attendanceLabel(status) : '미체크'}</span>
                </div>
                <div className="segmented">
                  <button
                    type="button"
                    className={status === 'present' ? 'active' : ''}
                    onClick={() => setAttendanceStatus(member.id, 'present')}
                  >
                    출석
                  </button>
                  <button
                    type="button"
                    className={status === 'absent' ? 'active' : ''}
                    onClick={() => setAttendanceStatus(member.id, 'absent')}
                  >
                    결석
                  </button>
                  <button
                    type="button"
                    className={status === 'makeup' ? 'active' : ''}
                    onClick={() => setAttendanceStatus(member.id, 'makeup')}
                  >
                    보강
                  </button>
                </div>
              </article>
            )
          })}
          {!classMembers.length && <p className="emptyText">이 수업반에 배정된 회원이 없습니다.</p>}
        </div>
      </section>
    </section>
  )
}

function PaymentsView({
  classes,
  members,
  updatePayment,
}: {
  classes: DanceClass[]
  members: Member[]
  updatePayment: (memberId: string, formData: FormData) => void
}) {
  return (
    <section className="screen">
      <section className="panel">
        <h2>결제와 수강권</h2>
        <div className="listStack">
          {members.map((member) => {
            const className =
              classes.find((danceClass) => member.classIds.includes(danceClass.id))?.name ??
              '수업 미지정'
            return (
              <article className="paymentCard" key={member.id}>
                <div className="paymentHead">
                  <div>
                    <strong>{member.name}</strong>
                    <span>{className} · {member.passType}</span>
                  </div>
                  <b className={member.paymentStatus}>{paymentLabel(member.paymentStatus)}</b>
                </div>
                <div className="paymentSummary">
                  <span>남은 횟수 <b>{member.remainingCredits}회</b></span>
                  <span>결제 금액 <b>{formatCurrency(member.paidAmount)}</b></span>
                  <span>최근 결제 <b>{member.lastPaidAt || '-'}</b></span>
                  <span>다음 결제 <b>{member.nextPaymentDue || '-'}</b></span>
                </div>
                <form
                  className="paymentForm"
                  onSubmit={(event) => {
                    event.preventDefault()
                    updatePayment(member.id, new FormData(event.currentTarget))
                  }}
                >
                  <select name="paymentStatus" defaultValue={member.paymentStatus}>
                    <option value="paid">완납</option>
                    <option value="soon">만료 임박</option>
                    <option value="unpaid">미납</option>
                  </select>
                  <select name="passType" defaultValue={member.passType}>
                    <option>월회비</option>
                    <option>10회권</option>
                    <option>기간권</option>
                  </select>
                  <input name="remainingCredits" type="number" min="0" defaultValue={member.remainingCredits} />
                  <input name="paidAmount" type="number" min="0" defaultValue={member.paidAmount} />
                  <input name="lastPaidAt" type="date" defaultValue={member.lastPaidAt || todayKey} />
                  <input name="nextPaymentDue" type="date" defaultValue={member.nextPaymentDue || addDays(30)} />
                  <input name="passUntil" type="date" defaultValue={member.passUntil} />
                  <button type="submit">저장</button>
                </form>
              </article>
            )
          })}
        </div>
      </section>
    </section>
  )
}

function FormPanel({
  action,
  children,
  title,
}: {
  action: (formData: FormData) => void
  children: React.ReactNode
  title: string
}) {
  return (
    <section className="panel">
      <h2>{title}</h2>
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
          추가
        </button>
      </form>
    </section>
  )
}

function Metric({
  label,
  tone,
  value,
}: {
  label: string
  tone?: 'danger' | 'warn'
  value: string
}) {
  return (
    <div className={`metric ${tone ?? ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
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
    makeup: '보강',
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

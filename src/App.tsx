import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  ClipboardList,
  Home,
  MapPin,
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
          allMembers={activeMembers}
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
              <article className={isLive ? 'rowItem live' : 'rowItem'} key={danceClass.id}>
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
                    <MapPin size={12} /> {danceClass.location} · {danceClass.level}
                  </small>
                </div>
                <b className="rowCount">
                  {assigned}
                  <span>/{danceClass.capacity}</span>
                </b>
              </article>
            )
          })}
          {!sortedToday.length && <p className="emptyText">오늘 등록된 수업이 없습니다.</p>}
        </div>
      </section>

      <section className="panel">
        <h2>우선 확인</h2>
        <div className="listStack">
          {unpaidMembers.map((member) => (
            <article className="taskRow danger" key={member.id}>
              <div className="taskAvatar">{member.name.slice(0, 1)}</div>
              <div className="taskBody">
                <strong>{member.name}</strong>
                <span>회비 미납 · {member.passType}</span>
              </div>
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
              <a className="callButton" href={`tel:${member.phone}`} aria-label={`${member.name} 전화`}>
                <PhoneCall size={17} />
              </a>
            </article>
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
  onMarkAttendance,
  onUpdateClass,
}: {
  attendance: AttendanceBook
  classes: DanceClass[]
  members: Member[]
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
  const [selectedDate, setSelectedDate] = useState(today)
  const hourRows = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index)
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
                    const assignedMembers = members.filter(
                      (member) =>
                        member.status === 'active' &&
                        member.classIds.includes(danceClass.id),
                    )
                    return (
                      <div className="timeClassCard" key={danceClass.id}>
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
                  onClick={() => setSelectedDate(date)}
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
            <select name="type" defaultValue="line_group">
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
        <div className="split">
          <Field label="최대 인원">
            <input name="capacity" type="number" min="1" defaultValue="12" />
          </Field>
          <Field label="수강료">
            <input name="tuitionFee" type="number" min="0" defaultValue="90000" />
          </Field>
        </div>
        <Field label="레벨">
          <select name="level" defaultValue="초급">
            <option>입문</option>
            <option>초급</option>
            <option>중급</option>
            <option>고급</option>
            <option>전체</option>
          </select>
        </Field>
      </FormDrawer>

      <FormDrawer id="drawer-member" title="등록 회원 추가" hint="새 회원의 기본 정보와 결제 내역을 입력" action={onAddMember}>
        <Field label="이름">
          <input name="name" placeholder="회원 이름" required />
        </Field>
        <Field label="전화번호">
          <input name="phone" type="tel" placeholder="010-0000-0000" required />
        </Field>
        <Field label="수강권">
          <select name="passTemplateId" defaultValue="">
            <option value="">수강권 선택 없이 직접 등록</option>
            {passTemplates.map((pass) => (
              <option value={pass.id} key={pass.id}>
                {passCategoryLabel(pass.type)} · {pass.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="split">
          <Field label="배정 수업">
            <select name="classId" defaultValue={classes[0]?.id ?? ''}>
              {classes.map((danceClass) => (
                <option value={danceClass.id} key={danceClass.id}>
                  {danceClass.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="레벨">
            <select name="level" defaultValue="초급">
              <option>입문</option>
              <option>초급</option>
              <option>중급</option>
              <option>고급</option>
            </select>
          </Field>
        </div>
        <Field label="새 강의명 직접 입력">
          <input name="customClassName" placeholder="예: 야간 초급 라인댄스" />
        </Field>
        <div className="split">
          <Field label="결제 유형">
            <select name="passType" defaultValue="월회비">
              <option>월회비</option>
              <option>10회권</option>
              <option>기간권</option>
            </select>
          </Field>
          <Field label="잔여 횟수">
            <input name="remainingCredits" type="number" min="0" defaultValue="0" />
          </Field>
        </div>
        <div className="split">
          <Field label="결제 금액">
            <input name="paidAmount" type="number" min="0" defaultValue="90000" />
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
            let lastPresent = ''
            for (const [key, status] of Object.entries(attendance)) {
              if (status !== 'present' || !key.endsWith(`|${member.id}`)) continue
              const date = key.split('|')[0]
              if (date > lastPresent) lastPresent = date
            }
            const isEditing = editingMemberId === member.id
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
                        <b className={`memberBadge pay ${member.paymentStatus}`}>
                          {paymentLabel(member.paymentStatus)}
                        </b>
                      )}
                    </div>
                  </div>
                  <div className="passBlock">
                    <strong>{primaryClass?.name ?? member.interest ?? '수업 미지정'}</strong>
                    <span>
                      {member.passType} · {member.lastPaidAt || todayKey} ~ {member.passUntil || '-'}
                    </span>
                  </div>
                  {member.status === 'active' ? (
                    <dl className="memberFacts">
                      <div>
                        <dt>잔여기간</dt>
                        <dd>{dueDays === null ? '-' : `${dueDays}일 남음`}</dd>
                      </div>
                      <div>
                        <dt>잔여횟수</dt>
                        <dd>{member.remainingCredits}회 남음</dd>
                      </div>
                      <div>
                        <dt>최근 출석일</dt>
                        <dd>{lastPresent || '기록 없음'}</dd>
                      </div>
                      <div>
                        <dt>출석 현황</dt>
                        <dd>
                          출석 {attendanceSummary.present} · 결석 {attendanceSummary.absent} · 보강{' '}
                          {attendanceSummary.makeup}
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
                  <div className="split">
                    <Field label="구분">
                      <select name="status" defaultValue={member.status}>
                        <option value="active">등록한 사람</option>
                        <option value="prospect">상담만 한 사람</option>
                        <option value="waitlist">현재 대기</option>
                      </select>
                    </Field>
                    <Field label="배정 수업">
                      <select name="classId" defaultValue={member.classIds[0] ?? ''}>
                        <option value="">수업 미지정</option>
                        {classes.map((danceClass) => (
                          <option value={danceClass.id} key={danceClass.id}>
                            {danceClass.name}
                          </option>
                        ))}
                      </select>
                    </Field>
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
                    <Field label="잔여 횟수">
                      <input name="remainingCredits" type="number" min="0" defaultValue={member.remainingCredits} />
                    </Field>
                    <Field label="결제 금액">
                      <input name="paidAmount" type="number" min="0" defaultValue={member.paidAmount} />
                    </Field>
                  </div>
                  <div className="split">
                    <Field label="최근 결제일">
                      <input name="lastPaidAt" type="date" defaultValue={member.lastPaidAt || todayKey} />
                    </Field>
                    <Field label="다음 결제일">
                      <input name="nextPaymentDue" type="date" defaultValue={member.nextPaymentDue || addDays(30)} />
                    </Field>
                  </div>
                  <Field label="수강 만료일">
                    <input name="passUntil" type="date" defaultValue={member.passUntil || addDays(30)} />
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
      let makeup = 0
      let monthPresent = 0
      let lastPresent = ''
      for (const [key, status] of Object.entries(attendance)) {
        const [date, , memberId] = key.split('|')
        if (memberId !== member.id) continue
        if (status === 'present') {
          present += 1
          if (date.startsWith(monthKey)) monthPresent += 1
          if (date > lastPresent) lastPresent = date
        } else if (status === 'absent') {
          absent += 1
        } else {
          makeup += 1
        }
      }
      return { absent, lastPresent, makeup, member, monthPresent, present }
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
          <span className="ok">출석 {summary.present}</span>
          <span className="danger">결석 {summary.absent}</span>
          <span className="warn">보강 {summary.makeup}</span>
          <span>미체크 {summary.unchecked}</span>
        </div>
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
                  <span className={status ? `state-${status}` : ''}>
                    {status ? attendanceLabel(status) : '미체크'}
                  </span>
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
                    className={status === 'absent' ? 'active absent' : ''}
                    onClick={() => setAttendanceStatus(member.id, 'absent')}
                  >
                    결석
                  </button>
                  <button
                    type="button"
                    className={status === 'makeup' ? 'active makeup' : ''}
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

      <section className="panel">
        <h2>회원별 출석 현황</h2>
        <p className="hint storageHint">
          출석 기록은 이 기기(브라우저)에 자동 저장되어 앱을 껐다 켜도 유지됩니다.
        </p>
        <div className="listStack">
          {memberStats.map(({ absent, lastPresent, makeup, member, monthPresent, present }) => (
            <article className="memberStatRow" key={member.id}>
              <div className="taskAvatar">{member.name.slice(0, 1)}</div>
              <div className="statBody">
                <strong>{member.name}</strong>
                <span>
                  이번 달 출석 <b>{monthPresent}회</b> · 마지막 출석 {lastPresent || '기록 없음'}
                </span>
              </div>
              <div className="statChips">
                <b className="ok">출석 {present}</b>
                <b className="danger">결석 {absent}</b>
                <b className="warn">보강 {makeup}</b>
                {member.remainingCredits > 0 && <b>잔여 {member.remainingCredits}회</b>}
              </div>
            </article>
          ))}
          {!memberStats.length && <p className="emptyText">등록된 회원이 없습니다.</p>}
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
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | 'all'>('all')
  const counts = {
    paid: members.filter((member) => member.paymentStatus === 'paid').length,
    soon: members.filter((member) => member.paymentStatus === 'soon').length,
    unpaid: members.filter((member) => member.paymentStatus === 'unpaid').length,
  }
  const monthKey = todayKey.slice(0, 7)
  const monthTotal = members
    .filter((member) => member.lastPaidAt.startsWith(monthKey))
    .reduce((sum, member) => sum + member.paidAmount, 0)
  const visibleMembers =
    statusFilter === 'all'
      ? members
      : members.filter((member) => member.paymentStatus === statusFilter)
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
        <span>완납 {counts.paid} · 임박 {counts.soon} · 미납 {counts.unpaid}</span>
      </section>

      <section className="panel">
        <h2>결제와 수강권</h2>
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
                <details className="paymentEditor">
                  <summary>결제 정보 수정</summary>
                  <form
                    className="paymentForm"
                    onSubmit={(event) => {
                      event.preventDefault()
                      updatePayment(member.id, new FormData(event.currentTarget))
                    }}
                  >
                    <Field label="결제 상태">
                      <select name="paymentStatus" defaultValue={member.paymentStatus}>
                        <option value="paid">완납</option>
                        <option value="soon">만료 임박</option>
                        <option value="unpaid">미납</option>
                      </select>
                    </Field>
                    <Field label="결제 유형">
                      <select name="passType" defaultValue={member.passType}>
                        <option>월회비</option>
                        <option>10회권</option>
                        <option>기간권</option>
                      </select>
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

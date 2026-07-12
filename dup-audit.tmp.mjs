// 전체 회원: 한 수업이 2개 이상 수강권에 중복 소속된 곳 + 올바른 차감 재계산안
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const store = JSON.parse(
  readFileSync(join(homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'),
)
const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    client_id: '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com',
    client_secret: 'j9iVZfS8kkCEFUPaAeJV0sAi',
    grant_type: 'refresh_token',
    refresh_token: store.tokens.refresh_token,
  }),
})
const { access_token } = await tokenRes.json()
const res = await fetch(
  'https://firestore.googleapis.com/v1/projects/line-dance-4057d/databases/(default)/documents/sync/1hciygkjz06r73fssh6pw2p8',
  { headers: { Authorization: `Bearer ${access_token}` } },
)
const docBody = await res.json()
const data = JSON.parse(docBody.fields.data.stringValue)
const classById = new Map((data.classes ?? []).map((c) => [c.id, c]))

for (const m of data.members ?? []) {
  const owner = new Map()
  const dups = []
  for (const e of m.enrollments ?? []) {
    for (const cid of e.classIds ?? []) {
      if (owner.has(cid)) dups.push({ cid, first: owner.get(cid), second: e })
      else owner.set(cid, e)
    }
  }
  const marks = Object.entries(data.attendance ?? {}).filter(([key, status]) => {
    const [, , memberId] = key.split('|')
    return memberId === m.id && (status === 'present' || status === 'makeup')
  })
  if (dups.length) {
    console.log(`\n=== ${m.name}: 중복 소속 ${dups.length}건 ===`)
    for (const d of dups) {
      console.log(
        `  수업 "${classById.get(d.cid)?.name ?? d.cid}" → [${d.first.passName}] 와 [${d.second.passName}] 둘 다에 소속`,
      )
    }
  }
  // 재계산안: 각 수강권 잔여 = 총횟수 - (그 수강권 수업들의 lastPaidAt 이후 출석수)
  for (const e of m.enrollments ?? []) {
    if (e.totalCredits <= 0) continue
    // 수업의 올바른 소유자: passName === 수업이름 인 수강권 우선
    const ownedClassIds = (e.classIds ?? []).filter((cid) => {
      const cls = classById.get(cid)
      if (!cls) return false
      const nameMatchOwner = (m.enrollments ?? []).find(
        (other) => other.passName === cls.name && (other.classIds ?? []).includes(cid),
      )
      return nameMatchOwner ? nameMatchOwner.id === e.id : true
    })
    const used = marks.filter(([key]) => {
      const [date, classId] = key.split('|')
      return ownedClassIds.includes(classId) && (!e.lastPaidAt || date >= e.lastPaidAt)
    }).length
    const expected = e.totalCredits - used
    if (expected !== e.remainingCredits) {
      console.log(
        `  ${m.name} [${e.passName}] 잔여: 현재 ${e.remainingCredits} → 올바른 값 ${expected} (결제일 ${e.lastPaidAt} 이후 출석 ${used}회)`,
      )
    }
  }
}
console.log('\n(위에 아무것도 안 나왔다면 모두 정상)')

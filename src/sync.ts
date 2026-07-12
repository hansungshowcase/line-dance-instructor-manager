import { doc, onSnapshot, setDoc, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

// 동기화 코드 길이 (보안규칙에서 20자 이상을 요구하므로 넉넉히 24자)
export const SYNC_CODE_LENGTH = 24

const CODE_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

// 무작위 24자 코드 생성 (암호학적 난수)
export function generateSyncCode(): string {
  const bytes = new Uint8Array(SYNC_CODE_LENGTH)
  crypto.getRandomValues(bytes)
  let code = ''
  for (const byte of bytes) code += CODE_ALPHABET[byte % CODE_ALPHABET.length]
  return code
}

export function isValidSyncCode(code: string): boolean {
  return /^[a-z0-9]{20,}$/.test(code)
}

// 원격 문서의 스냅샷 하나.
// confirmed=false면 아직 서버가 확정하지 않은 값(오프라인 캐시 또는 전송 대기 중인
// 내 쓰기의 지연 보상)이라 '원격의 진짜 상태'로 판단해서는 안 된다.
export type SyncSnapshot = {
  json: string | null
  updatedAt: number
  confirmed: boolean
}

// 전체 앱 데이터(JSON 문자열)를 하나의 문서에 저장한다.
// 문서 경로: /sync/{code}, 필드: { data: <json>, updatedAt: <ms> }
// updatedAt은 '편집이 일어난 시각'으로 기록되어, 오프라인에서 큐잉됐다가 뒤늦게
// 도착한 쓰기를 수신 기기가 과거 데이터로 판별하는 근거가 된다.
export async function pushSync(code: string, json: string, updatedAt: number): Promise<void> {
  if (!db) return
  await setDoc(doc(db, 'sync', code), { data: json, updatedAt })
}

// 원격 문서 변경을 실시간 구독한다.
// includeMetadataChanges: 캐시 스냅샷 → 서버 확정 스냅샷 전환(데이터 동일)도 이벤트로
// 받아야 구독 측이 confirmed=true 시점을 놓치지 않는다.
export function subscribeSync(
  code: string,
  onData: (snapshot: SyncSnapshot) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  if (!db) return () => {}
  return onSnapshot(
    doc(db, 'sync', code),
    { includeMetadataChanges: true },
    (snapshot) => {
      const confirmed = !snapshot.metadata.fromCache && !snapshot.metadata.hasPendingWrites
      if (!snapshot.exists()) {
        onData({ confirmed, json: null, updatedAt: 0 })
        return
      }
      const value = snapshot.data()
      onData({
        confirmed,
        json: typeof value?.data === 'string' ? value.data : null,
        updatedAt: typeof value?.updatedAt === 'number' ? value.updatedAt : 0,
      })
    },
    (error) => onError?.(error),
  )
}

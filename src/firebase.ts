import type { Firestore } from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig'

// 설정값이 채워졌을 때만 Firebase를 초기화한다.
// 값이 비어 있으면(설정 전) 앱은 기존처럼 이 기기에만 저장되는 로컬 모드로 동작한다.
export const firebaseReady =
  firebaseConfig.apiKey.length > 0 && firebaseConfig.projectId.length > 0

// Firebase SDK는 용량이 커서(수백 KB) 동기화를 실제로 쓸 때만 내려받는다.
// 정적 import를 쓰면 앱 첫 로딩이 3배 느려지므로 반드시 동적 import를 유지할 것.
let dbPromise: Promise<Firestore | null> | null = null

export function getDb(): Promise<Firestore | null> {
  if (!firebaseReady) return Promise.resolve(null)
  if (!dbPromise) {
    dbPromise = Promise.all([import('firebase/app'), import('firebase/firestore')]).then(
      ([appModule, firestoreModule]) =>
        firestoreModule.getFirestore(appModule.initializeApp(firebaseConfig)),
    )
  }
  return dbPromise
}

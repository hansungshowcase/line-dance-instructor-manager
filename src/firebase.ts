import { initializeApp } from 'firebase/app'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { firebaseConfig } from './firebaseConfig'

// 설정값이 채워졌을 때만 Firebase를 초기화한다.
// 값이 비어 있으면(설정 전) 앱은 기존처럼 이 기기에만 저장되는 로컬 모드로 동작한다.
export const firebaseReady =
  firebaseConfig.apiKey.length > 0 && firebaseConfig.projectId.length > 0

export const db: Firestore | null = firebaseReady
  ? getFirestore(initializeApp(firebaseConfig))
  : null

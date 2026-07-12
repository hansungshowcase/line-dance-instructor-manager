import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => {
      // The app still works when service worker registration is unavailable.
    })
  })
}

// 새 버전이 배포되면 자동으로 최신 화면으로 교체한다.
// 홈 화면 앱(PWA)은 완전히 종료하지 않으면 예전 화면이 남아 있을 수 있어서,
// 앱으로 돌아올 때마다(+ 백그라운드에서 30분마다) 서버의 번들 해시를 비교한다.
const currentBundleSrc = document.querySelector<HTMLScriptElement>(
  'script[type="module"][src*="assets/index-"]',
)?.src
let lastUpdateCheck = 0

async function checkForUpdate(force: boolean) {
  if (!currentBundleSrc) return // 개발 모드 등 — 확인할 번들이 없음
  if (!force && Date.now() - lastUpdateCheck < 5 * 60 * 1000) return
  lastUpdateCheck = Date.now()
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}index.html`, { cache: 'no-store' })
    if (!res.ok) return
    const html = await res.text()
    const latest = html.match(/assets\/index-[^"]+\.js/)?.[0]
    if (latest && !currentBundleSrc.includes(latest)) {
      window.location.reload()
    }
  } catch {
    // 오프라인이면 다음 기회에 확인한다
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void checkForUpdate(false)
})
window.setInterval(() => {
  // 화면을 보고 있는 중에는 갑자기 새로고침하지 않는다 (입력 중 방해 금지)
  if (document.visibilityState === 'hidden') void checkForUpdate(false)
}, 30 * 60 * 1000)

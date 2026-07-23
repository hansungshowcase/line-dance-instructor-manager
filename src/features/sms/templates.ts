export type SmsTemplate = {
  readonly body: string
  readonly id: string
  readonly title: string
}

export type SmsTemplateContext = {
  readonly fee: string
  readonly lesson: string
  readonly name: string
}

export const defaultSmsTemplates: readonly SmsTemplate[] = [
  {
    id: 'renewal-default',
    title: '재등록 안내',
    body: '{이름}님 안녕하세요~ {수업} 재등록 안내드려요. 수강료는 {수강료}입니다 :)',
  },
]

function isSmsTemplate(value: unknown): value is SmsTemplate {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.id === 'string' &&
    typeof item.title === 'string' &&
    typeof item.body === 'string'
  )
}

export function loadSmsTemplates(raw: string | null): readonly SmsTemplate[] {
  if (!raw) return defaultSmsTemplates
  try {
    const parsed: unknown = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      const templates = parsed.filter(isSmsTemplate)
      return templates.length ? templates : defaultSmsTemplates
    }
    if (parsed && typeof parsed === 'object') {
      const legacy = parsed as Record<string, unknown>
      if (typeof legacy.lowCredit === 'string') {
        return [
          legacy.lowCredit.includes('{이름}') && legacy.lowCredit.includes('{수강료}')
            ? { ...defaultSmsTemplates[0], body: legacy.lowCredit }
            : defaultSmsTemplates[0],
        ]
      }
    }
  } catch {
    return defaultSmsTemplates
  }
  return defaultSmsTemplates
}

export function renderSmsTemplate(
  template: SmsTemplate,
  context: SmsTemplateContext,
): string {
  return template.body
    .replaceAll('{이름}', context.name)
    .replaceAll('{수업}', context.lesson)
    .replaceAll('{수강료}', context.fee)
}

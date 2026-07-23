import { Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import type { SmsTemplate } from './templates'

type Props = {
  readonly onChange: (templates: readonly SmsTemplate[]) => void
  readonly templates: readonly SmsTemplate[]
}

export function SmsTemplateSettings({ onChange, templates }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')

  function updateTemplate(id: string, patch: Partial<Pick<SmsTemplate, 'body' | 'title'>>) {
    onChange(templates.map((template) => (template.id === id ? { ...template, ...patch } : template)))
  }

  return (
    <div className="smsTemplateSettings">
      <p className="hint ruleHint">
        {'{이름}'}, {'{수업}'}, {'{수강료}'}를 넣으면 문자 작성 때 자동으로 바뀝니다.
      </p>
      <div className="listStack">
        {templates.map((template) => (
          <div className="smsTemplateItem" key={template.id}>
            <label>
              <span>템플릿 이름</span>
              <input
                value={template.title}
                onChange={(event) => updateTemplate(template.id, { title: event.target.value })}
              />
            </label>
            <label>
              <span>문자 내용</span>
              <textarea
                rows={3}
                value={template.body}
                onChange={(event) => updateTemplate(template.id, { body: event.target.value })}
              />
            </label>
            <button
              type="button"
              className="smsTemplateDelete"
              aria-label={`${template.title} 템플릿 삭제`}
              onClick={() => onChange(templates.filter((item) => item.id !== template.id))}
            >
              <Trash2 size={16} /> 삭제
            </button>
          </div>
        ))}
      </div>
      <form
        className="smsTemplateAdd"
        onSubmit={(event) => {
          event.preventDefault()
          if (!title.trim() || !body.trim()) return
          onChange([
            ...templates,
            { body: body.trim(), id: `sms-${Date.now()}`, title: title.trim() },
          ])
          setTitle('')
          setBody('')
        }}
      >
        <label>
          <span>새 템플릿 이름</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>
          <span>새 문자 내용</span>
          <textarea rows={3} value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <button type="submit" className="primaryButton" disabled={!title.trim() || !body.trim()}>
          <Plus size={16} /> 템플릿 추가
        </button>
      </form>
    </div>
  )
}

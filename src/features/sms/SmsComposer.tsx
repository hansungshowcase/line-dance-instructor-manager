import { Copy, MessageCircle, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { renderSmsTemplate, type SmsTemplate } from './templates'

type ComposerClass = { readonly id: string; readonly name: string }
type ComposerEnrollment = {
  readonly classIds: readonly string[]
  readonly id: string
  readonly paidAmount: number
  readonly passName: string
}
type ComposerMember = {
  readonly enrollments: readonly ComposerEnrollment[]
  readonly id: string
  readonly name: string
  readonly phone: string
}

type Props = {
  readonly classes: readonly ComposerClass[]
  readonly initialMemberId: string
  readonly members: readonly ComposerMember[]
  readonly onClose: () => void
  readonly onCopy: (text: string) => void
  readonly smsHref: (phone: string, body: string) => string
  readonly templates: readonly SmsTemplate[]
}

function formatFee(amount: number): string {
  return new Intl.NumberFormat('ko-KR', { style: 'currency', currency: 'KRW' }).format(amount)
}

export function SmsComposer({
  classes,
  initialMemberId,
  members,
  onClose,
  onCopy,
  smsHref,
  templates,
}: Props) {
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? '')
  const [memberId, setMemberId] = useState(initialMemberId || members[0]?.id || '')
  const member = members.find((item) => item.id === memberId)
  const [enrollmentId, setEnrollmentId] = useState(
    member?.enrollments[0]?.id ?? '',
  )
  const enrollment = member?.enrollments.find((item) => item.id === enrollmentId)
  const template = templates.find((item) => item.id === templateId)
  const classNames = enrollment?.classIds.flatMap((classId) => {
    const danceClass = classes.find((item) => item.id === classId)
    return danceClass ? [danceClass.name] : []
  })
  const lesson = classNames?.length
    ? [...new Set(classNames)].join(', ')
    : enrollment?.passName.includes('개인')
      ? '개인레슨'
      : enrollment?.passName ?? ''
  const preview = useMemo(
    () =>
      template && member && enrollment
        ? renderSmsTemplate(template, {
            fee: formatFee(enrollment.paidAmount),
            lesson,
            name: member.name,
          })
        : '',
    [enrollment, lesson, member, template],
  )

  return (
    <div className="modalBackdrop" role="presentation" onMouseDown={onClose}>
      <section
        className="smsComposer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sms-composer-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header>
          <h2 id="sms-composer-title">문자 작성</h2>
          <button type="button" aria-label="문자 작성 닫기" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        {!templates.length ? (
          <p className="emptyText">설정에서 문자 템플릿을 먼저 추가해 주세요.</p>
        ) : (
          <>
            <label>
              <span>템플릿</span>
              <select value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                {templates.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}
              </select>
            </label>
            <label>
              <span>회원</span>
              <select
                value={memberId}
                onChange={(event) => {
                  const nextMember = members.find((item) => item.id === event.target.value)
                  setMemberId(event.target.value)
                  setEnrollmentId(nextMember?.enrollments[0]?.id ?? '')
                }}
              >
                {members.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
            </label>
            <label>
              <span>수강권</span>
              <select value={enrollmentId} onChange={(event) => setEnrollmentId(event.target.value)}>
                {member?.enrollments.map((item) => (
                  <option value={item.id} key={item.id}>{item.passName}</option>
                ))}
              </select>
            </label>
            <label>
              <span>미리보기</span>
              <textarea readOnly rows={6} value={preview} />
            </label>
            <div className="smsComposerActions">
              <button type="button" onClick={() => onCopy(preview)} disabled={!preview}>
                <Copy size={17} /> 복사
              </button>
              <a href={member && preview ? smsHref(member.phone, preview) : undefined} aria-disabled={!preview}>
                <MessageCircle size={17} /> 문자 보내기
              </a>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

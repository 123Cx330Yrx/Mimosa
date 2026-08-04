import type { Locale } from '../i18n'

interface BaselineNoticeProps {
  locale: Locale
  leaving?: boolean
}

export function BaselineNotice({ locale, leaving = false }: BaselineNoticeProps) {
  return (
    <section
      className={`baseline-notice ${leaving ? 'is-leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="baseline-notice__sound" aria-hidden="true">
        <i /><i /><i /><i />
      </span>
      <div>
        <strong>{locale === 'en' ? 'The conversation has gone quiet for a moment.' : '讨论暂时安静下来了'}</strong>
        <p>{locale === 'en'
          ? 'Take your time, or decide together how to move forward.'
          : '可以继续思考，也可以一起决定接下来怎么推进。'}</p>
      </div>
    </section>
  )
}

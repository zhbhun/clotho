import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/shadcn/spinner'
import type { AgentSkillDocument } from '@/shared/rpc'

import { MarkdownRenderer } from '../../../components/markdown-renderer'
import { readAgentSkill } from '../../../services/claude/agent-config'

export function SkillDetailPage({ name }: { name: string }) {
  const { t } = useTranslation()
  const [document, setDocument] = useState<AgentSkillDocument | null>()
  useEffect(() => {
    let active = true
    readAgentSkill(name).then(
      (result) => {
        if (active) setDocument(result)
      },
      () => {
        if (active) setDocument(null)
      },
    )
    return () => {
      active = false
    }
  }, [name])

  if (document === undefined) return <Spinner />
  if (!document) return <p>{t('settings.agent.loadError')}</p>
  const fields = Object.entries(document.metadata)
  return (
    <div className="flex min-w-0 flex-col gap-8">
      {fields.length > 0 && (
        <section className="rounded-lg border bg-muted/50 p-4">
          <h2 className="mb-3 text-sm font-medium text-foreground-subtle">
            {t('settings.agent.skills.metadata')}
          </h2>
          <dl className="grid grid-cols-[minmax(5rem,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 font-mono text-sm">
            {fields.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-foreground-subtlest">{label}</dt>
                <dd className="whitespace-pre-wrap wrap-anywhere">{value}</dd>
              </Fragment>
            ))}
          </dl>
        </section>
      )}
      <MarkdownRenderer content={document.body} />
    </div>
  )
}

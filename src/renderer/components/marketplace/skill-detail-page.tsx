import { Fragment, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Spinner } from '@/shadcn/spinner'
import type { AgentSkillDocument, MarketSkill } from '@/shared/rpc'

import { readAgentSkill } from '../../services/claude/agent-config'
import { MarkdownRenderer } from '../markdown-renderer'
import { ExternalLink } from './skill-grid'

export function SkillDetailPage({
  name,
  marketSkill,
}: {
  name: string
  marketSkill?: MarketSkill
}) {
  const { t } = useTranslation()
  const [document, setDocument] = useState<AgentSkillDocument | null>()
  useEffect(() => {
    let active = true
    if (marketSkill && !marketSkill.source.includes('/')) {
      setDocument(null)
      return
    }
    const request = marketSkill
      ? readAgentSkill(marketSkill.name, marketSkill.source)
      : readAgentSkill(name)
    request.then(
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
  }, [name, marketSkill])

  if (document === undefined) return <Spinner />
  if (!document && !marketSkill) return <p>{t('settings.agent.loadError')}</p>
  const metadata = document?.metadata ?? {
    name: marketSkill?.name,
    description: marketSkill?.description,
  }
  const fields = Object.entries(metadata).filter(([, value]) => value)
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
      {marketSkill?.url && (
        <div>
          <ExternalLink href={marketSkill.url}>{marketSkill.url}</ExternalLink>
        </div>
      )}
      {document ? (
        <MarkdownRenderer content={document.body} />
      ) : (
        <p className="text-sm text-foreground-subtle">
          {t('settings.agent.skillMarket.documentUnavailable')}
        </p>
      )}
    </div>
  )
}

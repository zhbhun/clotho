import { Check, ChevronRight, ExternalLink, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Badge } from '@/shadcn/badge'
import { Button } from '@/shadcn/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shadcn/card'
import { Field, FieldGroup, FieldLabel } from '@/shadcn/field'
import { Input } from '@/shadcn/input'
import { Spinner } from '@/shadcn/spinner'
import { cn } from '@/shadcn/utils'
import { CLAUDE_INSTALL_GUIDE } from '@/shared/claude-runtime'

import { requestFromDesktop } from '../services/desktop/client'
import { isClaudeRuntimeBusy, useClaudeRuntimeStore } from '../stores/claude-runtime-store'

export function ClaudeRuntimePanel({ onContinue }: { onContinue?: () => void }) {
  const { t } = useTranslation()
  const runtime = useClaudeRuntimeStore((state) => state.runtime)
  const error = useClaudeRuntimeStore((state) => state.requestError)
  const check = useClaudeRuntimeStore((state) => state.check)
  const install = useClaudeRuntimeStore((state) => state.install)
  const initialize = useClaudeRuntimeStore((state) => state.initialize)
  const [customPath, setCustomPath] = useState(runtime?.customPath ?? '')
  const [isRequesting, setRequesting] = useState(false)
  const [isPathOpen, setPathOpen] = useState(false)
  useEffect(() => {
    void initialize()
  }, [initialize])
  useEffect(() => {
    setCustomPath(runtime?.customPath ?? '')
  }, [runtime?.customPath])
  const phase = runtime?.phase ?? 'checking'
  const isBusy = isClaudeRuntimeBusy(phase)
  const isDisabled = isBusy || isRequesting || (phase === 'checking' && !error)
  async function run(action: () => Promise<void>) {
    setRequesting(true)
    try {
      await action()
    } finally {
      setRequesting(false)
    }
  }

  return (
    <section className="flex flex-col gap-5">
      <header>
        <h1 className="text-xl font-semibold tracking-tight">{t(`runtime.${phase}`)}</h1>
        <p className="mt-2 text-sm leading-relaxed text-foreground-subtle">
          {t(isBusy ? 'runtime.busyDescription' : 'runtime.description')}
        </p>
      </header>
      <Card>
        <CardHeader className="flex flex-row items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Terminal className="size-5" />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <CardTitle>Claude Code</CardTitle>
            <CardDescription>
              {runtime?.version ? `v${runtime.version}` : t('runtime.environment')}
            </CardDescription>
          </div>
          {phase === 'missing' || phase === 'ready' ? (
            <Badge variant={phase === 'ready' ? 'outline' : 'secondary'}>
              {phase === 'ready' ? <Check data-icon="inline-start" /> : null}
              {t(phase === 'missing' ? 'runtime.notInstalled' : 'runtime.available')}
            </Badge>
          ) : null}
          {isBusy || phase === 'checking' ? <Spinner /> : null}
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {phase === 'outdated' ? (
            <p className="text-xs text-foreground-subtle">
              {t('runtime.versionRequirement', {
                version: runtime?.version,
                minimum: runtime?.minimumVersion,
              })}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-between gap-2 text-xs">
            <span className="shrink-0 text-foreground-subtle">
              {t(phase === 'missing' ? 'runtime.installPath' : 'runtime.path')}
            </span>
            <code className="min-w-0 text-right break-all">
              {runtime?.path ?? runtime?.installPath ?? '—'}
            </code>
          </div>
          {runtime?.error || error ? (
            <p className="text-sm break-words text-destructive">{error ?? runtime?.error}</p>
          ) : null}
        </CardContent>
      </Card>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-foreground-subtle">
          <Button
            className="h-auto px-0 py-1"
            size="sm"
            variant="ghost"
            onClick={() => setPathOpen((open) => !open)}
          >
            <ChevronRight data-icon="inline-start" className={cn(isPathOpen && 'rotate-90')} />
            {t(phase === 'ready' ? 'runtime.changePath' : 'runtime.customPath')}
          </Button>
          {['missing', 'outdated', 'failed', 'error'].includes(phase) ? (
            <Button
              className="h-auto px-0 py-1"
              size="sm"
              variant="ghost"
              onClick={() => {
                void requestFromDesktop('appOpenLink', {
                  href: CLAUDE_INSTALL_GUIDE,
                  projectPath: '',
                })
              }}
            >
              {t('runtime.guide')}
              <ExternalLink data-icon="inline-end" />
            </Button>
          ) : null}
        </div>
        {isPathOpen ? (
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor="claude-runtime-path">{t('runtime.path')}</FieldLabel>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="claude-runtime-path"
                  disabled={isDisabled}
                  placeholder={t('runtime.pathPlaceholder')}
                  value={customPath}
                  onChange={(event) => setCustomPath(event.target.value)}
                />
                <Button
                  disabled={isDisabled || !customPath.trim()}
                  variant="outline"
                  onClick={() => void run(() => check(customPath))}
                >
                  {t('runtime.savePath')}
                </Button>
              </div>
            </Field>
            {runtime?.customPath ? (
              <Button
                className="self-start"
                size="sm"
                disabled={isDisabled}
                variant="ghost"
                onClick={() => void run(() => check(''))}
              >
                {t('runtime.automaticPath')}
              </Button>
            ) : null}
          </FieldGroup>
        ) : null}
      </div>
      <div className="flex flex-wrap justify-end gap-2">
        <Button disabled={isDisabled} variant="outline" onClick={() => void run(() => check())}>
          {t('runtime.check')}
        </Button>
        {phase !== 'ready' && phase !== 'checking' && !isBusy ? (
          <Button disabled={isDisabled} onClick={() => void run(install)}>
            {t(
              phase === 'outdated'
                ? 'runtime.update'
                : phase === 'failed'
                  ? 'runtime.retry'
                  : 'runtime.install',
            )}
          </Button>
        ) : null}
        {isBusy ? (
          <Button disabled>
            <Spinner data-icon="inline-start" />
            {t(`runtime.${phase}`)}
          </Button>
        ) : null}
        {phase === 'ready' && onContinue ? (
          <Button onClick={onContinue}>{t('workbench.onboarding.next')}</Button>
        ) : null}
      </div>
      {runtime?.logs ? (
        <details
          key={runtime.phase === 'failed' ? 'failed' : 'details'}
          open={runtime.phase === 'failed' || undefined}
          className="group text-xs text-foreground-subtle"
        >
          <summary className="flex cursor-pointer list-none items-center gap-2 py-1 [&::-webkit-details-marker]:hidden">
            <ChevronRight className="size-3.5 group-open:rotate-90" />
            {t('runtime.details')}
          </summary>
          <pre className="mt-3 max-h-48 overflow-auto rounded-lg bg-muted p-3 whitespace-pre-wrap">
            {runtime.logs}
          </pre>
        </details>
      ) : null}
    </section>
  )
}

import { ChevronRight, type LucideIcon } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/shadcn/checkbox'
import { RadioGroup, RadioGroupItem } from '@/shadcn/radio-group'
import { cn } from '@/shadcn/utils'

import { ToolIcon } from '../shared/content'
import { recordValue } from '../shared/utils'

interface AskQuestion {
  question?: string
  header?: string
  options?: { label?: string; description?: string }[]
  multiSelect?: boolean
}

export function AskResultCard({
  icon,
  input,
  result,
  toolUseResult,
  description,
  isError,
  isRunning,
}: {
  icon: LucideIcon
  input?: unknown
  result?: string
  toolUseResult?: unknown
  description: string
  isError?: boolean
  isRunning?: boolean
}) {
  const { t } = useTranslation()
  const questions = askQuestions(input, toolUseResult)
  const answers = extractAnswerMap(toolUseResult, result)
  const [open, setOpen] = useState(true)
  const headline =
    questions[0]?.question ?? questions[0]?.header ?? t('tools.AskUserQuestion.label')
  const hasBody = questions.length > 0
  const hasErrorStyle = Boolean(isError)
  const headerClassName = cn(
    'group inline-flex min-w-0 max-w-full items-center gap-1.5 text-left leading-6 text-foreground-subtle',
    hasBody &&
      '-mx-1 cursor-pointer rounded-sm border-0 bg-transparent px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
  )
  const headerContent = (
    <>
      <ToolIcon
        className={cn(
          !hasErrorStyle && 'text-foreground-subtlest',
          !hasErrorStyle &&
            hasBody &&
            'group-hover:text-foreground group-focus-visible:text-foreground',
          !hasErrorStyle && isRunning && 'motion-safe:animate-pulse text-foreground',
        )}
        description={description}
        errorMessage={hasErrorStyle ? result?.trim() : undefined}
        icon={icon}
        isError={hasErrorStyle}
      />
      <span
        className={cn(
          'truncate font-mono text-foreground-subtlest',
          hasBody && 'group-hover:text-foreground group-focus-visible:text-foreground',
        )}
      >
        {headline}
      </span>
      {hasBody ? (
        <ChevronRight
          className={cn(
            'pointer-events-none size-3 shrink-0 text-foreground-subtlest opacity-0 transition-[opacity,transform] group-hover:opacity-100 group-focus-visible:opacity-100',
            open && 'rotate-90',
          )}
        />
      ) : null}
    </>
  )

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-2">
        {hasBody ? (
          <button
            aria-expanded={open}
            aria-label={['AskUserQuestion', headline].filter(Boolean).join(' ')}
            className={headerClassName}
            type="button"
            onClick={() => setOpen((value) => !value)}
          >
            {headerContent}
          </button>
        ) : (
          <div aria-label="AskUserQuestion" className={headerClassName}>
            {headerContent}
          </div>
        )}
      </div>

      {open && hasBody ? (
        <div className="mt-2 flex flex-col gap-2">
          {questions.map((question, index) => (
            <AskQuestionCard
              key={index}
              question={question}
              answer={answerForQuestion(question, answers)}
              index={index}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

function extractQuestions(input: unknown): AskQuestion[] {
  if (!input || typeof input !== 'object') return []
  const questions = (input as { questions?: unknown }).questions
  return Array.isArray(questions)
    ? questions.filter((question): question is AskQuestion =>
        Boolean(question && typeof question === 'object'),
      )
    : []
}

function parseAnswerMapFromResult(result?: string): Record<string, string> {
  if (!result) return {}

  const entries: [string, string][] = []
  for (const match of result.matchAll(/"([^"]+)"="([^"]*)"/g)) {
    const question = match[1]?.trim()
    const answer = match[2]?.trim()
    if (question && answer) entries.push([question, answer])
  }

  return Object.fromEntries(entries)
}

function extractAnswerMap(toolUseResult: unknown, resultText?: string): Record<string, string> {
  const toolResult = recordValue(toolUseResult)
  const answers = recordValue(toolResult.answers)
  const entries = Object.entries(answers)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([key, value]) => [key, value.trim()] as const)

  if (entries.length) return Object.fromEntries(entries)

  const answer = typeof toolResult.answer === 'string' ? toolResult.answer.trim() : ''
  const response = typeof toolResult.response === 'string' ? toolResult.response.trim() : ''
  const fallback = answer || response
  if (fallback) return { '': fallback }

  return parseAnswerMapFromResult(resultText)
}

function askQuestions(input: unknown, toolUseResult: unknown): AskQuestion[] {
  const resultQuestions = extractQuestions(toolUseResult)
  return resultQuestions.length ? resultQuestions : extractQuestions(input)
}

function answerForQuestion(question: AskQuestion, answers: Record<string, string>): string {
  const keys = [question.question, question.header, ''].filter((key): key is string => Boolean(key))

  for (const key of keys) {
    const answer = answers[key]?.trim()
    if (answer) return answer
  }

  return ''
}

function answerOptionLabels(answer: string): Set<string> {
  return new Set(
    answer
      .split(/[,，、]/)
      .map((part) => part.trim())
      .filter(Boolean),
  )
}

function isSelectedOption(answerLabels: Set<string>, label?: string): boolean {
  return Boolean(label && answerLabels.has(label))
}

function AskOptionRows({
  multiple,
  options,
  answerLabels,
  customAnswer,
  otherSelected,
  index,
}: {
  multiple: boolean
  options: { label?: string }[]
  answerLabels: Set<string>
  customAnswer: string
  otherSelected: boolean
  index: number
}) {
  const { t } = useTranslation()
  const indicatorClass = 'size-3.5 disabled:opacity-100 disabled:cursor-default'
  const otherTestId = index === 0 ? 'ask-other-indicator' : `ask-other-indicator-${index}`
  const showOther = options.length > 0 || Boolean(customAnswer)

  return (
    <>
      {options.map((option, optionIndex) => {
        const selected = isSelectedOption(answerLabels, option.label)
        const testId = `ask-option-indicator-${index}-${optionIndex}`
        return (
          <div
            key={`${option.label ?? 'option'}-${optionIndex}`}
            className="flex items-start gap-2"
          >
            {multiple ? (
              <Checkbox
                checked={selected}
                disabled
                data-testid={testId}
                className={indicatorClass}
              />
            ) : (
              <RadioGroupItem
                value={option.label ?? ''}
                disabled
                data-testid={testId}
                className={indicatorClass}
              />
            )}
            <span>{option.label}</span>
          </div>
        )
      })}
      {showOther ? (
        <div className="flex items-start gap-2">
          {multiple ? (
            <Checkbox
              checked={otherSelected}
              disabled
              data-testid={otherTestId}
              className={indicatorClass}
            />
          ) : (
            <RadioGroupItem
              value={`__other__${index}`}
              disabled
              data-testid={otherTestId}
              className={indicatorClass}
            />
          )}
          <span>{t('tools.ask.other')}</span>
        </div>
      ) : null}
    </>
  )
}

function AskQuestionCard({
  question,
  answer,
  index,
}: {
  question: AskQuestion
  answer: string
  index: number
}) {
  const answerLabels = answerOptionLabels(answer)
  const multiple = Boolean(question.multiSelect)
  const options = question.options ?? []
  const hasSelectedOption = options.some((option) => isSelectedOption(answerLabels, option.label))
  const customAnswer = answer && !hasSelectedOption ? answer : ''
  const otherSelected = Boolean(customAnswer)
  const selectedValue = otherSelected
    ? `__other__${index}`
    : (options.find((option) => isSelectedOption(answerLabels, option.label))?.label ?? '')
  const rowsClass = 'flex flex-col gap-1 text-xs leading-5 text-foreground-subtle'

  return (
    <div
      className="flex flex-col gap-1.5 rounded-md border border-border/50 bg-muted/30 px-3 py-2"
      data-testid="ask-question-card"
    >
      <div className="text-xs font-medium leading-5 text-foreground-subtle">
        {question.header ? `${question.header}: ` : ''}
        {question.question}
      </div>
      {multiple ? (
        <div className={rowsClass}>
          <AskOptionRows
            multiple
            options={options}
            answerLabels={answerLabels}
            customAnswer={customAnswer}
            otherSelected={otherSelected}
            index={index}
          />
        </div>
      ) : (
        <RadioGroup value={selectedValue} className={rowsClass}>
          <AskOptionRows
            multiple={false}
            options={options}
            answerLabels={answerLabels}
            customAnswer={customAnswer}
            otherSelected={otherSelected}
            index={index}
          />
        </RadioGroup>
      )}
      {customAnswer ? (
        <div className="whitespace-pre-wrap break-words pl-5 text-foreground-subtle">
          {customAnswer}
        </div>
      ) : null}
    </div>
  )
}

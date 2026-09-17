import { Check, MessageCircleQuestion } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/shadcn/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/shadcn/card'
import { FieldError } from '@/shadcn/field'
import { Spinner } from '@/shadcn/spinner'

import { useAppReducedMotion } from '../../../../../components/theme-provider'
import type { ClaudeToolRequest, ClaudeToolResult } from '../../../../../services/claude/claude'
import { type Answer, type AskQuestion, QuestionRow } from './question-row'

function extractQuestions(input: unknown): AskQuestion[] {
  if (!input || typeof input !== 'object') return []
  const questions = (input as { questions?: unknown }).questions
  return Array.isArray(questions)
    ? questions.filter((q): q is AskQuestion => Boolean(q) && typeof q === 'object')
    : []
}

function isAnswered(answer: Answer | undefined): boolean {
  if (!answer) return false
  return answer.indices.length > 0 || (answer.isOtherSelected && answer.otherText.trim().length > 0)
}

function createAnswer(): Answer {
  return { indices: [], isOtherSelected: false, otherText: '' }
}

/**
 * When an agent asks for clarification (AskUserQuestion), replace the bottom input with a floating form.
 * After the user answers, inject answers as updatedInput and let AskResultCard show the result.
 */
export function AskPanel({
  requests,
  fallback,
  onRespond,
}: {
  requests: ClaudeToolRequest[]
  fallback?: ReactNode
  onRespond: (toolUseId: string, result: ClaudeToolResult) => Promise<void>
}) {
  const prefersReducedMotion = useAppReducedMotion()
  const enter = prefersReducedMotion ? false : { opacity: 0, scale: 0.99, y: 8 }
  const exit = prefersReducedMotion ? { opacity: 1 } : { opacity: 0, scale: 0.99, y: 8 }
  const transition = { duration: prefersReducedMotion ? 0 : 0.18, ease: 'easeOut' as const }

  return (
    <AnimatePresence initial={false} mode="wait">
      {requests.length ? (
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="flex origin-bottom flex-col gap-2"
          exit={exit}
          initial={enter}
          key="questions"
          transition={transition}
        >
          {requests.map((request) => (
            <AskForm key={request.toolUseId} request={request} onRespond={onRespond} />
          ))}
        </motion.div>
      ) : fallback ? (
        <motion.div
          animate={{ opacity: 1, scale: 1, y: 0 }}
          initial={enter}
          key="fallback"
          transition={transition}
        >
          {fallback}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

function AskForm({
  request,
  onRespond,
}: {
  request: ClaudeToolRequest
  onRespond: (toolUseId: string, result: ClaudeToolResult) => Promise<void>
}) {
  const { t } = useTranslation()
  const questions = extractQuestions(request.input)
  const [answers, setAnswers] = useState<Record<number, Answer>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const updateAnswer = (index: number, update: (answer: Answer) => Answer) => {
    setSubmitError(null)
    setAnswers((previous) => {
      const answer = update(previous[index] ?? createAnswer())
      return { ...previous, [index]: answer }
    })
  }

  const toggleOption = (questionIndex: number, optionIndex: number, multi: boolean) => {
    updateAnswer(questionIndex, (answer) => {
      if (!multi) {
        return { ...answer, indices: [optionIndex], isOtherSelected: false }
      }

      const indices = [...answer.indices]
      const selectedIndex = indices.indexOf(optionIndex)
      if (selectedIndex >= 0) indices.splice(selectedIndex, 1)
      else indices.push(optionIndex)
      return { ...answer, indices }
    })
  }

  const setOtherSelected = (questionIndex: number, selected: boolean, multi: boolean) => {
    updateAnswer(questionIndex, (answer) => ({
      ...answer,
      indices: selected && !multi ? [] : answer.indices,
      isOtherSelected: selected,
    }))
  }

  const setOtherText = (questionIndex: number, text: string, multi: boolean) => {
    const isOtherSelected = text.length > 0
    updateAnswer(questionIndex, (answer) => ({
      ...answer,
      indices: isOtherSelected && !multi ? [] : answer.indices,
      isOtherSelected,
      otherText: text,
    }))
  }

  const answeredCount = questions.filter((_, index) => isAnswered(answers[index])).length
  const allAnswered = questions.length > 0 && answeredCount === questions.length
  const isMultiple = questions.length > 1
  const title = isMultiple
    ? t('tools.ask.title')
    : questions[0]?.header?.trim() || t('tools.ask.title')

  const respond = async (result: ClaudeToolResult) => {
    if (isSubmitting) return
    setIsSubmitting(true)
    setSubmitError(null)
    try {
      await onRespond(request.toolUseId, result)
    } catch {
      setSubmitError(t('tools.ask.respondFailed'))
    } finally {
      setIsSubmitting(false)
    }
  }

  const submit = () => {
    if (!allAnswered || !request.input || typeof request.input !== 'object') return
    const answerMap: Record<string, string> = {}
    let otherResponse: string | undefined
    questions.forEach((question, questionIndex) => {
      const answer = answers[questionIndex]
      if (!answer || !question.question) return
      const values = answer.indices
        .map((index) => question.options?.[index]?.label)
        .filter((value): value is string => Boolean(value))
      const text = answer.otherText.trim()
      if (answer.isOtherSelected && text) {
        values.push(text)
        otherResponse ??= text
      }
      answerMap[question.question] = values.join(', ')
    })
    void respond({
      behavior: 'allow',
      updatedInput: {
        ...(request.input as Record<string, unknown>),
        answers: answerMap,
        ...(otherResponse ? { response: otherResponse } : {}),
      },
    })
  }

  const dismiss = () => {
    void respond({ behavior: 'deny', message: t('tools.ask.cancelledMessage') })
  }

  return (
    <Card className="max-h-[calc(100vh-8rem)] min-h-0 gap-0 overflow-hidden rounded-2xl border-border/80 py-0 shadow-popover">
      <CardHeader className="flex flex-row items-center gap-2 px-3 py-3">
        <MessageCircleQuestion className="size-4 shrink-0 text-primary" />
        <CardTitle className="min-w-0 flex-1 truncate text-sm font-medium">{title}</CardTitle>
        {isMultiple ? (
          <span className="shrink-0 text-xs text-foreground-subtlest">
            {answeredCount} / {questions.length}
          </span>
        ) : null}
      </CardHeader>

      <CardContent className="flex max-h-[360px] min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3">
        {questions.map((question, questionIndex) => (
          <QuestionRow
            answer={answers[questionIndex]}
            index={questionIndex}
            isMultiple={isMultiple}
            key={questionIndex}
            question={question}
            onToggleOption={(optionIndex) =>
              toggleOption(questionIndex, optionIndex, Boolean(question.multiSelect))
            }
            onOtherSelectionChange={(selected) =>
              setOtherSelected(questionIndex, selected, Boolean(question.multiSelect))
            }
            onOtherTextChange={(text) =>
              setOtherText(questionIndex, text, Boolean(question.multiSelect))
            }
          />
        ))}
      </CardContent>

      <CardFooter className="justify-end gap-2 px-3 py-3">
        {submitError ? <FieldError className="mr-auto">{submitError}</FieldError> : null}
        <Button disabled={isSubmitting} type="button" variant="secondary" onClick={dismiss}>
          {t('tools.ask.cancel')}
        </Button>
        <Button disabled={!allAnswered || isSubmitting} type="button" onClick={submit}>
          {isSubmitting ? <Spinner data-icon="inline-start" /> : <Check data-icon="inline-start" />}
          {t('tools.ask.submit')}
        </Button>
      </CardFooter>
    </Card>
  )
}

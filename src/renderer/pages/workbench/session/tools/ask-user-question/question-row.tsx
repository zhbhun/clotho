import type { TFunction } from 'i18next'
import { useId } from 'react'
import { useTranslation } from 'react-i18next'

import { Checkbox } from '@/shadcn/checkbox'
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSet,
  FieldTitle,
} from '@/shadcn/field'
import { Input } from '@/shadcn/input'
import { RadioGroup, RadioGroupItem } from '@/shadcn/radio-group'

interface AskOption {
  label?: string
  description?: string
}

export interface AskQuestion {
  question?: string
  header?: string
  options?: AskOption[]
  multiSelect?: boolean
}

export type Answer = {
  indices: number[]
  isOtherSelected: boolean
  otherText: string
}

export function QuestionRow({
  question,
  answer,
  index,
  isMultiple,
  onToggleOption,
  onOtherSelectionChange,
  onOtherTextChange,
}: {
  question: AskQuestion
  answer: Answer | undefined
  index: number
  isMultiple: boolean
  onToggleOption: (optionIndex: number) => void
  onOtherSelectionChange: (selected: boolean) => void
  onOtherTextChange: (text: string) => void
}) {
  const { t } = useTranslation()
  const fieldId = useId()
  const selectedIndices = new Set(answer?.indices ?? [])
  const otherText = answer?.otherText ?? ''
  const usingOther = answer?.isOtherSelected ?? false
  const hasQuestionDescription = isMultiple && Boolean(question.question)

  return (
    <FieldSet className="gap-0!">
      <FieldLegend className={hasQuestionDescription ? 'mb-1' : undefined}>
        {isMultiple ? `${index + 1}. ${question.header?.trim() ?? ''}` : question.question}
      </FieldLegend>
      {hasQuestionDescription ? (
        <FieldDescription className="mt-0! mb-2">{question.question}</FieldDescription>
      ) : null}

      {question.multiSelect ? (
        <FieldGroup className="gap-1!" data-slot="checkbox-group">
          {question.options?.map((option, optionIndex) => (
            <OptionField
              checked={selectedIndices.has(optionIndex)}
              control="checkbox"
              fieldId={fieldId}
              key={optionIndex}
              option={option}
              optionIndex={optionIndex}
              onToggle={onToggleOption}
            />
          ))}
          <OtherField
            control="checkbox"
            fieldId={fieldId}
            text={otherText}
            usingOther={usingOther}
            onSelectionChange={onOtherSelectionChange}
            onTextChange={onOtherTextChange}
            t={t}
          />
        </FieldGroup>
      ) : (
        <RadioGroup
          className="gap-1"
          value={
            usingOther ? 'other' : selectedIndices.size ? `option-${[...selectedIndices][0]}` : ''
          }
          onValueChange={(value) => {
            if (value === 'other') onOtherSelectionChange(true)
            else onToggleOption(Number(value.replace('option-', '')))
          }}
        >
          {question.options?.map((option, optionIndex) => (
            <OptionField
              checked={selectedIndices.has(optionIndex)}
              control="radio"
              fieldId={fieldId}
              key={optionIndex}
              option={option}
              optionIndex={optionIndex}
              onToggle={onToggleOption}
            />
          ))}
          <OtherField
            control="radio"
            fieldId={fieldId}
            text={otherText}
            usingOther={usingOther}
            onSelectionChange={onOtherSelectionChange}
            onTextChange={onOtherTextChange}
            t={t}
          />
        </RadioGroup>
      )}
    </FieldSet>
  )
}

function OptionField({
  option,
  optionIndex,
  fieldId,
  checked,
  control,
  onToggle,
}: {
  option: AskOption
  optionIndex: number
  fieldId: string
  checked: boolean
  control: 'radio' | 'checkbox'
  onToggle: (optionIndex: number) => void
}) {
  const id = `${fieldId}-option-${optionIndex}`
  return (
    <FieldLabel htmlFor={id}>
      <Field orientation="horizontal">
        {control === 'radio' ? (
          <RadioGroupItem id={id} value={`option-${optionIndex}`} />
        ) : (
          <Checkbox checked={checked} id={id} onCheckedChange={() => onToggle(optionIndex)} />
        )}
        <FieldContent>
          <FieldTitle>{option.label}</FieldTitle>
          {option.description ? <FieldDescription>{option.description}</FieldDescription> : null}
        </FieldContent>
      </Field>
    </FieldLabel>
  )
}

function OtherField({
  control,
  fieldId,
  text,
  usingOther,
  onSelectionChange,
  onTextChange,
  t,
}: {
  control: 'radio' | 'checkbox'
  fieldId: string
  text: string
  usingOther: boolean
  onSelectionChange: (selected: boolean) => void
  onTextChange: (text: string) => void
  t: TFunction
}) {
  const id = `${fieldId}-other`
  return (
    <Field orientation="horizontal">
      {control === 'radio' ? (
        <RadioGroupItem aria-label={t('tools.ask.otherCustomAnswer')} id={id} value="other" />
      ) : (
        <Checkbox
          aria-label={t('tools.ask.otherCustomAnswer')}
          checked={usingOther}
          id={id}
          onCheckedChange={(checked) => onSelectionChange(checked === true)}
        />
      )}
      <Input
        aria-label={t('tools.ask.customAnswer')}
        placeholder={t('tools.ask.otherCustomAnswer')}
        value={text}
        onChange={(event) => onTextChange(event.target.value)}
        onFocus={() => onSelectionChange(true)}
      />
    </Field>
  )
}

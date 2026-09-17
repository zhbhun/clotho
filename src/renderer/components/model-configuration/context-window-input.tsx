import { useTranslation } from 'react-i18next'

import {
  Combobox,
  ComboboxContent,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
} from '@/shadcn/combobox'
import { Field, FieldDescription } from '@/shadcn/field'

const CONTEXT_PRESETS = ['10', '200', '250', '300', '1000']
const TOKENS_PER_K = 1000

export function ContextWindowInput({
  className,
  label,
  value,
  onChange,
}: {
  /** Extra classes for the input group; used to flush the box inside table rows. */
  className?: string
  label: string
  value: number
  onChange: (tokens: number) => void
}) {
  const { t } = useTranslation()
  const isInvalid = !Number.isSafeInteger(value) || value <= 0
  // Keep legacy token counts intact until the user explicitly edits this field.
  const inputValue = isInvalid ? '' : String(Math.max(1, Math.floor(value / TOKENS_PER_K)))
  const hasExactTokenHint = !isInvalid && value % TOKENS_PER_K !== 0

  return (
    <Field className="gap-1" data-invalid={isInvalid}>
      <Combobox
        items={CONTEXT_PRESETS}
        value={inputValue || null}
        inputValue={inputValue}
        onInputValueChange={(next, details) => {
          // Ignore selection synchronisation on focus/blur: it must not round legacy values.
          if (details.reason !== 'input-change' && details.reason !== 'item-press') return
          if (next !== '' && !/^[1-9]\d*$/.test(next)) {
            details.cancel()
            return
          }
          const tokens = Number(next) * TOKENS_PER_K
          if (!Number.isSafeInteger(tokens)) {
            details.cancel()
            return
          }
          onChange(tokens)
        }}
      >
        <ComboboxInput
          aria-label={label}
          aria-invalid={isInvalid}
          className={className}
          inputMode="numeric"
          pattern="[1-9][0-9]*"
          placeholder="200"
          showTrigger={false}
        />
        <ComboboxContent className="data-empty:hidden">
          <ComboboxList>
            {(preset: string) => (
              <ComboboxItem key={preset} value={preset}>
                {preset === '1000' ? '1M' : `${preset}K`}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      {hasExactTokenHint ? (
        <FieldDescription>
          {t('settings.provider.modelContextExact', { tokens: value })}
        </FieldDescription>
      ) : null}
    </Field>
  )
}

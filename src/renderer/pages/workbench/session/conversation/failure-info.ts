export type FailureInfo = {
  status: number | null
  /** 'rate_limit' | 'unrecognized_model' | 'overloaded' | ... */
  kind?: string
  /** Involved model id, when the failure names one (e.g. unrecognized_model). */
  model?: string
  /** Human-readable failure text with provider request ids stripped. */
  detail: string
}

/** Provider request ids are long hex tokens in trailing brackets: [20260920170629c02c95b100804c43]. */
const REQUEST_ID_SEGMENT = /\[[0-9a-f]{16,}\]/gi
/** Provider error codes are numeric bracket segments: [1310]. */
const NUMERIC_CODE_SEGMENT = /\[\d+\]/g

/** Strip machine-only bracket segments (request ids, numeric codes) from provider error text. */
export function cleanProviderErrorText(text: string): string {
  return (
    text
      .replace(REQUEST_ID_SEGMENT, '')
      .replace(NUMERIC_CODE_SEGMENT, '')
      // Providers wrap the human message itself in brackets: [1310][您已达到…] → 您已达到…
      .replace(/\[([^[\]]+)\]/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim()
  )
}

const API_REJECTED_PATTERN = /^API Error: Request rejected \((\d+)\)\s*·\s*([\s\S]*)$/
const UNRECOGNIZED_MODEL_PATTERN = /\[claude-code:unrecognized_model\]\s*(\{[^}]*\})?/

/**
 * Reduce a raw turn-failure message (assistant error frame text or the
 * process-exit stderr blob) to a structured, displayable form.
 */
export function parseFailureMessage(raw: string): FailureInfo {
  const rejected = raw.trim().match(API_REJECTED_PATTERN)
  if (rejected) {
    const status = Number(rejected[1])
    return {
      status,
      kind: status === 429 ? 'rate_limit' : undefined,
      detail: cleanProviderErrorText(rejected[2]) || raw.trim(),
    }
  }

  const unrecognized = raw.match(UNRECOGNIZED_MODEL_PATTERN)
  if (unrecognized) {
    let model: string | undefined
    if (unrecognized[1]) {
      try {
        const parsed = JSON.parse(unrecognized[1]) as Record<string, unknown>
        if (typeof parsed.model === 'string') model = parsed.model
      } catch {
        // Keep the raw detail when the marker payload is not JSON.
      }
    }
    return {
      status: null,
      kind: 'unrecognized_model',
      model,
      detail: model ?? raw.trim(),
    }
  }

  return { status: null, detail: raw.trim() }
}

export type FailureTitleKey =
  | 'workbench.conversation.apiFailure.title.rateLimit'
  | 'workbench.conversation.apiFailure.title.overloaded'
  | 'workbench.conversation.apiFailure.title.auth'
  | 'workbench.conversation.apiFailure.title.unrecognizedModel'
  | 'workbench.conversation.apiFailure.title.generic'

/** i18n key for the error-card title, shared by the retrying and the final failure card. */
export function failureTitleKey(status: number | null, kind?: string): FailureTitleKey {
  if (kind === 'unrecognized_model')
    return 'workbench.conversation.apiFailure.title.unrecognizedModel'
  if (kind === 'rate_limit' || status === 429)
    return 'workbench.conversation.apiFailure.title.rateLimit'
  if (kind === 'authentication_failed' || status === 401 || status === 403) {
    return 'workbench.conversation.apiFailure.title.auth'
  }
  if (kind === 'overloaded' || status === 503 || status === 529) {
    return 'workbench.conversation.apiFailure.title.overloaded'
  }
  return 'workbench.conversation.apiFailure.title.generic'
}

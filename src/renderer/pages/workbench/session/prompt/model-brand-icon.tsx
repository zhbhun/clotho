import BaichuanIcon from '@thesvg/react/baichuan'
import ClaudeIcon from '@thesvg/react/claude'
import DeepseekIcon from '@thesvg/react/deepseek'
import DoubaoIcon from '@thesvg/react/doubao'
import GeminiIcon from '@thesvg/react/gemini'
import GrokIcon from '@thesvg/react/grok'
import HunyuanIcon from '@thesvg/react/hunyuan'
import MetaIcon from '@thesvg/react/meta'
import MinimaxIcon from '@thesvg/react/minimax'
import MistralIcon from '@thesvg/react/mistral'
import MoonshotIcon from '@thesvg/react/moonshot'
import OpenaiChatgptIcon from '@thesvg/react/openai-chatgpt'
import QwenIcon from '@thesvg/react/qwen'
import StepfunIcon from '@thesvg/react/stepfun'
import ZhipuIcon from '@thesvg/react/zhipu'
import { Brain } from 'lucide-react'
import { createElement } from 'react'
import type { ComponentType, SVGProps } from 'react'

import { providerPresets } from '../../../../components/model-configuration/provider-presets'
import type { ClaudeModelInfo, ModelProvider } from '../../../../services/claude/claude'

// Not all generated icons declare a `mono` variant; passing it to those that
// lack one simply renders the default form.
type BrandIcon = ComponentType<SVGProps<SVGSVGElement>>

interface BrandMapping {
  icon: BrandIcon
  keywords: string[]
}

const CLAUDE_SHORTHAND_PATTERN = /\b(?:claude|sonnet|opus|haiku)\b/i

/** Keyword match order decides precedence; keep more specific brands first. */
const BRAND_MAPPINGS: BrandMapping[] = [
  { icon: ClaudeIcon, keywords: ['claude', 'sonnet', 'opus', 'haiku'] },
  { icon: OpenaiChatgptIcon, keywords: ['gpt', 'chatgpt', 'openai', 'codex'] },
  { icon: ZhipuIcon, keywords: ['glm', 'zhipu', 'chatglm'] },
  { icon: MoonshotIcon, keywords: ['kimi', 'moonshot'] },
  { icon: DeepseekIcon, keywords: ['deepseek'] },
  { icon: DoubaoIcon, keywords: ['doubao'] },
  { icon: MinimaxIcon, keywords: ['minimax', 'abab'] },
  { icon: QwenIcon, keywords: ['qwen', 'tongyi'] },
  { icon: StepfunIcon, keywords: ['stepfun'] },
  { icon: GeminiIcon, keywords: ['gemini', 'bard'] },
  { icon: GrokIcon, keywords: ['grok'] },
  { icon: MetaIcon, keywords: ['llama'] },
  { icon: MistralIcon, keywords: ['mistral', 'mixtral'] },
  { icon: HunyuanIcon, keywords: ['hunyuan'] },
  { icon: BaichuanIcon, keywords: ['baichuan'] },
]

function resolveBrand(source: string): BrandMapping | null {
  const normalized = CLAUDE_SHORTHAND_PATTERN.test(source.trim())
    ? `claude ${source.trim()}`
    : source.trim()

  for (const mapping of BRAND_MAPPINGS) {
    if (mapping.keywords.some((keyword) => new RegExp(keyword, 'i').test(normalized))) {
      return mapping
    }
  }
  return null
}

// Preset provider groups inherit the preset's own brand for models whose
// names carry none (e.g. Kimi K3); custom providers and multi-vendor
// aggregator presets stay on the generic fallback.
function resolvePresetBrand(provider: ModelProvider): BrandMapping | null {
  const preset = providerPresets.find((candidate) => candidate.id === provider.presetId)
  return preset ? resolveBrand(`${preset.id} ${preset.name}`) : null
}

export function resolveModelIconModel(
  value: string,
  displayName: string,
  provider?: ModelProvider,
): BrandMapping | null {
  for (const source of [displayName, value]) {
    const resolved = resolveBrand(source)
    if (resolved) return resolved
  }

  return provider ? resolvePresetBrand(provider) : null
}

export function resolveSelectedModelIconOption(
  model: string,
  options: ClaudeModelInfo[],
  providerId?: string,
): ClaudeModelInfo | undefined {
  const selectedOption = options.find(
    (option) => option.value === model && (!providerId || option.providerId === providerId),
  )
  if (!selectedOption || selectedOption.value !== 'default') return selectedOption

  const description = selectedOption.description.trim().toLowerCase()

  const concreteOptions = options.filter((option) => option.value !== 'default')
  const valueMatch = concreteOptions.find((option) =>
    description.includes(option.value.trim().toLowerCase()),
  )
  if (valueMatch) return valueMatch

  return (
    concreteOptions.find((option) =>
      description.includes(option.displayName.trim().toLowerCase()),
    ) ?? selectedOption
  )
}

export function getVisibleModelOptions(options: ClaudeModelInfo[]): ClaudeModelInfo[] {
  const optionsByProviderAndDisplayName = new Map<string, ClaudeModelInfo>()

  for (const option of options) {
    if (option.value === 'default') continue

    const displayName = option.displayName.trim().toLowerCase()
    const key = `${option.providerId ?? ''}\0${displayName}`
    const currentOption = optionsByProviderAndDisplayName.get(key)
    const valueMatchesDisplayName = option.value.trim().toLowerCase() === displayName
    const currentValueMatchesDisplayName = currentOption?.value.trim().toLowerCase() === displayName

    if (!currentOption || (valueMatchesDisplayName && !currentValueMatchesDisplayName)) {
      optionsByProviderAndDisplayName.set(key, option)
    }
  }

  return [...optionsByProviderAndDisplayName.values()]
}

export function groupModelOptionsByProvider(
  options: ClaudeModelInfo[],
  otherProviderName = 'Other',
) {
  const groups = new Map<
    string,
    { providerId: string; providerName: string; items: ClaudeModelInfo[] }
  >()
  for (const option of options) {
    const providerId = option.providerId?.trim() ?? ''
    const providerName = option.providerName?.trim() || option.providerId || otherProviderName
    const group = groups.get(providerId) ?? { providerId, providerName, items: [] }
    group.items.push(option)
    groups.set(providerId, group)
  }
  const orderedGroups = [...groups.values()]
  const claudeGroup = groups.get('claude')
  return claudeGroup
    ? [claudeGroup, ...orderedGroups.filter((group) => group.providerId !== 'claude')]
    : orderedGroups
}

export function ModelBrandIcon({
  value,
  displayName,
  provider,
}: {
  value: string
  displayName: string
  provider?: ModelProvider
}) {
  const brand = resolveModelIconModel(value, displayName, provider)
  const BrandIcon = brand?.icon

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center"
      data-icon="inline-start"
      data-model-icon={BrandIcon ? 'brand' : 'fallback'}
      data-slot="model-brand-icon"
    >
      {BrandIcon ? (
        createElement(BrandIcon, {
          className: 'size-3',
          variant: 'mono',
        } as SVGProps<SVGSVGElement>)
      ) : (
        <Brain className="size-3" />
      )}
    </span>
  )
}

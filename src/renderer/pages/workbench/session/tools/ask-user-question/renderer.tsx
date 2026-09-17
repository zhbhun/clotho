import { MessageCircleQuestion } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ToolItemContext, ToolRenderer } from '../shared/types'
import { AskResultCard } from './result-card'

const ASK_USER_QUESTION_ICON = MessageCircleQuestion
const ASK_USER_QUESTION_DESCRIPTION = 'tools.askUserQuestion.description'

export const askUserQuestionRenderer: ToolRenderer = {
  icon: ASK_USER_QUESTION_ICON,
  label: 'tools.AskUserQuestion.label',
  description: ASK_USER_QUESTION_DESCRIPTION,
  summary: () => '',
  inputView: () => null,
  hasBody: () => false,
  itemView: (context) => <AskUserQuestionItem {...context} />,
}

function AskUserQuestionItem({
  input,
  result,
  toolUseResult,
  isError,
  isRunning,
}: ToolItemContext) {
  const { t } = useTranslation()
  return (
    <AskResultCard
      icon={ASK_USER_QUESTION_ICON}
      description={t(ASK_USER_QUESTION_DESCRIPTION)}
      input={input}
      result={result}
      toolUseResult={toolUseResult}
      isError={isError}
      isRunning={isRunning}
    />
  )
}

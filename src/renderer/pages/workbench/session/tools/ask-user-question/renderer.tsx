import { MessageCircleQuestion } from 'lucide-react'

import type { ToolRenderer } from '../shared/types'
import { AskQuestionCards, askHeadline, askQuestions, extractAnswerMap } from './result-card'

export const askUserQuestionRenderer: ToolRenderer = {
  icon: MessageCircleQuestion,
  label: 'tools.AskUserQuestion.label',
  description: 'tools.askUserQuestion.description',
  summary: (input, _result, toolUseResult, t) =>
    t ? askHeadline(askQuestions(input, toolUseResult), t) : '',
  inputView: () => null,
  hasBody: (input, _result, _images, toolUseResult) =>
    askQuestions(input, toolUseResult).length > 0,
  bodyItemView: ({ input, result, toolUseResult }) => (
    <AskQuestionCards
      questions={askQuestions(input, toolUseResult)}
      answers={extractAnswerMap(toolUseResult, result)}
    />
  ),
}

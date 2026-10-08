import { ListTodo } from 'lucide-react'

import { extractTodoItems } from '../../../../../services/claude/todo'
import type { ToolRenderer } from '../shared/types'
import { TodoSummary } from './summary-card'

export const todoRenderer: ToolRenderer = {
  icon: ListTodo,
  label: 'tools.Todo.label',
  description: 'tools.todo.description',
  summary: (input) => {
    const todos = extractTodoItems(input)
    if (!todos.length) return ''
    const completed = todos.filter((todo) => todo.status === 'completed').length
    return `${completed}/${todos.length}`
  },
  inputView: () => null,
  hasBody: (input) => extractTodoItems(input).length > 0,
  bodyItemView: ({ input }) => {
    const todos = extractTodoItems(input)
    return todos.length ? <TodoSummary todos={todos} /> : null
  },
}

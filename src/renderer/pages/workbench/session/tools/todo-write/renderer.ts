import { ListTodo } from 'lucide-react'

import type { ToolRenderer } from '../shared/types'

export const todoRenderer: ToolRenderer = {
  icon: ListTodo,
  label: 'tools.Todo.label',
  description: 'tools.todo.description',
  summary: (input, _result, _toolUseResult, t) => {
    const todos = (input as { todos?: unknown[] })?.todos
    return Array.isArray(todos)
      ? (t?.('tools.task.count', { count: todos.length }) ?? '')
      : (t?.('tools.todo.empty') ?? '')
  },
  inputView: () => null,
}

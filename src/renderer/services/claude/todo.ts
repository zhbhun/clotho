export interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
  activeForm?: string
}

export interface TodoStats {
  total: number
  completed: number
  hasIncomplete: boolean
  pct: number
}

export function isTodoWriteToolName(name?: string): boolean {
  return name === 'TodoWrite' || name === 'TodoWriteTool'
}

export function extractTodoItems(input: unknown): TodoItem[] {
  const todos = (input as { todos?: unknown } | undefined)?.todos
  if (!Array.isArray(todos)) return []

  return todos.filter(isTodoItem).map((todo) => ({
    content: todo.content,
    status: todo.status,
    activeForm: todo.activeForm,
  }))
}

export function todoStats(todos: TodoItem[]): TodoStats {
  const total = todos.length
  const completed = todos.filter((todo) => todo.status === 'completed').length
  return {
    total,
    completed,
    hasIncomplete: completed < total,
    pct: total ? Math.round((completed / total) * 100) : 0,
  }
}

function isTodoItem(value: unknown): value is TodoItem {
  if (!value || typeof value !== 'object') return false
  const item = value as Record<string, unknown>
  return (
    typeof item.content === 'string' &&
    (item.status === 'pending' || item.status === 'in_progress' || item.status === 'completed') &&
    (item.activeForm === undefined || typeof item.activeForm === 'string')
  )
}

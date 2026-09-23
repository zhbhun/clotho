import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Toaster } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import type { ClaudeProject } from '../../../services/claude/claude'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { ProjectSettings } from './project-settings'

const alpha: ClaudeProject = {
  id: 'alpha',
  name: 'Alpha',
  path: '/workspace/alpha',
  sessions: [],
  created_at: 10,
}

function renderWithShortcuts(element: ReactElement) {
  return render(
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>{element}</ShortcutRuntimeProvider>,
  )
}

describe('ProjectSettings', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('zh-CN')
  })

  it('requires confirmation before removing a project', async () => {
    const user = userEvent.setup()
    const onRemoveProject = vi.fn(async () => {})

    renderWithShortcuts(
      <TooltipProvider>
        <ProjectSettings
          projects={[alpha]}
          onCreateProject={vi.fn()}
          onEditProject={vi.fn()}
          onRemoveProject={onRemoveProject}
        />
      </TooltipProvider>,
    )

    await user.click(screen.getByRole('button', { name: '移除 Alpha' }))
    let dialog = screen.getByRole('alertdialog', { name: '移除项目？' })
    expect(within(dialog).getByText('/workspace/alpha')).toBeInTheDocument()
    expect(within(dialog).getByText(/不会删除本地文件和 Claude 对话/)).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '取消' }))
    expect(onRemoveProject).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '移除 Alpha' }))
    dialog = screen.getByRole('alertdialog', { name: '移除项目？' })
    await user.click(within(dialog).getByRole('button', { name: '移除项目' }))

    await waitFor(() => expect(onRemoveProject).toHaveBeenCalledWith(alpha))
  })

  it('keeps the project list visible while a refresh reloads the catalog', () => {
    renderWithShortcuts(
      <TooltipProvider>
        <ProjectSettings
          isLoading
          projects={[alpha]}
          onCreateProject={vi.fn()}
          onEditProject={vi.fn()}
          onRemoveProject={vi.fn()}
        />
      </TooltipProvider>,
    )

    expect(screen.getByText('Alpha')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '添加项目' })).toBeInTheDocument()
  })

  it('keeps the confirmation open when removal fails', async () => {
    const user = userEvent.setup()

    renderWithShortcuts(
      <Toaster>
        <TooltipProvider>
          <ProjectSettings
            projects={[alpha]}
            onCreateProject={vi.fn()}
            onEditProject={vi.fn()}
            onRemoveProject={vi.fn(async () => {
              throw new Error('Unable to write project data')
            })}
          />
        </TooltipProvider>
      </Toaster>,
    )

    await user.click(screen.getByRole('button', { name: '移除 Alpha' }))
    const dialog = screen.getByRole('alertdialog', { name: '移除项目？' })
    await user.click(within(dialog).getByRole('button', { name: '移除项目' }))

    expect(await screen.findByText('项目移除失败，请重试')).toBeInTheDocument()
    expect(dialog).toBeInTheDocument()
  })
})

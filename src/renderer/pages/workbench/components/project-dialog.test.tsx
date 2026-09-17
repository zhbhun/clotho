import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { type ReactElement, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { Button } from '@/shadcn/button'
import { Toaster, toast } from '@/shadcn/toast'
import { TooltipProvider } from '@/shadcn/tooltip'

import { appI18n } from '../../../i18n/runtime'
import type { ClaudeProject } from '../../../services/claude/claude'
import { ShortcutRuntimeProvider, shortcutRuntime } from '../../../services/shortcuts/runtime'
import { ProjectSwitchDialog } from '../session/project-switcher'
import { ProjectDialog } from './project-dialog'

const claudeMock = vi.hoisted(() => ({
  createProject: vi.fn(),
  selectProjectFolder: vi.fn(),
  updateProject: vi.fn(),
}))
const imageMock = vi.hoisted(() => vi.fn())

vi.mock('../../../services/claude/claude', async (importOriginal) => ({
  ...(await importOriginal()),
  claude: claudeMock,
}))

vi.mock('../../../utils/project-image', () => ({
  projectIconDataUrlFromFile: imageMock,
}))

const project: ClaudeProject = {
  id: 'project-1',
  path: '/workspace/alpha',
  name: 'Alpha custom',
  sessions: [],
  created_at: 10,
}

function renderWithShortcuts(element: ReactElement) {
  return render(
    <ShortcutRuntimeProvider runtime={shortcutRuntime}>{element}</ShortcutRuntimeProvider>,
  )
}

function SwitcherFlow() {
  const [isSwitcherOpen, setSwitcherOpen] = useState(false)
  const [isDialogOpen, setDialogOpen] = useState(false)

  return (
    <>
      <div className="session-tab">
        <button tabIndex={-1} data-testid="session-tab" type="button">
          代码审查剪辑节点下载逻辑调整
        </button>
      </div>
      <ProjectSwitchDialog
        open={isSwitcherOpen}
        projectMode="home"
        projects={[]}
        trigger={
          <Button data-testid="switcher-trigger" type="button">
            切换项目
          </Button>
        }
        onAddProject={() => {
          setDialogOpen(true)
          setSwitcherOpen(false)
        }}
        onOpenChange={setSwitcherOpen}
        onSelectProject={vi.fn()}
      />
      <ProjectDialog
        open={isDialogOpen}
        onOpenChange={(open) => !open && setDialogOpen(false)}
        onSaved={vi.fn()}
      />
    </>
  )
}

describe('ProjectDialog', () => {
  beforeEach(async () => {
    await appI18n.changeLanguage('zh-CN')
    vi.clearAllMocks()
    toast.close()
    imageMock.mockResolvedValue('data:image/png;base64,cG5n')
    claudeMock.createProject.mockImplementation(async (params) => ({
      id: 'created-project',
      sessions: [],
      created_at: 10,
      ...params,
    }))
    claudeMock.updateProject.mockImplementation(async (params) => ({
      ...project,
      name: params.name,
      icon: params.icon ?? undefined,
    }))
  })

  it('returns to the focus origin from before the switcher opened once both dialogs close', async () => {
    renderWithShortcuts(
      <TooltipProvider>
        <SwitcherFlow />
      </TooltipProvider>,
    )

    // The session tab holds focus before the switcher opens. The switcher and
    // the project dialog close together, so the dialog must fall back to the
    // flow's origin instead of its own (already unmounted) origin. WebKit
    // clicks do not move focus, so the clicks here use fireEvent on purpose.
    const sessionTab = screen.getByTestId('session-tab')
    sessionTab.focus()
    expect(document.activeElement).toBe(sessionTab)

    fireEvent.click(screen.getByTestId('switcher-trigger'))
    const switcherDialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(switcherDialog.contains(document.activeElement)).toBe(true)
    })

    fireEvent.click(within(switcherDialog).getByRole('button', { name: '添加项目' }))

    const projectDialog = await screen.findByRole('dialog', { name: '添加项目' })
    await waitFor(() => {
      expect(projectDialog.contains(document.activeElement)).toBe(true)
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '添加项目' })).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(sessionTab)
  })

  it('leaves focus on the window when the switcher flow starts without any focus', async () => {
    renderWithShortcuts(
      <TooltipProvider>
        <SwitcherFlow />
      </TooltipProvider>,
    )

    // Nothing is focused when the switcher opens: the dialog has no origin of
    // its own and there is no flow origin to inherit, so dismissal must not
    // resurrect a focus target.
    fireEvent.click(screen.getByTestId('switcher-trigger'))
    const switcherDialog = await screen.findByRole('dialog')
    await waitFor(() => {
      expect(switcherDialog.contains(document.activeElement)).toBe(true)
    })

    fireEvent.click(within(switcherDialog).getByRole('button', { name: '添加项目' }))

    const projectDialog = await screen.findByRole('dialog', { name: '添加项目' })
    await waitFor(() => {
      expect(projectDialog.contains(document.activeElement)).toBe(true)
    })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '添加项目' })).not.toBeInTheDocument()
    })
    expect(document.activeElement).toBe(document.body)
  })

  it('keeps the file input mounted when the picker closes before the image selection returns', async () => {
    let resolveImage!: (dataUrl: string) => void
    imageMock.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveImage = resolve
      }),
    )
    const user = userEvent.setup()

    renderWithShortcuts(<ProjectDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '选择项目图标' }))
    const imageInput = screen.getByLabelText('选择自定义图标')
    await user.click(screen.getByRole('button', { name: '完成' }))
    expect(imageInput).toBeInTheDocument()

    fireEvent.change(imageInput, {
      target: { files: [new File(['image'], 'icon.png', { type: 'image/png' })] },
    })

    expect(screen.getByRole('button', { name: '选择项目图标' })).toBeDisabled()
    resolveImage('data:image/png;base64,cG5n')
    await waitFor(() =>
      expect(document.querySelector('[data-slot="project-icon"] img')).toHaveAttribute(
        'src',
        'data:image/png;base64,cG5n',
      ),
    )
  })

  it('shows the selected folder path after the picker returns', async () => {
    const user = userEvent.setup()
    claudeMock.selectProjectFolder.mockResolvedValue('/workspace/alpha')

    renderWithShortcuts(<ProjectDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '选择项目文件夹' }))

    expect(screen.getByText('/workspace/alpha')).toBeInTheDocument()
  })

  it('fills the folder name once without overwriting a manually edited name', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()
    claudeMock.selectProjectFolder
      .mockResolvedValueOnce('/workspace/alpha')
      .mockResolvedValueOnce('/workspace/beta')

    renderWithShortcuts(<ProjectDialog open onOpenChange={vi.fn()} onSaved={onSaved} />)

    await user.click(screen.getByRole('button', { name: '选择项目文件夹' }))
    const nameInput = screen.getByRole('textbox', { name: '项目名称' })
    expect(nameInput).toHaveValue('alpha')

    await user.clear(nameInput)
    await user.type(nameInput, 'My workspace')
    await user.click(screen.getByRole('button', { name: '选择项目文件夹' }))
    expect(nameInput).toHaveValue('My workspace')

    await user.click(screen.getByRole('button', { name: '添加项目' }))

    await waitFor(() =>
      expect(claudeMock.createProject).toHaveBeenCalledWith({
        path: '/workspace/beta',
        name: 'My workspace',
        icon: undefined,
        additionalDirectories: [],
      }),
    )
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ id: 'created-project' }))
  })

  it('stays open and surfaces a catalog refresh failure after saving', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    claudeMock.selectProjectFolder.mockResolvedValue('/workspace/alpha')

    renderWithShortcuts(
      <Toaster>
        <ProjectDialog
          open
          onOpenChange={onOpenChange}
          onSaved={vi.fn(async () => {
            throw new Error('Project list refresh failed')
          })}
        />
      </Toaster>,
    )

    await user.click(screen.getByRole('button', { name: '选择项目文件夹' }))
    await user.click(screen.getByRole('button', { name: '添加项目' }))

    expect(await screen.findByText('无法创建项目')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: '添加项目' })).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it('stays open when project creation fails', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    claudeMock.selectProjectFolder.mockResolvedValue('/workspace/alpha')
    claudeMock.createProject.mockRejectedValue(new Error('Project save failed'))

    renderWithShortcuts(
      <Toaster>
        <ProjectDialog open onOpenChange={onOpenChange} onSaved={vi.fn()} />
      </Toaster>,
    )

    await user.click(screen.getByRole('button', { name: '选择项目文件夹' }))
    await user.click(screen.getByRole('button', { name: '添加项目' }))

    expect(await screen.findByText('无法创建项目')).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })

  it.each([
    ['Project path does not exist', '项目路径不存在'],
    ['Project path must be a directory', '项目路径必须是文件夹'],
  ])(
    'shows the backend path validation failure "%s" below the folder field',
    async (error, copy) => {
      const user = userEvent.setup()
      claudeMock.selectProjectFolder.mockResolvedValue('/workspace/missing')
      claudeMock.createProject.mockRejectedValue(new Error(error))

      renderWithShortcuts(<ProjectDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} />)

      await user.click(screen.getByRole('button', { name: '选择项目文件夹' }))
      await user.click(screen.getByRole('button', { name: '添加项目' }))

      const message = await screen.findByText(copy)
      expect(message).toHaveAttribute('data-slot', 'field-error')
    },
  )

  it('edits project metadata while keeping its path read-only', async () => {
    const user = userEvent.setup()
    const onSaved = vi.fn()

    renderWithShortcuts(
      <ProjectDialog open project={project} onOpenChange={vi.fn()} onSaved={onSaved} />,
    )

    expect(screen.queryByText('更新项目名称和图标。')).not.toBeInTheDocument()
    const projectPath = screen.getByText('/workspace/alpha')
    expect(projectPath).toHaveClass(
      'truncate',
      'text-left',
      '[direction:rtl]',
      'text-foreground-subtlest',
    )
    expect(projectPath.parentElement).toHaveClass('border', 'border-input', 'rounded-md')
    expect(screen.queryByRole('button', { name: '更换项目文件夹' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
    const nameInput = screen.getByRole('textbox', { name: '项目名称' })
    await user.clear(nameInput)
    await user.type(nameInput, 'Alpha edited')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(
      () =>
        expect(claudeMock.updateProject).toHaveBeenCalledWith({
          projectId: 'project-1',
          name: 'Alpha edited',
          icon: null,
          additionalDirectories: [],
        }),
      { timeout: 3000 },
    )
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Alpha edited' }))
  })

  it('manages additional folders in the create dialog', async () => {
    const user = userEvent.setup()
    claudeMock.selectProjectFolder
      .mockResolvedValueOnce('/workspace/docs')
      .mockResolvedValueOnce('/workspace/assets')
      .mockResolvedValueOnce('/workspace/docs')
      .mockResolvedValueOnce('/workspace/alpha')
      .mockResolvedValueOnce('/workspace/alpha')

    renderWithShortcuts(<ProjectDialog open onOpenChange={vi.fn()} onSaved={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: '添加附加文件夹' }))
    expect(screen.getByText('/workspace/docs')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '添加附加文件夹' }))
    expect(screen.getByText('/workspace/assets')).toBeInTheDocument()

    // Duplicate picks are dropped silently.
    await user.click(screen.getByRole('button', { name: '添加附加文件夹' }))
    expect(screen.getAllByText('/workspace/docs')).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '移除文件夹 docs' }))
    expect(screen.queryByText('/workspace/docs')).not.toBeInTheDocument()

    // The project path itself is never added as an additional folder.
    await user.click(screen.getByRole('button', { name: '选择项目文件夹' }))
    await user.click(screen.getByRole('button', { name: '添加附加文件夹' }))
    expect(screen.getAllByRole('button', { name: /^移除文件夹/ })).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '添加项目' }))

    await waitFor(() =>
      expect(claudeMock.createProject).toHaveBeenCalledWith({
        path: '/workspace/alpha',
        name: 'alpha',
        icon: undefined,
        additionalDirectories: ['/workspace/assets'],
      }),
    )
  })

  it('prefills additional folders when editing a project', async () => {
    const user = userEvent.setup()
    const projectWithDirs: ClaudeProject = {
      ...project,
      additional_directories: ['/workspace/docs', '/workspace/assets'],
    }

    renderWithShortcuts(
      <ProjectDialog open project={projectWithDirs} onOpenChange={vi.fn()} onSaved={vi.fn()} />,
    )

    expect(screen.getByText('/workspace/docs')).toBeInTheDocument()
    expect(screen.getByText('/workspace/assets')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '移除文件夹 docs' }))
    expect(screen.queryByText('/workspace/docs')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(claudeMock.updateProject).toHaveBeenCalledWith({
        projectId: 'project-1',
        name: 'Alpha custom',
        icon: null,
        additionalDirectories: ['/workspace/assets'],
      }),
    )
  })
})

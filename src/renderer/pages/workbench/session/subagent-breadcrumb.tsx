import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/shadcn/breadcrumb'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../../../components/dropdown-menu'
import { type SessionSubagent, type SessionWorkflow, sortSessionItems } from './subagents'

type RootNavigationEntry =
  | { key: string; kind: 'agent'; createdAt: string; agent: SessionSubagent }
  | { key: string; kind: 'workflow'; createdAt: string; workflow: SessionWorkflow }

export function SubagentBreadcrumb({
  current,
  sessionTitle,
  subagents,
  workflows = [],
  onBack,
  onSelect,
}: {
  current: SessionSubagent
  sessionTitle: string
  subagents: SessionSubagent[]
  workflows?: SessionWorkflow[]
  onBack: () => void
  onSelect: (subagent: SessionSubagent) => void
}) {
  const currentWorkflow = workflows.find((workflow) =>
    workflow.agents.some((agent) => agent.toolUseId === current.toolUseId),
  )
  const workflowAgentIds = new Set(
    workflows.flatMap((workflow) => workflow.agents.map((agent) => agent.toolUseId)),
  )
  const rootEntries = sortSessionItems<RootNavigationEntry>([
    ...subagents
      .filter(
        (agent) =>
          !workflowAgentIds.has(agent.toolUseId) &&
          agent.agentType !== 'workflow-subagent' &&
          agent.spawnDepth <= 1,
      )
      .map((agent) => ({
        key: `agent:${agent.toolUseId}`,
        kind: 'agent' as const,
        createdAt: agent.createdAt,
        agent,
      })),
    ...workflows.map((workflow) => ({
      key: `workflow:${workflow.runId}`,
      kind: 'workflow' as const,
      createdAt: workflow.createdAt,
      workflow,
    })),
  ])
  const workflowAgents = sortSessionItems(currentWorkflow?.agents ?? [])

  return (
    <Breadcrumb className="py-3">
      <BreadcrumbList className="flex-nowrap">
        <BreadcrumbItem className="min-w-0">
          <BreadcrumbLink
            aria-label={sessionTitle}
            className="max-w-72 cursor-pointer truncate text-foreground-subtlest"
            onClick={onBack}
          >
            {sessionTitle}
          </BreadcrumbLink>
        </BreadcrumbItem>
        {currentWorkflow ? (
          <>
            <BreadcrumbSeparator />
            <BreadcrumbItem className="min-w-0">
              <DropdownMenu>
                <DropdownMenuTrigger
                  nativeButton={false}
                  render={<span className="min-w-0 max-w-72 cursor-pointer" />}
                >
                  <BreadcrumbLink
                    aria-label={`Workflow ${currentWorkflow.name}`}
                    className="flex min-w-0 items-center text-foreground-subtle"
                  >
                    <span className="truncate">Workflow {currentWorkflow.name}</span>
                  </BreadcrumbLink>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-72" glass>
                  <RootEntriesContent
                    currentToolUseId={current.toolUseId}
                    entries={rootEntries}
                    onSelect={onSelect}
                  />
                </DropdownMenuContent>
              </DropdownMenu>
            </BreadcrumbItem>
          </>
        ) : null}
        <BreadcrumbSeparator />
        <BreadcrumbItem className="min-w-0">
          <DropdownMenu>
            <DropdownMenuTrigger
              nativeButton={false}
              render={<span className="min-w-0 max-w-80 cursor-pointer" />}
            >
              <BreadcrumbPage
                aria-disabled={undefined}
                aria-label={current.description}
                className="flex min-w-0 items-center text-foreground-subtle"
              >
                <span className="truncate">{current.description}</span>
              </BreadcrumbPage>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-72" glass>
              {currentWorkflow ? (
                <DropdownMenuGroup>
                  <DropdownMenuRadioGroup
                    value={current.toolUseId}
                    onValueChange={(toolUseId) => {
                      const selected = workflowAgents.find(
                        (subagent) => subagent.toolUseId === toolUseId,
                      )
                      if (selected) onSelect(selected)
                    }}
                  >
                    <SubagentItems subagents={workflowAgents} />
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              ) : (
                <RootEntriesContent
                  currentToolUseId={current.toolUseId}
                  entries={rootEntries}
                  onSelect={onSelect}
                />
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </BreadcrumbItem>
      </BreadcrumbList>
    </Breadcrumb>
  )
}

function RootEntriesContent({
  currentToolUseId,
  entries,
  onSelect,
}: {
  currentToolUseId: string
  entries: RootNavigationEntry[]
  onSelect: (subagent: SessionSubagent) => void
}) {
  return (
    <DropdownMenuGroup>
      <DropdownMenuRadioGroup
        value={currentToolUseId}
        onValueChange={(toolUseId) => {
          const selected = entries.find(
            (entry) => entry.kind === 'agent' && entry.agent.toolUseId === toolUseId,
          )
          if (selected?.kind === 'agent') onSelect(selected.agent)
        }}
      >
        {entries.map((entry) =>
          entry.kind === 'agent' ? (
            <DropdownMenuRadioItem
              key={entry.key}
              aria-label={entry.agent.description}
              value={entry.agent.toolUseId}
            >
              <span className="min-w-0 flex-1 truncate">{entry.agent.description}</span>
            </DropdownMenuRadioItem>
          ) : (
            <WorkflowMenuItem
              key={entry.key}
              currentToolUseId={currentToolUseId}
              workflow={entry.workflow}
              onSelect={onSelect}
            />
          ),
        )}
      </DropdownMenuRadioGroup>
    </DropdownMenuGroup>
  )
}

function WorkflowMenuItem({
  currentToolUseId,
  workflow,
  onSelect,
}: {
  currentToolUseId: string
  workflow: SessionWorkflow
  onSelect: (subagent: SessionSubagent) => void
}) {
  const agents = sortSessionItems(workflow.agents)

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger aria-label={`Workflow ${workflow.name}`}>
        <span className="min-w-0 flex-1 truncate">Workflow {workflow.name}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="w-72" sideOffset={8}>
          <DropdownMenuGroup>
            <DropdownMenuRadioGroup
              value={currentToolUseId}
              onValueChange={(toolUseId) => {
                const selected = agents.find((agent) => agent.toolUseId === toolUseId)
                if (selected) onSelect(selected)
              }}
            >
              <SubagentItems subagents={agents} />
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}

function SubagentItems({ subagents }: { subagents: SessionSubagent[] }) {
  if (!subagents.length) return null

  return (
    <>
      {subagents.map((subagent) => (
        <DropdownMenuRadioItem
          key={subagent.id}
          aria-label={subagent.description}
          value={subagent.toolUseId}
        >
          <span className="min-w-0 flex-1 truncate">{subagent.description}</span>
        </DropdownMenuRadioItem>
      ))}
    </>
  )
}

import type {
  AgentHookGroup,
  AgentMarketplaceInfo,
  AgentMarketplacePlugin,
  AgentMcpServerConfig,
  AgentPluginInfo,
  AgentSubagentConfig,
  AgentWorkflowInfo,
} from '@/shared/rpc'

import { requestFromDesktop } from '../desktop/client'

/** Renderer-side API over the main process agent-config domain modules. */

export function listAgentSubagents() {
  return requestFromDesktop('agentListSubagents', {})
}

export function listAgentAvailableSubagents() {
  return requestFromDesktop('agentListAvailableSubagents', {})
}

export function saveAgentSubagent(subagent: AgentSubagentConfig) {
  return requestFromDesktop('agentSaveSubagent', { subagent })
}

export function deleteAgentSubagent(file: string) {
  return requestFromDesktop('agentDeleteSubagent', { file })
}

export function listAgentMcpServers() {
  return requestFromDesktop('agentListMcpServers', {})
}

export function saveAgentMcpServer(server: AgentMcpServerConfig, previousName?: string) {
  return requestFromDesktop(
    'agentSaveMcpServer',
    previousName ? { server, previousName } : { server },
  )
}

export function deleteAgentMcpServer(name: string) {
  return requestFromDesktop('agentDeleteMcpServer', { name })
}

export function listAgentHookGroups() {
  return requestFromDesktop('agentListHookGroups', {})
}

export function saveAgentHookGroup(group: AgentHookGroup) {
  return requestFromDesktop('agentSaveHookGroup', { group })
}

export function deleteAgentHookGroup(event: string) {
  return requestFromDesktop('agentDeleteHookGroup', { event })
}

export function listAgentSkills() {
  return requestFromDesktop('agentListSkills', {})
}

export function deleteAgentSkill(name: string) {
  return requestFromDesktop('agentDeleteSkill', { name })
}

export function listAgentPlugins() {
  return requestFromDesktop('agentListPlugins', {})
}

export function listAgentAvailablePlugins() {
  return requestFromDesktop('agentListAvailablePlugins', {})
}

export function listAgentMarketplaces() {
  return requestFromDesktop('agentListMarketplaces', {})
}

export function addAgentMarketplace(source: string) {
  return requestFromDesktop('agentAddMarketplace', { source })
}

export function removeAgentMarketplace(name: string) {
  return requestFromDesktop('agentRemoveMarketplace', { name })
}

export function refreshAgentMarketplace(name?: string) {
  return requestFromDesktop('agentRefreshMarketplace', { name })
}

export function installAgentPlugin(pluginId: string) {
  return requestFromDesktop('agentInstallPlugin', { pluginId })
}

export function removeAgentPlugin(id: string) {
  return requestFromDesktop('agentRemovePlugin', { id })
}

export function setAgentPluginEnabled(id: string, enabled: boolean) {
  return requestFromDesktop('agentSetPluginEnabled', { id, enabled })
}

export function listAgentWorkflows(): Promise<AgentWorkflowInfo[]> {
  return requestFromDesktop('agentListWorkflows', {})
}

export function readAgentWorkflow(name: string) {
  return requestFromDesktop('agentReadWorkflow', { name })
}

export function saveAgentWorkflow(name: string, content: string) {
  return requestFromDesktop('agentSaveWorkflow', { name, content })
}

export function renameAgentWorkflow(from: string, to: string) {
  return requestFromDesktop('agentRenameWorkflow', { from, to })
}

export function deleteAgentWorkflow(name: string) {
  return requestFromDesktop('agentDeleteWorkflow', { name })
}

export function getAgentCapabilityToggles() {
  return requestFromDesktop('agentGetCapabilityToggles', {})
}

export function setAgentCapabilityToggle(kind: 'skill' | 'mcp', name: string, enabled: boolean) {
  return requestFromDesktop('agentSetCapabilityToggle', { kind, name, enabled })
}

export type {
  AgentHookGroup,
  AgentMcpServerConfig,
  AgentPluginInfo,
  AgentMarketplaceInfo,
  AgentMarketplacePlugin,
  AgentSubagentConfig,
  AgentWorkflowInfo,
}

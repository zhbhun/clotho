import { type ReactNode, createContext, useContext, useLayoutEffect, useMemo } from 'react'

import type { ShortcutScopeId } from '@/shared/shortcuts'

import { useShortcutRuntime } from '../services/shortcuts/runtime'
import { type ShortcutScopeOwner } from '../services/shortcuts/scope'

const ShortcutScopeOwnerContext = createContext<ShortcutScopeOwner | null>(null)

function ShortcutScopeActivator({
  owner,
  scope,
}: {
  owner: ShortcutScopeOwner
  scope: ShortcutScopeId | null
}) {
  const { scopes } = useShortcutRuntime()

  useLayoutEffect(() => {
    if (!scope) return
    return scopes.activate(scope, owner)
  }, [owner, scope, scopes])

  return null
}

export function ShortcutScope({
  children,
  scope,
}: {
  children: ReactNode
  scope: ShortcutScopeId | null
}) {
  const { scopes } = useShortcutRuntime()
  const parent = useContext(ShortcutScopeOwnerContext)
  const owner = useMemo(() => scopes.createOwner(parent), [parent, scopes])

  return (
    <ShortcutScopeOwnerContext value={owner}>
      <ShortcutScopeActivator owner={owner} scope={scope} />
      {children}
    </ShortcutScopeOwnerContext>
  )
}

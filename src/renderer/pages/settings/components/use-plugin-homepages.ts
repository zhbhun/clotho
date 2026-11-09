import { useEffect, useRef, useState } from 'react'

import { getAgentPluginDetails } from '../../../services/claude/agent-config'
import type { CatalogEntry } from './install-catalog'

/**
 * Manifest homepages of installed catalog entries, fetched once per plugin id.
 * The installed-entry menu offers Open only when a homepage is known, so the
 * prefetch must run as entries flip to installed (install, dedup shift).
 */
export function usePluginHomepages(
  entries: CatalogEntry[],
  installedNames: Set<string>,
): Map<string, string | undefined> {
  const [homepagesById, setHomepagesById] = useState<Map<string, string | undefined>>(new Map())
  const requested = useRef(new Set<string>())

  useEffect(() => {
    for (const pluginId of entries
      .filter((entry) => installedNames.has(entry.name))
      .map((entry) => entry.pluginId)) {
      if (requested.current.has(pluginId)) continue
      requested.current.add(pluginId)
      getAgentPluginDetails(pluginId)
        .then((details) => {
          setHomepagesById((current) => new Map(current).set(pluginId, details.homepage))
        })
        .catch(() => {
          requested.current.delete(pluginId)
        })
    }
  }, [entries, installedNames])

  return homepagesById
}

import { useEffect, useRef } from 'react'

import { useSettingsDetailStore } from './settings-detail-store'

/**
 * Reports whether the current form differs from the snapshot taken at mount
 * to the shared settings-detail store (design D5). Dirtiness resets on unmount.
 */
export function useDetailDirty(value: unknown) {
  const setDirty = useSettingsDetailStore((state) => state.setDirty)
  const baselineRef = useRef(JSON.stringify(value))
  useEffect(() => {
    setDirty(JSON.stringify(value) !== baselineRef.current)
  }, [value, setDirty])
  useEffect(() => () => setDirty(false), [setDirty])
  return baselineRef
}

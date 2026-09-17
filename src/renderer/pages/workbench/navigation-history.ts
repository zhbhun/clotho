export type WorkbenchLocation = {
  projectId: string | null
  sessionId: string | null
}

type IsLocationAvailable = (location: WorkbenchLocation) => boolean

function isSameLocation(left: WorkbenchLocation, right: WorkbenchLocation) {
  return left.projectId === right.projectId && left.sessionId === right.sessionId
}

export function createWorkbenchNavigationHistory(initialLocation: WorkbenchLocation) {
  const locations = [{ ...initialLocation }]
  let currentIndex = 0

  function findAvailableIndex(direction: -1 | 1, isAvailable: IsLocationAvailable) {
    for (
      let candidateIndex = currentIndex + direction;
      candidateIndex >= 0 && candidateIndex < locations.length;
      candidateIndex += direction
    ) {
      if (isAvailable(locations[candidateIndex])) return candidateIndex
    }
    return -1
  }

  function move(direction: -1 | 1, isAvailable: IsLocationAvailable) {
    const nextIndex = findAvailableIndex(direction, isAvailable)
    if (nextIndex < 0) return null
    currentIndex = nextIndex
    return { ...locations[currentIndex] }
  }

  return {
    back(isAvailable: IsLocationAvailable) {
      return move(-1, isAvailable)
    },
    canBack(isAvailable: IsLocationAvailable) {
      return findAvailableIndex(-1, isAvailable) >= 0
    },
    canForward(isAvailable: IsLocationAvailable) {
      return findAvailableIndex(1, isAvailable) >= 0
    },
    forward(isAvailable: IsLocationAvailable) {
      return move(1, isAvailable)
    },
    visit(location: WorkbenchLocation) {
      if (isSameLocation(locations[currentIndex], location)) return
      locations.splice(currentIndex + 1)
      locations.push({ ...location })
      currentIndex = locations.length - 1
    },
  }
}

export function draftTitleFromPrompt(prompt: string | null | undefined) {
  const normalizedPrompt = typeof prompt === 'string' ? prompt : ''
  return (
    normalizedPrompt
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  )
}

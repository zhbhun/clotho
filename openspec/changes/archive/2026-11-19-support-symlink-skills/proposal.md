# Proposal

## Why

The Skills settings page omits skills installed as symbolic links under `~/.claude/skills/` because the scanner accepts only directory entries. Most skills on the reported machine use this installation layout, leaving the list incomplete.

## What Changes

- Include skills reached through absolute and relative symbolic links when their `SKILL.md` can be read.
- Use the entry name under `~/.claude/skills/` as the skill identifier and read its description through the link.
- Skip broken links and entries without a readable `SKILL.md`.
- Verify that deleting a linked skill removes its installation link and preserves the target directory.

## Capabilities

### New Capabilities

### Modified Capabilities

- `agent-capability-settings`: Extend skill management to symbolic-link installations and specify their deletion behavior.

## Impact

The change affects `src/main/claude/agent-config/skills.ts` and its adjacent regression tests. The renderer and IPC already consume skill names and descriptions, so the existing contract supports linked installations.

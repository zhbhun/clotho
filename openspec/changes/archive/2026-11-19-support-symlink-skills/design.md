# Design

## Context

`listSkills()` reads direct children of `~/.claude/skills/` and filters them with `Dirent.isDirectory()`. The existing per-entry read handles missing and unreadable `SKILL.md` files. `deleteSkill()` removes the installation path with `fs.rm()`.

## Goals / Non-Goals

Use the existing skill-management data flow for linked installations, retaining the entry name as the identifier used by toggles and deletion.

## Decisions

- Accept directory and symbolic-link entries, then use the existing `SKILL.md` read to determine whether each entry is a valid skill. Reading through the installation path resolves absolute and relative links through the filesystem.
- Keep deletion on the installation path. Resolving the target path before removal would delete the shared skill source.
- Add filesystem regression tests for both link forms, invalid links, and target preservation after deletion.

## Risks / Trade-offs

- A link can be broken or its target can disappear during a scan. The existing per-entry read failure skips that entry and allows other skills to load.
- Linked skills can point outside `~/.claude/skills/`. Deletion is verified against a target outside the installation directory to protect shared source files.

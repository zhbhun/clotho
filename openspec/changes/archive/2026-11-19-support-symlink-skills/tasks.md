# Tasks

## 1. Symbolic-link skill management

- [x] 1.1 Include symbolic-link installations in the skill scan and add regression cases for absolute links, relative links, broken links, and links without a readable `SKILL.md`. Verify with `npm test -- src/main/claude/agent-config/skills.test.ts`.
- [x] 1.2 Cover deleting a symbolic-link installation while preserving its target directory and contents in `skills.test.ts`. Verify that the link is removed and the target `SKILL.md` remains readable.

## 2. Integration verification

- [x] 2.1 Run `npm run check`, ESLint and Prettier on changed files, and OpenSpec validation. Verify the Skills settings list over the debug app's CDP connection with the machine's existing linked installations.

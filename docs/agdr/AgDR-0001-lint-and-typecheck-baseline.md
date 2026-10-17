---
id: AgDR-0001
timestamp: 2026-10-15T00:00:00Z
agent: platform-engineer
model: claude-fable-5-1
session: n/a
trigger: user-prompt
status: executed
category: tech-stack
projects: [khidma-live]
---

# Lint and Type-Check Baseline

> In the context of khidma-live issue #12, facing a LOW harnessability score with no lint or type checking, I decided to use ESLint flat config plus `// @ts-check` JSDoc types checked by `tsc --noEmit`, to achieve a mechanical quality baseline, accepting that types live in comments.

## Context

- The repo is plain JavaScript ES modules on Node 20 or later.
- The repo has no runtime dependencies and one source module, `src/requests.js`.
- Issue #12 allows two options: `// @ts-check` with a strict config, or a TypeScript migration.
- CI wiring is out of scope here. The CI criterion of #12 moved to #10 per https://github.com/atlas-apex/khidma-live/issues/12#issuecomment-6200038525.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (a) `// @ts-check` + JSDoc + `tsconfig.json` with `checkJs` and `strict` | No build step. Source stays plain ES modules. Small diff. Exports and signatures stay unchanged. | Types live in comments. JSDoc syntax is more verbose than TypeScript. |
| (b) Migrate `src/` to TypeScript strict | Native type syntax. Better editor support. | Adds a build or loader step. Renames files and changes import paths. Larger diff. Breaks the plain-ES-module convention. |

## Decision

Chosen: **(a)**, because it keeps the plain-ES-module convention and needs the smallest change.

- ESLint uses `@eslint/js` recommended rules and the `globals` package for Node globals.
- `tsconfig.json` sets `strict`, `checkJs`, `allowJs`, and `noEmit`.
- Every new package is a devDependency. The repo still has no runtime dependency.
- `@types/node` is pinned to `^20` to match the `engines` floor.

## Consequences

- `npm run lint` and `npm run typecheck` pass on the current code.
- `src/requests.js` gains JSDoc types. Behaviour, exports, and signatures stay unchanged.
- The typecheck covers `src/` only. Tests are not type-checked. A follow-up ticket can extend it.
- The repo now has devDependencies. Run `/audit-deps khidma-live` after merge.
- Issue #10 runs both scripts in CI. Its scope names them per https://github.com/atlas-apex/khidma-live/issues/12#issuecomment-6200038525.

## Artifacts

- Issue: atlas-apex/khidma-live#12
- PR: branch `chore/GH-12-lint-typecheck`

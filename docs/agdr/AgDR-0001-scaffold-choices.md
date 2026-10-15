# Scaffold choices

Status: proposed.

> I chose the floor from the confirmed spec. The owner must set up source code and deploy.

## Context

The spec records each answer and its source.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| Bundle | Uses known tools | Needs source code |
| Custom | Supports other stacks | Needs tool commands |

## Decision

Chosen bundle: `custom`. Rules row: 7. Coverage floor: 80 percent.

The first matching rules row uses the host and shape answers.

Language: `custom`. Source: derived from the bundle.

The bundle pipeline supplies the tool commands.

- Pipeline: `floor CI`. Source: `derived`.
- Pipeline: `placeholder test (passes and reports placeholder)`. Source: `derived`.
- `hostKind`: `company cloud`. Source: `onboarding`.
- `shape`: `API service`. Source: `owner`.
- `dataSensitivity`: `none`. Source: `owner`.
- `releaseCheck`: `checks`. Source: `default`.
- `setupChoice`: `Start with a minimal custom setup`. Source: `owner`.
- `scale`: `small`. Source: `owner`.
- `reuseConfirm`: `Use these`. Source: `owner`.
- `hostProvider`: `AWS`. Source: `onboarding`.
- `storage`: `DynamoDB`. Source: `onboarding`.
- Custom stack: `Node.js JavaScript API (ESM, node --test)`. Source: `owner`.
- Coverage: `80`. Source: `default`.

## Consequences

- The floor adds checks.
- The owner must add source code and deploy.

## Artifacts

- `docs/scaffold/spec.json`
- `docs/scaffold/notes.md`

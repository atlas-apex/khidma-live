# duplicate-guard — plan overview

Entry point for the **duplicate-guard** feature. Stories execute in order by their `NN` prefix.

## Stories

| NN | File | Title | Tracker id | Depends on |
|----|------|-------|------------|------------|
| 02 | [02-story-duplicate-guard.md](02-story-duplicate-guard.md) | Duplicate guard | KH-106 | 01 (reference-number) |

## Dependency notes

- Story 02 depends on Story 01 ([../reference-number/01-story-reference-number.md](../reference-number/01-story-reference-number.md)): the duplicate error includes `referenceNumber`.
- Story 02 changes three numbering tests from Story 01 to use distinct citizens, because repeated same-citizen/same-service submits are now rejected.

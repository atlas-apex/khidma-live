# reviewer-load-limit — plan overview

Entry point for the **reviewer-load-limit** feature. Stories execute in order by their `NN` prefix.

## Stories

| NN | File | Title | Tracker id | Depends on |
|----|------|-------|------------|------------|
| 03 | [03-story-reviewer-load-limit.md](03-story-reviewer-load-limit.md) | Reviewer load limit | KH-103 | 02 (duplicate-guard) |

## Dependency notes

- Story 03 depends on Story 02 ([../duplicate-guard/02-story-duplicate-guard.md](../duplicate-guard/02-story-duplicate-guard.md)): new tests use its `fresh()` helper to create many open requests without hitting the duplicate guard.
- Story 03 changes the public signature to `startReview(id, reviewerId)`. All 5 existing test calls are updated in the same story.

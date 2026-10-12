# reference-number — plan overview

Entry point for the **reference-number** feature. Stories execute in order by their `NN` prefix.

## Stories

| NN | File | Title | Tracker id | Depends on |
|----|------|-------|------------|------------|
| 01 | [01-story-reference-number.md](01-story-reference-number.md) | Reference number for every request | KH-101 | — |

## Dependency notes

- Story 01 adds `referenceNumber` to requests and exports `getRequestByReference` from `src/requests.js`. Later stories that show or search requests build on this field.

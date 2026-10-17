---
id: AgDR-0002
timestamp: 2026-10-16T18:20:00Z
agent: tech-lead
model: claude-fable-5-1
session: f16c78e0-815f-46bf-85c9-38be832018f6
trigger: user-prompt
status: executed
category: architecture
projects: [khidma-live]
---

# DynamoDB as the Persistent Request Store

> In the context of khidma-live moving off its per-process in-memory `Map`, facing a request store that must survive restarts, hold citizen identifiers safely, and enforce three atomic invariants, I decided to use a single DynamoDB table behind a repository port, to achieve a serverless store that matches the Atlas Apex AWS stack with no servers to run, accepting that every lifecycle function becomes async and that the three invariants move from JavaScript checks to conditional writes.

## Context

- `src/requests.js` keeps requests, yearly reference counters, and the reference index in three in-process `Map`s. State is lost on restart and is not shared across processes. The C4 container diagram records this as a known gap.
- The company stack in `onboarding.yaml` is TypeScript on AWS Lambda with AWS SAM, DynamoDB as the database, and AWS as the host. The team is one developer. Company values include "Keep it simple".
- The module enforces three invariants in code today: the yearly reference sequence `KH-YYYY-NNNNNN` never repeats or skips, a citizen holds at most one open request per service (the duplicate guard), and a reviewer holds at most `MAX_ACTIVE_REVIEWS` (5) requests `UNDER_REVIEW`. Each one is a read-then-write in a single process. A shared store needs each one to be atomic.
- Access patterns are: get by request id, get by reference number, list by citizen, count `UNDER_REVIEW` by reviewer, find an open request by citizen and service, and append to a status history.
- `citizenId` and `reviewerId` identify real people in a production deployment. The store must encrypt at rest and restrict access per function. Hakim (Security Auditor) raised these as conditions on any option.
- Every exported function is synchronous. Any network-backed store changes the public API to `async`, which touches every caller and every test.
- The current MVP is a zero-dependency module with no HTTP layer. Persistence is the first infrastructure dependency the project takes on.

## Options Considered

| Option | Pros | Cons |
|--------|------|------|
| (a) DynamoDB single table behind a repository port | Matches the company stack and hosting. No servers, pay per request, scales to zero for a side project. Encryption at rest with AWS managed keys by default. Point-in-time recovery is one setting. Conditional writes and `TransactWriteItems` make all three invariants atomic. Local tests keep the existing `Map` as the in-memory adapter. | Yearly counter is a single hot item, acceptable at this scale but a ceiling later. Queries need two or three global secondary indexes. Local integration tests need DynamoDB Local or a container. Modelling is less direct than SQL for a relational-looking domain. |
| (b) PostgreSQL on Aurora Serverless v2 or RDS | Relational model fits requests, history, and counters directly. Partial unique index expresses the duplicate guard in one line. Strong tooling and portable SQL. | Not the company default. Minimum capacity bills around the clock. Lambda needs RDS Proxy or careful pooling. Needs a VPC, subnets, and security groups, which is heavy for one developer. |
| (c) SQLite file (`node:sqlite` or `better-sqlite3`) | Keeps the synchronous API, so the public functions do not change. Zero infrastructure for local and demo use. | Does not fit Lambda without EFS and a single-writer lock. Not shared across instances. Needs a second store once the service is deployed, so the migration happens twice. `node:sqlite` needs Node 22.5 or later and `engines` is 20 or later. |
| (d) Keep the in-memory store and add only the repository port now | Smallest change. Unblocks the port extraction without a new dependency. | Does not solve persistence. Defers the decision rather than making it. The user asked for the replacement store. |

## Decision

Chosen: **(a) DynamoDB single table behind a repository port**, because it is the company's declared database on the company's declared host, it runs with no servers for a solo developer, and its conditional writes let every current invariant stay atomic once the store is shared.

The decision includes these shape commitments. The technical design refines the names.

- One table. Partition key `pk`, sort key `sk`. Request item `REQ#<id>` holds the record and its history list. A counter item `COUNTER#<year>` holds the last sequence number. A lock item `OPEN#<citizenId>#<serviceId>` exists only while that citizen has an open request for that service. A reviewer item `REVIEWER#<id>` holds `activeReviews`.
- Reference numbers come from `UpdateItem` with `ADD seq 1` and condition `seq < 999999` on the counter item. A failed condition maps to the existing "Reference numbers exhausted" error.
- `submitRequest` is one `TransactWriteItems`: put the request item, put the lock item with `attribute_not_exists(pk)`. A transaction cancel on the lock maps to `DUPLICATE_REQUEST` and carries the existing reference number from the lock item.
- `startReview` is one transaction: update the request status with a condition on the current status, and `ADD activeReviews 1` on the reviewer item with condition `activeReviews < 5`. A cancel on the reviewer item maps to `REVIEWER_AT_CAPACITY`.
- `decide` and `withdrawRequest` update the status with a condition on the current status, delete the lock item, and decrement `activeReviews` when the request leaves `UNDER_REVIEW`. `NEEDS_INFO` (KH-109) keeps the lock item and decrements `activeReviews`.
- Global secondary indexes: `GSI1` on `referenceNumber` for lookup by reference, `GSI2` on `citizenId` for list by citizen. Reviewer load reads the reviewer item, so no index is needed for it.
- The repository port exposes the same operations the module needs today. The current `Map`-backed code becomes the in-memory adapter and stays the default for unit tests. Unit tests do not call AWS.
- Security conditions from Hakim: server-side encryption on, point-in-time recovery on, one IAM role per Lambda with table and index scoped actions only, no `Scan` permission in production roles, and no personal data in reference numbers or log lines. CloudTrail data events for the table are optional and can be enabled later.
- Infrastructure is declared in the SAM template, in line with the company IaC choice.

## Consequences

- Every exported lifecycle function becomes `async`. This is a breaking change to the module API. It needs its own feature ticket and a technical design before Build, per Gate 2. The tests move to `await` in the same change.
- The project takes its first runtime dependency, the AWS SDK v3 DynamoDB client. `/audit-deps khidma-live` runs after that lands.
- The yearly counter is one item. Writes to it serialise. At the expected request rate for this service that is fine. If the rate ever exceeds roughly one thousand submits per second, revisit with sharded counters and record the change in a new AgDR.
- The duplicate guard and the reviewer limit move from JavaScript logic into write conditions. The existing unit tests keep covering the in-memory adapter. An integration test suite against DynamoDB Local covers the conditional writes and runs in CI, which depends on issue #10 landing first.
- The C4 container diagram replaces the "In-memory store" container with a DynamoDB container. The DFD gains a trust boundary between the Lambda functions and the table, and a data-at-rest classification for citizen identifiers.
- Options (b) and (c) are not blocked for the future. The repository port is the seam. Swapping the adapter later needs a new AgDR but no change to callers.
- Option (d) is folded into the sequence: the port extraction can ship as its own small PR before the DynamoDB adapter, so the API change and the storage change review separately.

## Artifacts

- Decision requested in the apexyard session on 2026-10-16 by the Head of Engineering.
- Follow-up tickets to file: port extraction and async API, DynamoDB adapter plus SAM template, DynamoDB Local integration tests. None filed at the time of this record.
- Related: AgDR-0001 (lint and type-check baseline), KH-106 duplicate guard, KH-103 reviewer load limit, atlas-apex/khidma-live#16 (withdraw), atlas-apex/khidma-live#17 (needs info).

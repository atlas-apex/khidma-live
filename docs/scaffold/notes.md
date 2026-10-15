# Scaffold notes

## Coverage format

Write an Istanbul summary to `coverage/coverage-summary.json`.
Use a number at `total.lines.pct`. The coverage floor is 80 percent.

Non-npm stacks must replace the audit placeholder.
Python and Go need their bundle tools before CI can run.
No source tree is included.

## Open questions

- Choose a host before launch. Company setup names AWS, but no JavaScript API golden path exists yet, so the AWS container infra draft was not generated.
- Add an HTTP layer around src/requests.js before any deploy. The repo has no entry point.
- Storage is DynamoDB in company setup. The module uses an in-memory Map. Decide persistence through /decide before infrastructure.
- Language clash: company language TypeScript and repo JavaScript versus the only API golden path, python-fastapi.
- Choose a host before launch.

## Security baseline

Use an HttpOnly session cookie.
Use SameSite=Lax on that cookie.
Add Secure only when COOKIE_SECURE is true.
Accept application/json on state-changing routes.
Return status 415 for any other media type.
Return errors as application/problem+json.
Use a stable code on each error.
Pin each dependency to an exact version.
Run scripts/exact-pins.sh before release.

# Build Repository Detail tag table and pull command copy

## Description

Build the Repository Detail page so administrators can browse tags, search loaded tags, load all tags, and copy pull commands.

## Acceptance Criteria

- [x] Repository names containing `/` are URL encoded in frontend routes and API calls.
- [x] The Repository Detail page shows tag rows with actions for Manifest, Pull, and Delete Manifest.
- [x] Current-page tag search filters only tags already loaded in the browser.
- [x] `Load all tags` fetches all tag pages before filtering.
- [x] Pull command copy uses the configured Registry URL, repository name, and tag.
- [x] Empty and error states are visible.
- [x] Typecheck/lint passes.
- [x] Verify in browser using dev-browser skill.

## Dependencies

Issue #3, Issue #8

## Type

frontend

## Priority

high

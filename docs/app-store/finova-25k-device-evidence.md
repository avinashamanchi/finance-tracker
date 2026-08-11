# Finova 25k-MAU physical-device evidence

Status: `UNVERIFIED`. This file must be completed from one exact signed release candidate on the oldest supported physical iPhone chosen for release. Node, simulator, Expo Go, and CI timings cannot check any performance row below.

## Candidate identity

- [ ] Device model: `________________`
- [ ] iOS version: `________________`
- [ ] Signed build ID / Git SHA: `________________`
- [ ] Fixture digest: `sha256:4f3628d6e2b35a8bd282486b0089fef2a0fa83bf0139e57fad96250b309e1c09`
- [ ] Fixture counts verified: 100,000 transactions / 120 months / 180 budget plans / 120 recurring templates / 50 goals

## Ten-run measurements

Record one warm-up, then ten raw release-build samples. Do not replace raw samples with words such as “fast.”

| Gate | Required p95 | Raw samples 1–10 | Observed p95 | Pass |
| --- | ---: | --- | ---: | --- |
| Current-schema database open + no-op migration | < 750 ms | `________________` | `_____ ms` | [ ] |
| Frozen shipped-v1 → v4 migration | < 750 ms | `________________` | `_____ ms` | [ ] |
| First 50-row transaction page | < 250 ms | `________________` | `_____ ms` | [ ] |
| FTS transaction search | < 300 ms | `________________` | `_____ ms` | [ ] |
| Current-month SQL aggregates | < 200 ms | `________________` | `_____ ms` | [ ] |

- [ ] Maximum main-thread stall during migration and normal interaction is below 100 ms; observed `_____ ms`.
- [ ] Peak resident memory during encrypted 100,000-row export is below 250 MiB; observed `_____ MiB`.
- [ ] Peak resident memory during authenticated import is below 250 MiB; observed `_____ MiB`.

## Integrity and recovery

- [ ] Migrated content digest and all expected counts match the frozen source.
- [ ] FTS integrity and representative search results match before/after expectations.
- [ ] `foreign_key_check` and `integrity_check` pass.
- [ ] Late injected migration failure rolls back without changing the source digest or schema version.
- [ ] Database reopens after process termination and a second migration run is a no-op.
- [ ] 100,000-row encrypted export/import succeeds; wrong password, truncation, tampering, duplicate IDs, unknown owners, and count mismatch leave active data unchanged.
- [ ] Delete All removes transactions, plans, templates, expected bills, goals, contributions, preferences, and Finova-owned temporary artifacts; retry works after an injected partial failure.

## iPhone interaction and accessibility

- [ ] VoiceOver order, labels, values, errors, locked states, and destructive confirmations are understandable.
- [ ] Dynamic Type at 200% keeps every action reachable without clipped meaning.
- [ ] Reduce Motion, dark appearance, smallest supported screen, keyboard avoidance, safe areas, and rotation policy are verified.
- [ ] Expected-bill creation never records spending; Review & Record requires a second explicit confirmation.
- [ ] Savings goals state that no money is moved and remain readable after entitlement loss.
- [ ] Sandbox purchase, cancellation, interruption, already-owned state, listener update, reinstall, and Restore Purchases pass on the exact candidate.
- [ ] Encrypted backup export/import, CSV share cancellation, and Delete All pass on the exact candidate.

No row in this document is satisfied by the content-free Node profiler. Its output is regression evidence only.

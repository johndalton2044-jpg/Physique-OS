# Release 7586b446f8

Release id 182d614eab77 · schema 2 · generated 2026-09-27T11:37:20.572Z

**24 of 24 verification items pass**

## Final verification

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | Build | PASS | recorded against build 7586b446f8: {"build":"7586b446f8","release":"182d614eab77","inputs":133,"version":"1.0.0","schema":2,"indexKB":3083,"scriptLines":28536," |
| 2 | Engine | PASS | recorded against build 7586b446f8: 64 passed, 0 failed  (1452 in-app self-test checks) |
| 3 | Unit tests (in-app self-tests) | PASS | engine: recorded against build 7586b446f8: 64 passed, 0 failed  (1452 in-app self-test checks) · shipped: recorded against build 7586b446f8: pass  a second run  |
| 4 | DOM tests | PASS | recorded against build 7586b446f8: pass  with no layout measurement it falls back to the document end rather than failing · 398 passed, 0 failed |
| 5 | Browser tests | PASS | recorded against build 7586b446f8: 6 viewports × 12 tabs measured in Chromium · 0 finding(s): 0 P0, 0 P1 |
| 6 | Audit | PASS | recorded against build 7586b446f8: 125 passed, 0 finding(s): 0 P0, 0 P1, 0 P2 |
| 7 | Conformance | PASS | recorded against build 7586b446f8: 0 finding(s): 0 P1, 0 P2 |
| 8 | Adversarial tests | PASS | recorded against build 7586b446f8: 62 passed, 0 failed |
| 9 | Performance tests | PASS | recorded against build 7586b446f8: all operations within budget |
| 10 | Cloud E2E | PASS | recorded against build 7586b446f8: log lines: 17 |
| 11 | Replay verification | PASS | {"leaks":0,"future":0,"decided":true} |
| 12 | Migration verification | PASS | {"upgraded":true,"applied":1,"newerRefused":true,"junkRefused":true} |
| 13 | Provenance verification | PASS | {"audit":true,"missing":[]} |
| 14 | Uncertainty propagation verification | PASS | {"forecastWidens":true,"recoveryWidens":true,"scenarioCarriesTrend":true} |
| 15 | Dependency invalidation verification | PASS | {"reachesTrend":true,"reachesTdee":true,"identityChanges":true} |
| 16 | Accessibility verification | PASS | browser gate: contrast and 44px targets at 6 viewports; audit: labels, focus, reachability |
| 17 | Responsive verification | PASS | browser gate: 6 viewports × 12 tabs and every form sheet |
| 18 | Visual regression verification | PASS | recorded against build 7586b446f8: all passed |
| 19 | Export/import round trips | PASS | {"dashboard":"ok","appearance":"ok","visualizationPreset":"ok","experiment":"ok"} |
| 20 | Model reproducibility | PASS | 25 models, identical results and run identities across independent loads at a pinned time |
| 21 | Production build | PASS | recorded against build 7586b446f8: data/reference: 1 files verified · dist verified. |
| 22 | Release manifest | PASS | build 7586b446f8, release 182d614eab77, 133 hashed inputs |
| 23 | Architecture/conformance report | PASS | docs/implementation/governance-report.md |
| 24 | Capability maturity report | PASS | docs/release/capability-maturity.md |

## Adversarial cases (§33)

| Case | Result | Detail |
|---|---|---|
| missing data | PASS | true |
| conflicting data | PASS | true |
| corrected data | PASS | true |
| retracted data | PASS | true |
| stale data | PASS | true |
| unit mismatch | PASS | true |
| invalid dates | PASS | true |
| version mismatch | PASS | true |
| dependency invalidation | PASS | true |
| duplicate events | PASS | true |
| impossible values | PASS | true |

## Traceability (§38)

A new weight observation followed through every stage of the chain:

- ✓ OBSERVATION
- ✓ EVENT
- ✓ STATE
- ✓ MODEL
- ✓ INFERENCE
- ✓ EVIDENCE
- ✓ UNCERTAINTY
- ✓ PROVENANCE
- ✓ DECISION
- ✓ PRESENTATION MODEL
- ✓ VISUALIZATION
- ✓ VIEW
- ✓ USER ACTION
- ✓ NEW OBSERVATION

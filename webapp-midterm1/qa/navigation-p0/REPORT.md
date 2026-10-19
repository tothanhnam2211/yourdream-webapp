# YOURDREAM — P0 Navigation & Learning Flow Fix — DRAFT

Baseline: `82d06f65866fd49b858e813e24c25e8808f49b07`, branch `feat/webapp-midterm1-phase-a`.
Implementation branch: `fix/p0-navigation-learning-flow`.
Scope: existing `webapp-midterm1`; Cloudflare staging only. No new Site, framework, engine, lesson content, database migration, production deployment, or DNS change.

## Verified route inventory

| Area | Existing route / location | Actual status |
| --- | --- | --- |
| Home and knowledge map | `/` and `/index.html` | Functional 8-branch/32-topic map; native lesson tabs in the detail panel |
| Radical practice | `/radicals.html` | Functional 4-exercise/15-step practice; existing account/local persistence retained |
| Midterm paper | `/graph02-preview.html?profile=midterm1-hanoi-01` | Functional 5-exercise/24-step authored DRAFT package |
| Answer sheet | Same graph route, selected graph/part/step, `view=sheet` | Existing PaperSheetModule; no new duplicate page |
| Guidance, mind map, model solution | Existing details panels in graph controller | Contextual buttons open these panels and return to the same answer sheet |
| STEM Hub | No activity route in this source | DESIGN ONLY; unavailable label without an active link |
| Learning journal | Evidence in existing browser stores and diagnosis panels | Standalone journal screen not implemented; pending label without an active link |
| Architecture design | `/blueprint.html` | Existing design reference; gated during an unsubmitted mock exam |

## Changes

A shared buildless App Shell replaces the old page headers: YOURDREAM branding, common navigation, mobile menu, context breadcrumb, current exercise and a validated return link. Home links preserve branch/topic/tab; practice links preserve the actual item and step. The existing exercise prompts support the reviewed topic recommendations RAD-002 (absolute value), RAD-001/RAD-004 (radical transformations), and RAD-003 (domain/reduction).

Graph deep links carry the actual `graph_id`, existing part-group key (`part`), `step_id`, profile and paper/sheet view. The resolver validates graph membership and rejects invented or conflicting IDs. Existing package IDs remain in the validated content. No canonical `lesson_id`, chapter ID, `subquestion_id`, or `activity_ref` was allocated or fabricated. The map branch name is used where no verified SGK chapter mapping exists.

Guidance stays in the existing answer-sheet document. Opening/closing guidance changes no selected graph/part/step or draft. Reload restores the selected part and draft through the existing content-hash-bound storage.

An unsubmitted mock exam now writes a shared browser lock. Reload, direct learning/design URLs, another profile, back navigation and another tab cannot use the normal UI to leave that active exam for support. The practice/profile controls and contextual support buttons are disabled until submission. Correctness counts, per-step explanations and diagnosis text are masked before submission. Starting a mock exam requires a successful browser-storage lock write.

This is a client-side practice-exam UI boundary. Static JSON still contains expected answers. It is not server-side exam security and does not defend against developer tools or deliberate local-storage changes.

## Validation actually performed

- Full Node regression run: **40/40 PASS**. The contract runner additionally reports **33/33** domain/security invariants. Command: `node --disable-warning=ExperimentalWarning --test --test-concurrency=1 tests/contract.test.cjs tests/core03-integration.test.cjs tests/midterm1-phase-a.test.cjs tests/learning-navigation.test.cjs`.
- After the final deep-link view adjustment: affected midterm/navigation suites **22/22 PASS**.
- Final production build: **PASS**. This Linux checkout uses `bash scripts/sites-env.sh -- npm run build` because the Windows-origin shell files lack executable bits. No tracked build configuration was changed.
- Staging deployment dry-run: **PASS**, existing Worker and staging D1 bindings preserved. It is not a deployment.
- Engine, adapters, journals, PaperSheetModule, scaffolding and all content JSON: byte-for-byte unchanged; see `protected-files.json`.
- JavaScript syntax and diff whitespace checks: PASS. The prepared browser runner's 28 static page expressions also parse.
- Two earlier combined runs hit fixed-delay timing assertions in existing server-sync tests under parallel build load; the final serial full run passed. No tests were removed or weakened.

## Current staging browser acceptance — operator-reported

Received 19/10/2026 at 17:41 (+07:00): the operator supplied Wrangler deployment output for Worker version `43546fbc-9d36-422a-a4cd-dfa7fb8d650a` at https://yourdream-webapp-staging.tothanhnam.workers.dev and all 10 A–E PASS lines, at 1280 px and 375 px. These are operator-provided results, not an independent browser rerun in this environment. Raw machine JSON/screenshots and the source-to-deployment commit binding have not been read back.

| Flow | 1280 px | 375 px |
| --- | --- | --- |
| A — map → lesson → practice → exact topic/tab return | PASS | PASS |
| B — exam paper → correct part → paper | PASS | PASS |
| C — draft → guidance → sheet → reload | PASS | PASS |
| D — unavailable STEM/journal have no active links | PASS | PASS |
| E — reload, direct/other-profile/back gate; submit unlocks | PASS | PASS |

Flow D verifies unavailable-state navigation only. It does not certify an implemented STEM activity or learning-journal screen. The client-side exam-security limitation above remains unchanged. See `STAGING_ACCEPTANCE_RECEIPT_20261019.json` for the exact supplied terminal evidence.

## Historical internal preview verification

The real cloud browser opened the internal HTTP preview and verified the common shell, disabled STEM/journal labels, lesson/tab selection, the correct RAD-001 practice URL, and return to exactly `branch=algebra&topic=1&tab=1` with the Example tab selected. A screenshot of the internal preview was delivered in the conversation; it does not represent the deployed staging version.

The practice controller could not initialize on that HTTP origin: `crypto.randomUUID is not a function`. The graph controller also relies on secure-context Web Crypto for content hashes. No production crypto behavior was weakened to work around the preview environment.

| Requested flow | Earlier internal-preview evidence (superseded by the staging results above) |
| --- | --- |
| A | PARTIAL real-browser verification; practice execution blocked by HTTP crypto context |
| B | PASS in DOM/controller regression; HTTPS browser acceptance pending |
| C | PASS in DOM/controller regression; HTTPS browser acceptance pending |
| D | NOT APPLICABLE: no implemented STEM activity; no fake route added |
| E | PASS in session/controller tests for reload, wrong profile, locked support and submission; HTTPS browser acceptance pending |

`tests/verify-navigation-browser.cjs` ran on the operator's Windows workstation against the staging hostname. The supplied output reports 10/10 PASS. The earlier HTTP preview limitation is no longer a staging deployment blocker.

## Current delivery state

**STAGING DEPLOYED · 10/10 BROWSER CHECKS PASS (OPERATOR-REPORTED) · PENDING USER ACCEPTANCE.**

Worker version: `43546fbc-9d36-422a-a4cd-dfa7fb8d650a`.
Implementation source commit: `8b3b615aac942d878c72afb9ce1086903434fa80`; its binding to the deployed Worker has not been independently checked.
No production/DNS/database-migration action was performed in this task. APPROVED and RELEASE have not been granted.

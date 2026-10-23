# WebApp Delivery Pilot — stale support route

Status: FIX_VALIDATED_DEPLOYMENT_BLOCKED. No release approval.

Source: `fix/p0-navigation-learning-flow` at `c40339a933af8cda42f751ee65c9066bf516bed8`.
Drive checkpoint read: `CHECKPOINT_DRAFT.json`, file `1sTf_jr8cHN1eWnD-uYLVR_IqwUYYCo1I`, modified 2026-10-19 13:22:59 UTC.
Checkpoint reports Worker version `de59aa04-0c18-450a-ac80-5999fc58dde9` and expected runtime commit `ebf7b58da2cf9c14ded8fd510e9b45002000209d`; current deployed commit/version binding remains independently unverified.

## One reproduced defect

Observed in the live cloud browser on the supplied staging:
1. Open `/graph02-preview.html?profile=midterm1-hanoi-01` from the menu.
2. Open Bài 1, Ý 1, then Sơ đồ tư duy.
3. Select Ý 2 using the in-exercise tabs. The support panel becomes invisible, but the URL retains `#exercise-mindmap`.
4. Reload. The mind map becomes visible again without another support request.

Observed visibility: false after selection, true after reload.
This contradicts the existing paper-first requirement to close support on selection and open it only on request.

## Minimal fix and validation

Clear a recognized support fragment when selecting a valid part or exercise. Keep normal support deep links and their reload restoration.
Runtime file: `public/graph02-preview.js`. Regression coverage: `tests/midterm1-phase-a.test.cjs`.

The added regression failed against the baseline with actual `#exercise-mindmap`, expected empty fragment.
After the fix, `node --test tests/midterm1-phase-a.test.cjs tests/learning-navigation.test.cjs`: 24/24 PASS.
Coverage includes selection, reload, explicit support links, draft restoration and existing exam gates. `git diff --check` passed.

## Deployment blocker and continuation

No Cloudflare API token/key environment variable, Wrangler auth config in standard home locations, or project Wrangler installation is available in this executor. No Cloudflare deployment connector is available. Sites deployments are a different production destination and are outside this task's authorization.

Staging is unchanged; the live defect is not claimed fixed. No build or post-fix live browser verification was performed.
An operator with existing Cloudflare access should use this patch atop the stated baseline, run the existing build and `deploy:staging` scripts only, then repeat the four-step browser reproduction. Verify the panel remains hidden after reload and record the new Worker version and source commit. Do not run database migration scripts.

No production deployment, student-record change, permission change, new repository, new site or paid API call was made. Stop after this single defect and verified deployment-access blocker.

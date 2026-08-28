---
name: development-loop
description: Plan, implement, verify, review, commit, and push a coherent change in this repository. Use for multi-step feature work, refactoring, or bug fixes; skip for read-only questions and trivial text-only edits.
---

# Development Loop

Deliver a verified repository change in small, reviewable increments. Preserve the user's requested scope and the rules in the nearest `AGENTS.md`.

## 1. Frame the outcome

Extract the goal, relevant context, constraints, and observable definition of done. Read the applicable `.planing` documents and inspect the current code before choosing an implementation. Ask only when an undiscoverable choice would materially change the product, cost, security boundary, or public behavior.

For multi-step work, keep a short live plan with one active step at a time. Update it when evidence changes the approach; do not preserve a stale plan merely for consistency.

## 2. Establish a safe baseline

Inspect the current branch, remote, status, nearby tests, package scripts, and relevant configuration. Treat pre-existing changes as user-owned. Do not overwrite, reformat, stage, or commit them unless they are inseparable from the requested edit and the user has authorized that overlap.

Identify the smallest useful vertical slice. Prefer an end-to-end slice that can be observed over a broad scaffold with no working behavior.

## 3. Implement incrementally

Make the smallest coherent change, then run the closest cheap check. Keep UI, API, data, and external-provider boundaries separable enough to test and fail independently. Do not add dependencies, Cloudflare products, plugins, or paid services without demonstrating why the current stack cannot meet the requirement.

When a check exposes a defect, fix the cause and repeat the relevant portion of the loop. Stop and report when progress needs new authority, credentials, a product decision reserved in `AGENTS.md`, or an external cost commitment.

## 4. Verify at proportional depth

Run the repository's formatter, lint, typecheck, tests, and build as applicable. Add or update tests for changed behavior and important failure paths. For UI work, inspect the behavior at the required mobile and desktop widths and exercise keyboard and error states. For Cloudflare work, verify the local Worker/D1 path before considering deployment.

Do not claim a check passed unless it ran successfully. Record checks that could not run and why.

## 5. Review the result

Read the final diff as a reviewer. Confirm it matches the requested outcome, contains no unrelated edits or secrets, handles realistic failure modes, and does not introduce avoidable cost or security risk. Correct findings and rerun affected checks.

Use a specialized review or security skill only when the task requests it or the risk justifies that workflow; ordinary self-review remains part of every implementation.

## 6. Commit and push safely

Stage only files owned by this task. Create one or more cohesive Conventional Commits after verification. Before pushing, confirm the branch, upstream, remote target, and commits to send.

Push the verified current branch when the user requested development and the repository has a safe configured upstream. Never force-push, rewrite history, merge, deploy, publish a release, or mutate PRs/issues unless explicitly requested. If authentication, branch protection, missing upstream, remote divergence, or unrelated working-tree changes make the push unsafe, preserve the local commit and report the exact blocker.

Use a connected GitHub capability for requested PR, issue, or check operations only after connection and permissions are verified. A local Git remote does not prove that the GitHub connector is installed.

## 7. Hand off evidence

Report the delivered behavior first, then the key files, verification commands and outcomes, commit hash/branch, push result, and any remaining decision or risk. Do not describe work as complete while a required validation or requested remote action remains unresolved.

---
name: ticket-workflow
description: Propose and transition repository development tickets with explicit user approval and durable completion evidence. Use before any mutating development task and when moving a ticket among proposed, in-progress, done, or blocked.
---

# Ticket Workflow

Use `docs/tickets/` as the source of truth for development authorization and status. Ticket administration does not authorize the ticket's implementation.

## Propose

Read `docs/tickets/README.md` and `docs/tickets/TEMPLATE.md`. Choose the next unused sequential ID by inspecting every state directory. Create one focused ticket in `proposed/` with `status: proposed`, concrete scope and exclusions, cost and security impact, measurable completion criteria, and a verification plan.

Commit and push the proposed ticket, then report its ID and the decisions the user is approving. Do not make implementation changes in the proposal commit.

## Approve and start

Require explicit user approval tied to the ticket ID, except when only one proposed ticket exists and the user's instruction unambiguously approves it. Before changing code:

1. Confirm the ticket remains proposed and the requested work matches it.
2. Set `status: in-progress`, `approved_at`, and `started_at`.
3. Append an approval entry to the ticket history without inventing a quote.
4. Move the file directly from `proposed/` to `in-progress/`.
5. Commit and push this start transition before implementation.

Use the `approved/` directory only for an approved queue item that will not start immediately. When work starts, move it to `in-progress/` and record `started_at`.

## Scope changes

Keep implementation within the approved scope. If goal, cost, security boundary, external side effects, or completion criteria materially change, record the proposed change, clear `approved_at` and `started_at`, set `status: proposed`, move the ticket back to `proposed/`, and request approval again.

## Complete

Only close after implementation and required validation are committed and pushed and CI has succeeded. Fill the completion evidence with commands and results, implementation commit, branch, CI URL, residual risks, and `completed_at`. Set `status: done`, append a history entry, move the ticket from `in-progress/` to `done/`, then commit and push the closure.

The closure commit may trigger a documentation-only CI run; report it separately if it is still pending. Never fabricate evidence or mark an unrun check as passed.

## Block

When progress requires missing authority, credentials, an unresolved product decision, or an external-state change, record the blocker and exact resume condition, set `status: blocked`, append a history entry, and move the file to `blocked/`. A resumed blocked ticket needs explicit user direction; move it to `in-progress/` and record the new start event without erasing prior history.

## Invariants

- The directory and frontmatter status must agree.
- Preserve one ticket file and its chronological history across moves.
- Never delete, duplicate, renumber, or silently broaden a ticket.
- Ticket status changes are repository mutations and follow normal diff review, commit, and push safety.
- PR, issue, deployment, or other external actions still require their own authorization when not explicitly included in the approved ticket.

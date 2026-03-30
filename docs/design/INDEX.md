# Design Documents — Index

> Status of all design documents in this directory.
> Updated: 26 March 2026 | Project version: 0.2.6

## Status Legend

| Status | Meaning |
|--------|---------|
| **Implemented** | Work completed, doc is historical reference |
| **Partially implemented** | Some items shipped, others remain |
| **Active** | Currently being worked on |
| **Superseded** | Replaced by a newer document |
| **Reference** | Evergreen strategic/analysis document |

## Documents

| Document | Baseline | Status | Notes |
|----------|----------|--------|-------|
| [feature-roadmap/spec.md](feature-roadmap/spec.md) | v0.0.x, 414 LOC | **Superseded** | Early feature analysis; superseded by implementation-roadmap.md |
| [ux-architecture-review/spec.md](ux-architecture-review/spec.md) | v0.0.x, 999 LOC | **Reference** | UX audit findings — many addressed in v2.0 redesign |
| [sales-strategy/spec.md](sales-strategy/spec.md) | v0.0.x | **Reference** | Market analysis, positioning, GTM strategy |
| [phase-6-polish/spec.md](archive/phase-6-polish/spec.md) | Phase 6 | **Implemented** | Progress indicators, polish — shipped in v1.0 |
| [phase-7/spec.md](archive/phase-7/spec.md) | Phase 7, 326 tests | **Implemented** | Search, scheduling, data portability — shipped in v1.0 |
| [ux-redesign-plan.md](archive/ux-redesign-plan.md) | Pre-v2.0 | **Implemented** | Sidebar, Today view, Settings tabs — shipped in v2.0 |
| [v0.0.5-expert-review-fixes.md](archive/v0.0.5-expert-review-fixes.md) | v0.0.4, 638 tests | **Superseded** | Security & data safety fixes — all addressed |
| [phase-a-qa-review.md](archive/phase-a-qa-review.md) | v0.0.13 | **Superseded** | QA gap analysis — gaps filled in later sprints |
| [strategic-review-panel.md](archive/strategic-review-panel.md) | v0.0.13 | **Reference** | 20-expert strategic review (Marketing, Sales, UI/UX, Coaches) |
| [configurable-lists-enhancement.md](configurable-lists-enhancement.md) | v0.0.12, 739 tests | **Partially implemented** | Custom lists shipped; configurable priorities/statuses remain |
| [focus-task-completion.md](archive/focus-task-completion.md) | v0.0.11, 711 tests | **Implemented** | Focus 3-panel (plan/timer/reflect) — shipped |
| [implementation-roadmap.md](implementation-roadmap.md) | v0.0.13, 775 tests | **Partially implemented** | 8-expert sprint plan; some milestones reached, others remain |
| [master-implementation-plan.md](master-implementation-plan.md) | v0.0.13, 763 tests | **Partially implemented** | Consolidated plan; v0.0.14–v0.1.0 partially shipped |
| [ship-ready-plan.md](ship-ready-plan.md) | v0.1.0, 898 tests | **Partially implemented** | Auth shipped (P0); some P2/P3 items remain |
| [v0.1.0-refactoring-plan.md](v0.1.0-refactoring-plan.md) | v0.0.5, 711 tests | **Implemented** | God-file split — server.js now 174 lines + 10 route modules |
| [v0.3.0-audit-implementation-plan.md](v0.3.0-audit-implementation-plan.md) | v0.3.0 | **Partially implemented** | 5-domain audit; security + a11y partially addressed |
| [custom-lists/expert-review.md](custom-lists/expert-review.md) | v2.0.0, 572 tests | **Reference** | 25-expert review of lists feature proposal |
| [custom-lists/implementation-plan.md](custom-lists/implementation-plan.md) | v2.0.0, 572 tests | **Partially implemented** | Phase 1–2 shipped (checklist, grocery); Phase 3–4 remain |
| [feature-gap-analysis/plan.md](feature-gap-analysis/plan.md) | v0.4.0, 1,728 tests | **Implemented** | Phases 0–5 shipped in v0.5.0 (API tokens, 2FA, webhooks, push, AI, imports) |
| [v0.5.1-review-remediation/plan.md](v0.5.1-review-remediation/plan.md) | v0.5.0, 1,841 tests | **Implemented** | 14 findings fixed in v0.5.1 (2FA, encryption, SSRF, webhooks, etc.) |
| [multi-expert-improvement-review/spec.md](multi-expert-improvement-review/spec.md) | v0.5.1, 1,885 tests | **Reference** | 9-expert panel: 45 recommendations, 25 prioritized items |
| [multi-expert-improvement-review/plan.md](multi-expert-improvement-review/plan.md) | v0.5.1, 1,885 tests | **Active** | 6 phases, 12 tasks: export, goals, context menus, scheduler, frontend arch |
| [review-fixes-v2-spec.md](review-fixes-v2-spec.md) | v0.7.51, 3,504 tests | **Implemented** | 8 work items: hex regex fix, factory user_id, IDOR/meta test consolidation, perf thresholds, jsdom tests |

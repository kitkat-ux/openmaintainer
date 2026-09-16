---
'@openmaintainer/core': minor
'@openmaintainer/ai': minor
'@openmaintainer/cli': minor
'@openmaintainer/config': minor
'@openmaintainer/github': minor
'@openmaintainer/github-app': minor
---

Harden webhook authorization, replay handling, comment ownership, bounded provider work, output validation and release traceability. Preserve core exports while splitting workflow responsibilities. CLI fixture work now requires explicit input and --mock for offline use; server mock mode must be explicit. Nested configuration keys are strict and unsupported privacy toggles reject true. See docs/phase-2-audit.md for migration and operational limits. No release or tag is created by this change.

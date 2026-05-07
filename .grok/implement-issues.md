# Implementation Review Patterns

> This file is maintained by the /implement skill.
> It records common issues found during implementation reviews to help avoid them in future runs.

## Common Issues

### Security
- Missing server-side guard for authorization — relying on UI-only checks that can be bypassed via direct action calls (seen 1 time)
- Trigger doesn't guard against overwriting existing non-null foreign key during upsert (seen 1 time)

### Error Handling
- No input validation on ID parameters in server actions — empty/invalid values silently succeed (seen 1 time)
- Backfill migration silently skips rows with NULL foreign keys — no pre-flight check (seen 1 time)

### Code Quality
- Concurrent mutation race condition when using single loading-state variable for multiple interactive elements (seen 1 time)
- Migration step ordering — dependent functions rewritten after referenced table is dropped (seen 1 time)
- Missing code comments explaining why SECURITY DEFINER is required on trigger functions (seen 1 time)

### Type Safety
- Database-constrained fields typed as loose `string` instead of union types (seen 1 time)

### UX / State Management
- Loading indicator dismissed before data refetch completes, causing UI flash (seen 1 time)
- Ghost selection of inactive/filtered entities in pre-populated edit forms — selected IDs not intersected with visible pool (seen 1 time)
- Client components fetch SELECT * leaking internal columns to browser unnecessarily (seen 1 time)

## Recent Runs

### 2025-07-23 — "Merge players and profiles tables"
- **Rounds**: 2
- **Issues**: 6 total (0 bugs, 3 suggestions, 3 nits)
- **Key patterns**: Migration ordering (functions before drop), NULL backfill safety, auth_id overwrite guard, loose type for role
- **Specializations used**: general

### 2025-07-23 — "Soft-delete users (deactivate/reactivate players)"
- **Rounds**: 2
- **Issues**: 5 total (2 bugs, 2 suggestions, 1 nit)
- **Key patterns**: Ghost selection of inactive players in edit form, missing server-side admin guard, loading state timing
- **Specializations used**: general
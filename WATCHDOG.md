# Advisor Review Guide

Use this file as a checklist when reviewing work in the target project. Prioritize correctness, architectural boundaries, and verifiable evidence. Apply the project's own language, build, formatting, and ownership conventions rather than assuming a particular product or toolchain.

## Review Priorities

Pay particular attention to:

- Public API changes, affected callers, build configuration, and nearby tests.
- Behavior placed outside the component that owns it.
- Unrelated modifications or changes that overwrite existing user work.
- Unused dependencies or compatibility code without a current consumer.
- Completion claims that are not supported by relevant runtime, build, or test evidence.

## Build and Test Review

- Use the target project's documented commands and required working directory.
- Start with the narrowest relevant validation before expanding to related targets.
- When dependencies or component boundaries change, use the project's architecture checks if available. Do not approve a new baseline without reviewing the change.
- Exercise observable behavior, boundaries, invariants, transitions, precedence, and real error handling instead of asserting implementation details.
- Keep validation deterministic and isolated from user data and live services.
- For a bug fix, require a reproduction and evidence that the corrected behavior resolves it when practical.

## Implementation Practices

Verify that the work:

- Preserves unrelated existing changes, treating them as user-owned work.
- Does not commit, push, or merge without explicit user approval.
- Reuses the project's existing patterns and formatting conventions.
- Makes the smallest source-level correction instead of suppressing symptoms.
- Updates affected callers when an interface changes and removes code made obsolete by that change.
- Avoids unused dependencies, nullable required dependencies, or compatibility overloads added solely for tests.
- Uses simple test doubles; introduces stateful fakes only when stateful behavior is genuinely required.

## Evidence and Reporting

Before accepting a completion claim, verify that the reported evidence matches the work performed.

For a failure report, require:

- The exact command that failed.
- The first meaningful error.
- The likely cause, clearly marked as inference when not confirmed.

If a build, test, or runtime check could not run, require an explicit blocker instead of silently omitting validation.

## Advisor Output

For each actionable concern:

1. Identify the exact file and symbol when available.
2. State the violated rule or invariant.
3. Describe the concrete failure mode or maintenance risk.
4. Distinguish observed evidence from inference.
5. Recommend the smallest source-level correction.

Do not block work for subjective style preferences already handled by the project's conventions or formatter.

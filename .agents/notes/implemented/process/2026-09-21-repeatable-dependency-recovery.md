# Agent Note: Repeatable dependency recovery and redacted credential scanning

Status: implemented

English | [中文](2026-09-21-repeatable-dependency-recovery.zh.md)

## Problem

The workspace has native dependencies and a multi-stage build, so repairing a checkout required several manual commands. Source archives without `.git` metadata also failed late while computing client build metadata. A focused check for a retired provider name needed to include ignored local environment files without risking secret values in command output.

## Decision

The root scripts provide three repeatable operations:

- `deps:refresh` runs `pnpm install --frozen-lockfile` and then `pnpm rebuild`; `--force` is available when the package store or workspace links need replacement.
- `build:archive -- --commit <hex-id>` delegates to the normal complete build with an explicitly supplied 7–40 character hexadecimal source identifier. It never invents a commit value for an archive.
- `security:scan` accepts repeated `--term` values and scans repository files, including ignored `.env` files, while excluding generated dependency and build directories. `security:fastai` supplies the retired-provider terms. Results contain only relative paths and line numbers, never matching lines or values.

## Alternatives considered

**Manual install, rebuild, and build commands** keep no shared entry point and make native repair easy to omit, so they were not retained.

**Silently derive a synthetic commit for source archives** would make the artifact metadata look authoritative even though it is not a repository revision, so the archive build requires an external identifier instead.

**Print matching lines from the credential scan** would make a local audit itself a possible secret leak, so the scanner reports locations only.

## Consequences

The common repair path is one command and preserves the lockfile as the dependency authority. Archive builds are explicit about provenance and remain compatible with the existing complete-build record. The focused scanner can inspect local ignored configuration safely, but it is a keyword check rather than a full secret-detection product; broader provider audits must pass their own terms.

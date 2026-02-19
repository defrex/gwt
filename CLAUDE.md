# CLAUDE.md

## Overview

`gwt` is a git worktree manager. It's a single bash script (`gwt`) with a thin shell wrapper (`gwt.sh`) for cd integration.

## Architecture

- `gwt` — standalone bash executable with subcommand dispatch (`add`, `ls`, `rm`, `clean`)
- `gwt.sh` — shell function sourced in zsh that wraps `gwt` to capture stdout path and `cd` into it

### Key design constraint

All informational output (messages, warnings, errors) goes to **stderr**. Only the worktree path from `add` goes to **stdout**. This lets the shell wrapper capture just the path for `cd`.

Terminal title escape codes go to `/dev/tty` (not stdout or stderr).

### How worktrees are located

The project root is derived from `git worktree list` (first entry = main worktree), not from `$PWD`. This means all commands work correctly from inside any worktree in the project.

Worktree directories are created as siblings: `<parent>/<project>-<safe-branch-name>`.

## Subcommands

- `add <branch>` / `<branch>` (implicit) — create or switch to worktree, runs `worktree-init.sh` if present
- `ls` — list worktrees (passthrough to `git worktree list`)
- `rm <name>` — remove worktree, delete local branch only if pushed to remote
- `clean [--dry-run]` — remove worktrees with merged GitHub PRs (requires `gh`)

## Installation

Symlinked into place (not copied):
- `~/bin/gwt` → `<repo>/gwt`
- `~/.zshrc.d/gwt.sh` → `<repo>/gwt.sh`

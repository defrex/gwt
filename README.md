# gwt

Git worktree manager. Creates worktrees as sibling directories and manages their lifecycle.

## Installation

Clone the repo, then symlink the executable and shell wrapper:

```bash
# Make executable
chmod +x gwt

# Add to PATH (ensure ~/bin is in your PATH)
ln -sf "$(pwd)/gwt" ~/bin/gwt

# Shell wrapper (enables cd into new worktrees)
# Source this from your .zshrc or equivalent
ln -sf "$(pwd)/gwt.sh" ~/.zshrc.d/gwt.sh
```

Then restart your shell or `source ~/.zshrc`.

## Usage

```
gwt <branch>            Create/switch to a worktree (shorthand for 'add')
gwt add <branch>        Create/switch to a worktree
gwt ls                  List project worktrees
gwt rm <name>           Remove a worktree
gwt clean [--dry-run]   Remove worktrees with merged PRs
gwt help                Show help
```

### `gwt add <branch>` / `gwt <branch>`

Creates a new worktree for `<branch>` as a sibling directory named `<project>-<branch>`. If the branch already exists, it checks it out; otherwise creates a new branch from the default branch (main/master).

If a worktree already exists for the branch, switches to it instead.

```bash
# From your main worktree (e.g. myapp/)
gwt feat/login
# Creates ../myapp-feat-login and cd's into it

gwt add fix/typo
# Creates ../myapp-fix-typo and cd's into it

# Also works from inside a secondary worktree
cd ../myapp-feat-login
gwt fix/typo
# Still creates ../myapp-fix-typo (derives project root from git)
```

### `gwt ls`

Lists all worktrees for the current git project.

```bash
gwt ls
```

### `gwt rm <name>`

Removes a worktree by branch name. Deletes the local branch only if it has been pushed to the remote.

```bash
gwt rm feat/login
```

### `gwt clean [--dry-run]`

Removes worktrees whose branches have merged PRs on GitHub. Requires the GitHub CLI (`gh`).

```bash
gwt clean           # Remove merged worktrees
gwt clean --dry-run # Show what would be removed
```

## worktree-init.sh

When creating a new worktree, `gwt` looks for a `worktree-init.sh` script in the main worktree. If found, it's copied into the new worktree and executed. Use this for project-specific setup like installing dependencies, copying `.env` files, etc.

The script should be gitignored since it typically contains machine-specific paths.

## Shell Integration

The `gwt.sh` wrapper is a thin shell function that captures the worktree path from `gwt add` and `cd`s into it. Commands like `ls`, `rm`, `clean`, and `help` are passed through directly without path capture.

This is necessary because a subprocess (the `gwt` executable) can't change the parent shell's working directory.

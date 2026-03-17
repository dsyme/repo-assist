# Repo Assist App — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-03-16  
**Status:** Active — functional app running on Linux, macOS, Windows, and WSL2

---

## 1. Vision & Problem Statement

### The Problem

Open-source and internal-source maintainers managing multiple repositories are overwhelmed. GitHub's web UI is designed for individual-repo workflows. In the agentic era, automated workflows like **Repo Assist** run continuously — labelling issues, investigating bugs, opening fix PRs, maintaining dependency updates, and posting monthly summaries. But maintainers still have to manually visit each repo, scan notifications, figure out what changed, and decide what to act on.

There is no unified "command center" view across repositories that shows:
- What the automations did overnight
- Which issues have new investigation comments worth reading
- Which PRs are ready for review/merge
- Which automation items need human attention ("Please Take a Look")
- A synthesized recap of recent cross-repo activity

### The Vision

**Repo Assist App** is a cross-platform Electron desktop application that serves as the maintainer's morning dashboard. It connects to GitHub exclusively through the `gh` CLI (inheriting auth context), uses AI (GPT-4o-mini via GitHub Models) to synthesize a recap of cross-repository activity, and provides low-click access to issues, PRs, automation runs, and workflow specifications.

The app embraces the model where **most work is done by automated workflows** and the **human's role is supervisory**: reviewing, merging, commenting, and filing new issues.

### Key Principles

1. **GitHub is the database** — All persistent state (issues, PRs, comments, workflow specs, action runs) lives on GitHub. The app is a read-heavy client.
2. **`gh` CLI is the API layer** — All GitHub interaction happens via `gh` commands, inheriting the user's auth context. No OAuth flows, no token management.
3. **AI-enriched recap** — GPT-4o-mini (via `gh models run`) synthesizes a weekly-digest-style summary from recent activity across repos.
4. **PTAL (Please Take a Look)** — Automated scanning detects recent bot activity on issues and PRs that need human attention.
5. **Read-only by default** — All writes are dry-run by default. A persistent `write-mode` toggle enables actual writes (comments, merges, approvals).
6. **Low-click morning workflow** — A maintainer should be able to assess overnight activity across 10+ repos in under 5 minutes.
7. **Transparency** — Every `gh` command the app runs is visible in a command log with timing, exit code, and mode.
8. **Repo list portability** — Users choose between local storage or a private `.repo-assist-app` GitHub repo for cross-machine sync of their repository list.

---

## 2. Architecture & Technology

### Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Desktop Shell** | Electron 41 | Native window on macOS, Linux, Windows, and WSL2 (via WSLg) |
| **UI Framework** | React 19 + TypeScript 5.9 (strict) | Industry standard; strict mode catches errors at compile time |
| **Design System** | Primer React 38 + Octicons | GitHub's own design system — the app looks and feels like GitHub |
| **Build Tool** | Vite 7 via `electron-vite` | Three build targets: main, preload, renderer |
| **CSS** | Single global stylesheet + Primer CSS custom properties | Dark theme, status colors, minimal inline styles |
| **Styling-in-JS** | styled-components 6 | Used alongside global CSS for component-specific styles |
| **Markdown** | marked 17 | Renders issue/PR bodies with HTML sanitization |
| **Main Process** | Node.js (Electron main) | `GhBridge` (gh CLI), `LocalState` (JSON files), IPC handlers |
| **GitHub Integration** | `gh` CLI via `execFile` | No shell — prevents injection. 30s timeout, 10MB buffer |
| **AI Recap** | `gh models run openai/gpt-4o-mini` | GitHub Models extension; auto-install prompt if missing |
| **Local State** | JSON files in `~/.repo-assist/` | Read state, settings, recap cache, PTAL cache (mode 0600) |

### Process Architecture

```
┌──────────────────────────────────────────────┐
│  Electron App                                │
│                                              │
│  ┌──────────────┐       ┌─────────────────┐  │
│  │  Renderer    │  IPC  │  Main Process   │  │
│  │  React 19 +  │◄────►│  GhBridge       │  │
│  │  Primer 38   │       │  LocalState     │  │
│  └──────┬───────┘       └────────┬────────┘  │
│         │                        │           │
│  ┌──────┴───────┐       ┌────────┴────────┐  │
│  │  Preload     │       │ ~/.repo-assist/ │  │
│  │  contextBridge       │ read-state.json │  │
│  │  window.repoAssist   │ settings.json   │  │
│  └──────────────┘       │ recap-cache.json│  │
│                         │ ptal-*.json     │  │
│                         └─────────────────┘  │
│                                │              │
│                         gh CLI (execFile)     │
└────────────────────────────────┼──────────────┘
                                 │
                          ┌──────┴──────┐
                          │   GitHub    │
                          │  API / CLI  │
                          └─────────────┘
```

**Data flow:** Component → `window.repoAssist.method()` → IPC invoke → preload → main process → `GhBridge` (gh CLI) or `LocalState` (JSON) → IPC reply → setState.

All GitHub data flows through `GhBridge.exec()` which spawns `gh` as a child process via `execFile` (not shell), parses JSON output, and logs every command to an in-memory ring buffer (500 entries).

### Security Model

- **Context isolation:** enabled — renderer cannot access Node.js APIs directly
- **Node integration:** disabled in renderer
- **Preload script:** only exposes explicitly declared IPC methods via `contextBridge`
- **Write mode toggle:** all write operations are dry-run by default; user must enable write mode
- **Command execution:** `GhBridge.exec()` uses `execFile` (not shell) to prevent injection
- **HTML sanitization:** `<script>` tags and event handler attributes stripped from all rendered markdown
- **Local state permissions:** `~/.repo-assist/` directory (mode 0700), files (mode 0600)

### WSL2 Strategy

Electron apps run natively on WSL2 via **WSLg** (built into Windows 11). The app detects WSL2 and applies `--no-sandbox` for compatibility. A `setup-wsl.sh` script installs required system libraries (libnss3, libatk, etc.) for headless rendering. The `install.sh` script handles this automatically.

---

## 3. User Experience & Features

### 3.1 Application Layout

The app uses a **sidebar + main content** layout:

```
┌──────────────────────────────────────────────────────────────┐
│  Repo Assist                           [Write Mode ○] [Zoom]│
├──────────┬───────────────────────────────────────────────────┤
│ SIDEBAR  │ MAIN CONTENT                                     │
│          │                                                   │
│ ▸ Recap  │ (Selected view content)                           │
│ ▸ PTAL   │                                                   │
│ + Add    │                                                   │
│          │ - Issue/PR lists                                   │
│ ▾ Repos  │ - Detail panels (issue, PR, automation)           │
│  ▾ org/r1│ - Recap markdown                                  │
│   Recap  │ - PTAL items                                      │
│   PTAL   │ - Command log                                     │
│   Autos  │ - Automation catalog + runs                       │
│   Issues │                                                   │
│   PRs    │                                                   │
│  ▸ org/r2│                                                   │
│          │                                                   │
│ ▸ Cmds   │                                                   │
└──────────┴───────────────────────────────────────────────────┘
```

**Sidebar (Primer `TreeView`)**
- **Recap**: Cross-repository AI-generated weekly digest
- **PTAL (Please Take a Look)**: Bot activity items needing human review, with count badge
- **Add Repository**: Search and add repos via GitHub search
- **Per-repo tree** — each repo expands to:
  - **Recap**: Per-repo AI recap
  - **PTAL**: Per-repo automation items
  - **Automations**: Workflow catalog grouped by type
  - **Issues**: Issue list with unread count
  - **PRs**: PR list with unread count
- **Command Log**: Full audit trail of `gh` commands
- Refresh and Remove buttons on hover per repo
- Counter labels show unread counts and PTAL item counts

**Main Content Area**
- Renders the selected view (list, detail, recap, log)
- Detail panels overlay the list view; Escape key closes them
- Markdown rendered with GitHub-style formatting
- GitHub issue/PR links intercepted: normal click navigates in-app, Shift+click opens in browser

### 3.2 PTAL — Please Take a Look

The PTAL system is a **heuristic scanner** that detects recent automation activity requiring human attention.

**How it works:**
1. `GhBridge.scanPTAL()` iterates across all configured repos
2. For each repo, fetches open issues and PRs
3. Detects items with recent bot-initiated activity (comments, commits)
4. Filters out items the user has already cleared (tracked in `ptal-cleared.json`)
5. Returns `PTALItem[]` with repo, number, title, type (issue/PR), and last activity details

**Each PTAL item shows:**
- Action description (e.g., "Check comment on #136 — Fix lazy series")
- Repo and item number
- Activity type, actor, and timestamp
- One-click navigation to the issue/PR detail
- Clear button with fade-out animation

**PTAL is available both cross-repo (top-level) and per-repo (in the repo tree).**

PTAL results are cached in `ptal-cache.json` and auto-refreshed in the background.

### 3.3 Recap (AI-Synthesized Activity Summary)

The Recap generates a **weekly-digest-style markdown summary** of cross-repository activity using GPT-4o-mini via the `gh models` extension.

**Data gathering:**
1. Scans PTAL items (automation activity)
2. Fetches recently merged PRs across all repos (last 14 days)
3. Fetches recently closed issues across all repos
4. Fetches newly opened issues
5. Builds structured markdown sections with GitHub links

**AI synthesis:**
- Gathers the above data into a formatted prompt
- Calls `gh models run openai/gpt-4o-mini` requesting a concise weekly digest
- Result is cached with timestamp in `recap-cache.json`
- Manual "Refresh" button re-runs synthesis; "Clear" button forces regeneration

**Extension management:**
- The app checks if `gh-models` extension is installed
- If missing, prompts the user and offers one-click install
- Recap is available both cross-repo (all repos) and per-repo

### 3.4 Issue List & Detail

**List View:**
- Open issues fetched via `gh issue list --limit 200 --state open`
- Grouped by primary label (bug, enhancement, etc.)
- Each group shows total count and unread count
- **Bold title** = unread (issue `updatedAt` > stored `last_read_at`)
- Click marks as read and opens detail

**Detail View:**
- Full issue body rendered as sanitized markdown
- Comment thread (initial 20, paginated)
- Labels, author, creation date
- **Write-mode actions:** Close as completed, close as not planned, add comment
- Automation identity detection: parses "Generated by [Name](url)" from body

### 3.5 PR List & Detail

**List View:**
- Open PRs fetched via `gh pr list --limit 50 --state open`
- CI status icons inline (red ✗, yellow ◷, green ✓)
- Branch status fetched async (behind by N commits)
- Bot PRs visually distinguished

**Detail View:**
- PR body rendered as sanitized markdown with truncation for very long bodies
- **Diff view:** Collapsible unified diff with colored additions/deletions
- **CI checks:** Live polling of status checks with expandable details
- **Timeline:** Commits, force pushes, reviews, comments with timestamps
- **Write-mode actions:** Approve, merge (squash), mark ready (draft→ready), update branch, add comment, close

### 3.6 Automations Catalog

For each repository, workflows are **classified into four categories:**

| Category | Detection Logic | Icon |
|----------|----------------|------|
| **Agentic** | Has `.lock.yml` companion file (from `gh-aw`) | 🤖 |
| **Copilot** | Path starts with `dynamic/` and name contains "copilot" | ✨ |
| **GitHub** | Built-in workflows (Dependabot, pages-build-deployment) | 🔧 |
| **CI/CD** | Everything else | ⚙️ |

**Features:**
- Grouped by category (agentic first, then CI/CD, copilot, github)
- Recent runs per workflow with duration calculation (e.g., "3d ago", "2w ago")
- Click to expand detail: spec file content, run history
- For agentic workflows: render `.md` spec as markdown; checks for `repo-assist.md` and `repo-assist.lock.yml`
- Run history with trigger type icons (schedule, manual, push, issue_comment)
- `gh-aw` extension auto-install for agentic workflow support

### 3.7 Automation Runs

- Fetched via `gh run list` (skipped/cancelled runs filtered out)
- Shows: workflow name, status/conclusion, trigger event, timing
- Status icons: in-progress spinner, success check, failure X, etc.
- Filterable by workflow

### 3.8 Command Log

A scrollable panel showing every `gh` command the app has executed:
- Command string, exit code (success/danger label), mode (read/write/dry-run), duration, timestamp
- Newest first (reversed chronological)
- Polls for updates every 3 seconds
- In-memory ring buffer capped at 500 entries

### 3.9 Repository Management

**Adding repos:**
- "Add Repository" in sidebar opens a search dialog
- Searches GitHub via `gh search repos`
- Shows matching repos with description
- Added repos appear immediately in the tree

**Repo list storage (user-selectable):**
- **Local mode:** Repos stored in `~/.repo-assist/settings.json`
- **Remote mode:** Repos stored in a private `.repo-assist-app` GitHub repository (auto-created if needed), enabling cross-machine sync
- On first launch, the app detects whether a remote `.repo-assist-app` repo exists and prompts the user to choose
- Default seed repos provided for first-time users

**Per-repo actions:**
- Refresh: re-fetches all data for one repo
- Remove: removes repo from monitored list
- Each repo independently tracks issues, PRs, runs, automations

### 3.10 Write Mode

The app operates in **read-only mode** by default. All write operations produce a dry-run log entry showing what would have been executed, without making any changes.

A persistent toggle in the header enables **write mode**. When enabled:
- Comments can be posted on issues and PRs
- PRs can be approved, merged (squash), marked ready, or have their branch updated
- Issues can be closed (as completed or not planned)
- All write commands are logged with mode "write" in the command log

The toggle state persists across sessions in `~/.repo-assist/settings.json`.

### 3.11 Keyboard & UI

- **Escape** closes detail panels and returns to list view
- **Ctrl+/Ctrl-** zoom in/out (persisted)
- **GitHub link interception:** clicking `#N` references navigates in-app; Shift+click opens in browser
- **Dark theme** via Primer CSS custom properties
- **Status colors:** `.gh-icon-open` (green), `.gh-icon-closed` (red), `.gh-icon-merged` (purple)
- **ErrorBoundary** wraps the entire app — render crashes show a copyable error report with dismiss button

---

## 4. Data Model

### 4.1 Key Types (from `src/shared/types.ts`)

| Type | Description |
|------|-------------|
| `RepoIssue` | Issue summary (number, title, labels, author, dates, comment count) |
| `RepoPR` | PR summary (number, title, CI status, draft state, review decision) |
| `RepoRun` | Workflow run (id, title, status, conclusion, event, workflow name) |
| `RepoWorkflow` | Workflow definition (id, name, path, state) |
| `IssueDetail` | Full issue with body, comments, labels, timeline |
| `PRDetail` | Full PR with body, comments, reviews, files, checks, timeline |
| `PRCheck` | CI check result (name, status, conclusion, URL) |
| `PRTimelineEvent` | Timeline entry (commits, force pushes, reviews) |
| `PRBranchStatus` | Branch comparison (behindBy count, merge status) |
| `PTALItem` | PTAL entry (repo, number, type, title, lastActivity details) |
| `RecapSummary` | AI recap (markdown content, generatedAt timestamp, optional error) |
| `NavState` | Current navigation (section, repo, repoSection, selectedItem) |
| `RepoAssistAPI` | Complete typed API exposed via `window.repoAssist` |

### 4.2 Local State Files (`~/.repo-assist/`)

| File | Contents |
|------|----------|
| `read-state.json` | `{ "owner/repo#N": "ISO-timestamp" }` — tracks what user has viewed |
| `settings.json` | Write mode, custom repos, zoom factor, repo storage preference |
| `recap-cache.json` | Cached AI recaps per repo and cross-repo, with generation timestamps |
| `ptal-cleared.json` | `{ "owner/repo#N": "activityId" }` — cleared PTAL items |
| `ptal-cache.json` | `{ items: PTALItem[], cachedAt: timestamp }` — cached PTAL scan |

All files use mode 0600. The directory uses mode 0700.

### 4.3 Unread Detection

An issue or PR is "unread" if:
- Its `updatedAt` timestamp is newer than the stored `last_read_at` in `read-state.json`
- OR no read-state entry exists for that item

Viewing an item's detail automatically updates `last_read_at` to the current time.

---

## 5. Non-Functional Requirements

### Performance
- Initial load of 10 repos × 200 issues parallelized across repos
- Background PTAL scanning and recap generation (non-blocking UI)
- Branch status checks fetched lazily per PR (not on list load)
- Command log limited to 500 entries to bound memory

### Security
- No tokens stored by the app — delegates entirely to `gh` CLI auth
- Local state files are user-readable only (0600 permissions)
- No network calls except through `gh` CLI
- No telemetry, no analytics
- `execFile` (not shell) prevents command injection
- Markdown sanitized before rendering (scripts + event handlers stripped)
- Context isolation separates renderer from Node.js APIs

### Reliability
- Try-catch with silent fallbacks throughout — never crash the UI
- `ErrorBoundary` catches render crashes with copyable diagnostic report
- IPC errors logged server-side, re-thrown to renderer for user alerts
- Missing `gh` extensions detected gracefully with install prompts

### Scalability Targets
- 1–20 repositories monitored
- Up to 200 issues per repo (configurable limit)
- Up to 50 PRs per repo
- 500 command log entries

---

## 6. Build & CI

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev mode with Vite hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | TypeScript strict validation (quality gate) |

**CI** (GitHub Actions) runs on every push/PR to `main`:
- Matrix: `ubuntu-latest`, `windows-latest`, `macos-latest`
- Steps: `npm ci` → `npm run typecheck` → `npm run build`
- Node 20

No ESLint or Prettier — TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`) is the quality gate.

---

## 7. Key Design Decisions

1. **Electron desktop app** — Real native window on all platforms including WSL2 (via WSLg). No browser workaround.
2. **`gh` CLI over REST/GraphQL SDK** — Eliminates token management, leverages existing auth, transparent via command log.
3. **JSON files over SQLite** — Simpler, no native module compilation. Sufficient for read-state tracking and caching.
4. **AI via GitHub Models extension** — `gh models run openai/gpt-4o-mini` avoids separate API key management. Extension auto-install if missing.
5. **Read-only default + write-mode toggle** — Prevents accidental writes. Dry-run logging provides audit trail.
6. **PTAL heuristic scanning** — Detects bot activity that needs human attention without requiring webhook infrastructure.
7. **Primer React** — Matches GitHub's visual language exactly, maintained by GitHub, comprehensive component library.
8. **Repo list storage choice** — Local JSON for simplicity or remote `.repo-assist-app` repo for cross-machine sync. User prompted on first launch.
9. **`execFile` not shell** — Prevents command injection. All `gh` commands parsed into args array.
10. **No polling interval** — Data fetched on navigation and manual refresh. Background refresh for PTAL and recap only.

# AGENTS.md — Coding Agent Instructions

## Project Overview

Repo Assist is a cross-platform Electron desktop app for GitHub repository maintainers.
It manages issues, PRs, automation workflows, and CI status across multiple repos from
one window, powered entirely by the `gh` CLI — no OAuth tokens or direct API calls.

## Architecture

```
src/
  main/           Electron main process (IPC handlers, gh CLI bridge, local state)
  preload/        Context bridge — securely exposes window.repoAssist API to renderer
  renderer/       React UI (Primer React v38, styled-components, single global CSS)
  shared/         TypeScript types shared across all processes
```

**Data flow:** Component → `window.repoAssist.method()` → IPC invoke → preload →
main process → `GhBridge` (gh CLI) or `LocalState` (JSON files) → IPC reply → setState.

All GitHub data flows through `GhBridge.exec()` which spawns `gh` as a child process,
parses JSON output, and logs every command. There are no direct GitHub REST/GraphQL calls
outside of `gh api` subcommands.

## Key Files

| File | Role |
|------|------|
| `src/main/index.ts` | App lifecycle, window creation, all IPC handler registrations |
| `src/main/gh-bridge.ts` | `GhBridge` class — all GitHub operations via `gh` CLI |
| `src/main/local-state.ts` | `LocalState` class — JSON persistence in `~/.repo-assist/` |
| `src/preload/index.ts` | Context bridge exposing `window.repoAssist` typed API |
| `src/renderer/App.tsx` | Root component — owns all top-level state, orchestrates data loading |
| `src/shared/types.ts` | Shared type definitions (`RepoIssue`, `PRDetail`, `NavState`, etc.) |

## Build & Tooling

- **Electron 41 + Vite 7** via `electron-vite` — three build targets (main, preload, renderer)
- **React 19 + Primer React 38** — GitHub's design system with dark theme
- **TypeScript 5.9** strict mode — `noUnusedLocals`, `noUnusedParameters` enabled
- **No ESLint/Prettier** — TypeScript strict typecheck is the quality gate
- **CI** runs `npm run typecheck && npm run build` on ubuntu, windows, macos (Node 20)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev mode with hot reload |
| `npm run build` | Production build to `dist/` |
| `npm run typecheck` | TypeScript strict validation — must pass before merging |

## Conventions

### Naming
- **Files:** kebab-case (`gh-bridge.ts`, `local-state.ts`)
- **Components:** PascalCase files and exports (`DetailPanel.tsx`, `AutomationsList.tsx`)
- **IPC channels:** namespaced colon format (`gh:getIssues`, `app:showMessageBox`)
- **Types:** domain-prefixed PascalCase (`RepoIssue`, `PRDetail`, `PTALItem`)
- **Repo identifiers:** always `"owner/repo"` strings

### State Management
- Pure React hooks — no Redux, Zustand, or external state libraries
- All top-level state lives in `App.tsx`; child components receive data + callbacks as props
- Background fetches (PTAL scan, recap generation) run in `useEffect` and merge results into state
- Refs used for memoization and stale-closure avoidance (`returnNavRef`, `ptalClearedKeysRef`)

### Styling
- Single global stylesheet at `src/renderer/styles/app.css`
- Primer CSS custom properties for theming (`--fgColor-default`, `--bgColor-muted`)
- Status colors via classes: `.gh-icon-open`, `.gh-icon-closed`, `.gh-icon-merged`
- Inline styles only for one-off layout tweaks (gap, margin)

### Error Handling
- Try-catch with silent fallbacks (empty arrays, null, loading spinners) — never crash the UI
- IPC errors logged server-side then re-thrown so the renderer can display alerts
- `ErrorBoundary` wraps the entire app to catch render crashes with a copyable report
- Markdown content is sanitized: `<script>` tags and event handlers are stripped

## Security Model

- **Context isolation:** enabled — renderer cannot access Node.js APIs directly
- **Node integration:** disabled in renderer
- **Preload script:** only exposes explicitly declared IPC methods via `contextBridge`
- **Write mode toggle:** all write operations are dry-run by default; user must enable write mode
- **Command execution:** `GhBridge.exec()` uses `execFile` (not shell) to prevent injection
- **HTML sanitization:** user-authored markdown stripped of scripts and event handlers before render
- **Local state permissions:** `~/.repo-assist/` files created with mode 0600

## Adding a New Feature

The typical pattern for adding functionality:

1. **Define types** in `src/shared/types.ts` if new data structures are needed
2. **Add GhBridge method** in `gh-bridge.ts` (use `this.exec()` for gh commands)
3. **Register IPC handler** in `src/main/index.ts` using `ipcHandle('gh:newMethod', ...)`
4. **Expose in preload** — add to the `contextBridge.exposeInMainWorld` object in `src/preload/index.ts`
5. **Update `RepoAssistAPI`** type in `src/shared/types.ts` to include the new method
6. **Call from renderer** via `window.repoAssist.newMethod()` in the appropriate component
7. **Run `npm run typecheck`** — the type system will catch any mismatches across the boundary

For write operations, always check `writeMode` and log as dry-run when disabled.

## Patterns to Follow

- All GitHub data must go through `GhBridge` — never call `gh` directly from renderer or preload
- Keep components focused: data fetching happens in `App.tsx` or via IPC; components render
- Use Primer React components (`Button`, `Flash`, `TreeView`, `Dialog`) over custom HTML
- IPC channel names follow `namespace:verbNoun` convention (`gh:getPRs`, `app:zoomIn`)
- Repo keys in state use `"owner/repo#number"` format for issue/PR identification
- Unread tracking compares stored timestamp against `updatedAt` from GitHub

## Testing

There are no automated tests. TypeScript strict mode and CI typecheck/build across three
OS targets are the current quality gates. When writing new code, ensure `npm run typecheck`
passes cleanly.

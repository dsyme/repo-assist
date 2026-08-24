# Contributing to Repo Assist

Repo Assist is primarily maintained through agentic development under human guidance. Maintainers
discuss proposed work and then direct coding agents to make the complete change, including
implementation, validation, documentation, and other affected files.

## Start With an Issue

We generally prefer contributions as [GitHub issues] rather than pull requests. Search for an
existing report first. Issues may include proposed changes, patches, screenshots, or links to forks
or branches. Maintainers may refine the scope and assign the issue to an agent to implement and
validate the complete change.

## Automated Repo Assist

This repository also uses the [Repo Assist automation]. It runs regularly and may triage or respond
to issues, investigate bugs, suggest improvements, and attempt implementations as draft pull
requests. Its work is identified as automated and remains subject to human review; the automation
does not merge pull requests or make final maintenance decisions.

Maintainers can invoke it with `/repo-assist <instructions>` for a specific agentic task, such as
investigating an issue, preparing a fix, adding validation, or updating documentation.

## Pull Requests

Every pull request must have a matching issue that has been discussed with the maintainers. Link the
pull request to that issue and keep it focused. Maintainers may close a pull request and use the issue
as the basis for an agent-produced implementation instead; the submitted analysis and code remain
valuable inputs to that work.

If a pull request is the agreed approach, follow [AGENTS.md], keep GitHub access behind `GhBridge`,
preserve the application's security model, and run:

```bash
npm run typecheck
npm run build
```

[AGENTS.md]: AGENTS.md
[GitHub issues]: https://github.com/dsyme/repo-assist/issues
[Repo Assist automation]: https://github.com/githubnext/agentics/blob/main/docs/repo-assist.md
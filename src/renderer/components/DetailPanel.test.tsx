import { describe, expect, it } from 'vitest'
import { parsePatchInstructions } from '../utils/parse-patch-instructions'

describe('parsePatchInstructions', () => {
  it('rejects option-like branch names', () => {
    const body = `
gh run download 12345 -n agent -D /tmp/agent-12345
bundle_path='/tmp/agent-12345/changes.bundle'
git checkout '-malicious-option'
git push origin -malicious-option
gh pr create --title "Change" --base main --head -malicious-option --repo owner/repo
`

    expect(parsePatchInstructions(body)).toBeNull()
  })

  it('continues to parse legacy patch recovery instructions', () => {
    const body = `
\`\`\`sh
gh run download 12345 -n agent -D /tmp/agent-12345
git checkout -b repo-assist/legacy
git am --3way /tmp/agent-12345/changes.patch
git push origin repo-assist/legacy
gh pr create --title "Legacy change" --base main --head repo-assist/legacy --repo owner/repo
\`\`\`
`

    expect(parsePatchInstructions(body)).toMatchObject({
      targetRepo: 'owner/repo',
      prTitle: 'Legacy change',
      branch: 'repo-assist/legacy',
    })
  })

  it('parses GH-AW bundle recovery instructions', () => {
    const body = `
\`\`\`sh
gh run download '32788484011' -n agent -D '/tmp/agent-32788484011'
bundle_path='/tmp/agent-32788484011/aw-repo-assist-ci-github-actions.bundle'
temp_ref='refs/bundles/create-pr-repo-assist-ci-github-actions-27d4bd679a496a41-4343a110'
target_ref='refs/heads/repo-assist/ci-github-actions-27d4bd679a496a41'
bundle_source_ref=$(git bundle list-heads "$bundle_path")
git fetch "$bundle_path" "\${bundle_source_ref}:\${temp_ref}"
git update-ref "$target_ref" "$temp_ref"
git checkout 'repo-assist/ci-github-actions-27d4bd679a496a41'
git reset --hard
git update-ref -d "$temp_ref"
git push origin repo-assist/ci-github-actions-27d4bd679a496a41
gh pr create --title '[repo-assist] Move CI' --base master --head repo-assist/ci-github-actions-27d4bd679a496a41 --repo fsprojects/Paket
\`\`\`
`

    expect(parsePatchInstructions(body)).toEqual({
      targetRepo: 'fsprojects/Paket',
      prTitle: '[repo-assist] Move CI',
      branch: 'repo-assist/ci-github-actions-27d4bd679a496a41',
      commands: [
        "gh run download '32788484011' -n agent -D '/tmp/agent-32788484011'",
        "bundle_path='/tmp/agent-32788484011/aw-repo-assist-ci-github-actions.bundle'",
        "git checkout 'repo-assist/ci-github-actions-27d4bd679a496a41'",
        'git push origin repo-assist/ci-github-actions-27d4bd679a496a41',
        "gh pr create --title '[repo-assist] Move CI' --base master --head repo-assist/ci-github-actions-27d4bd679a496a41 --repo fsprojects/Paket",
      ],
    })
  })
})
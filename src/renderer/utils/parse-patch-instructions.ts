export interface PatchInstructions {
  targetRepo: string
  prTitle: string
  branch: string
  commands: string[]
}

/** Parse artifact application instructions from an issue body. */
export function parsePatchInstructions(body: string): PatchInstructions | null {
  if (!body) return null
  const lines = body.split('\n').map(line => line.trim())

  const commandLines = lines.filter(line =>
    line.startsWith('gh run download ') ||
    line.startsWith('bundle_path=') ||
    line.startsWith('git checkout ') ||
    line.startsWith('git am ') ||
    line.startsWith('git push origin ') ||
    line.startsWith('gh pr create ')
  )

  const download = commandLines.find(line => line.startsWith('gh run download '))
  const bundlePath = commandLines.find(line => line.startsWith('bundle_path='))
  const checkout = commandLines.find(line => line.startsWith('git checkout '))
  const am = commandLines.find(line => line.startsWith('git am '))
  const push = commandLines.find(line => line.startsWith('git push origin '))
  const prCreate = commandLines.find(line => line.startsWith('gh pr create '))
  if (!download || !checkout || (!am && !bundlePath) || !push || !prCreate) return null

  const repoMatch = prCreate.match(/--repo\s+([a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+)/)
  if (!repoMatch) return null

  const titleMatch = prCreate.match(/--title\s+'([^']+)'/) || prCreate.match(/--title\s+"([^"]+)"/)
  const branchMatch = checkout.match(/^git checkout (?:-b )?['"]?([a-zA-Z0-9][a-zA-Z0-9._/-]*)['"]?$/)
  if (!branchMatch) return null

  return {
    targetRepo: repoMatch[1],
    prTitle: titleMatch ? titleMatch[1] : 'Patch PR',
    branch: branchMatch[1],
    commands: [download, ...(bundlePath ? [bundlePath] : []), checkout, ...(am ? [am] : []), push, prCreate],
  }
}
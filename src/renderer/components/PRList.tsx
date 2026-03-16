
import { useState, useEffect, useRef } from 'react'
import { Text, ActionList, Label, RelativeTime, Spinner } from '@primer/react'
import {
  GitPullRequestIcon,
  GitPullRequestDraftIcon,
  GitPullRequestClosedIcon,
  GitMergeIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  ArrowRightIcon,
  AlertIcon,
  SyncIcon,
} from '@primer/octicons-react'
import { RepoPR, PRBranchStatus } from '@shared/types'

interface PRListProps {
  repo: string
  prs: RepoPR[]
  writeMode: boolean
  onSelectItem: (number: number) => void
}

export function PRList({ repo, prs, writeMode, onSelectItem }: PRListProps) {
  const [markingReady, setMarkingReady] = useState<number | null>(null)
  const [updatingBranch, setUpdatingBranch] = useState<number | null>(null)
  // Optimistic overrides for PRs mutated in this view (e.g. draft → ready)
  const [localOverrides, setLocalOverrides] = useState<Record<number, Partial<RepoPR>>>({})
  // Cached branch status per PR number
  const [branchStatus, setBranchStatus] = useState<Record<number, PRBranchStatus>>({})
  const branchStatusFetched = useRef<Set<string>>(new Set())

  // Asynchronously fetch branch status for each PR (cached per repo+number)
  useEffect(() => {
    for (const pr of prs) {
      const key = `${repo}#${pr.number}`
      if (branchStatusFetched.current.has(key)) continue
      branchStatusFetched.current.add(key)
      window.repoAssist.getPRBranchStatus(repo, pr.number).then(status => {
        setBranchStatus(prev => ({ ...prev, [pr.number]: status }))
      }).catch(() => {
        // Ignore failures — status stays unknown
      })
    }
  }, [repo, prs])

  // Apply local overrides to props
  const effectivePRs = prs.map(pr => localOverrides[pr.number] ? { ...pr, ...localOverrides[pr.number] } : pr)
  const sorted = [...effectivePRs].sort((a, b) => {
    if (a.isDraft !== b.isDraft) return a.isDraft ? 1 : -1
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  })

  /** Render compact CI check icons — green ticks, red Xs, yellow clocks */
  const renderCIIcons = (pr: RepoPR) => {
    if (!pr.statusCheckRollup || pr.statusCheckRollup.length === 0) return null
    const passed = pr.statusCheckRollup.filter(s => s.conclusion === 'SUCCESS' || s.conclusion === 'NEUTRAL').length
    const failed = pr.statusCheckRollup.filter(s => s.conclusion === 'FAILURE' || s.conclusion === 'CANCELLED' || s.conclusion === 'TIMED_OUT' || s.conclusion === 'ERROR').length
    const pending = pr.statusCheckRollup.filter(s => s.status === 'IN_PROGRESS' || s.status === 'QUEUED' || s.status === 'PENDING' || (!s.conclusion && s.status !== 'COMPLETED')).length
    return (
      <span className="ci-check-icons">
        {failed > 0 && <span className="ci-icon-group" title={`${failed} failing`}><XCircleIcon size={14} className="gh-icon-danger" />{failed > 1 && <span className="ci-icon-count">{failed}</span>}</span>}
        {pending > 0 && <span className="ci-icon-group" title={`${pending} pending`}><ClockIcon size={14} className="gh-icon-attention" />{pending > 1 && <span className="ci-icon-count">{pending}</span>}</span>}
        {passed > 0 && <span className="ci-icon-group" title={`${passed} passing`}><CheckCircleIcon size={14} className="gh-icon-success" />{passed > 1 && <span className="ci-icon-count">{passed}</span>}</span>}
      </span>
    )
  }

  const handleMarkReady = async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setMarkingReady(prNumber)
    try {
      await window.repoAssist.markPRReady(repo, prNumber)
      // Optimistic update: mark as no longer draft
      setLocalOverrides(prev => ({ ...prev, [prNumber]: { isDraft: false } }))
    } finally {
      setMarkingReady(null)
    }
  }

  const handleUpdateBranch = async (e: React.MouseEvent, prNumber: number) => {
    e.stopPropagation()
    setUpdatingBranch(prNumber)
    try {
      await window.repoAssist.updatePRBranch(repo, prNumber)
      // Optimistic update: mark as up-to-date
      setBranchStatus(prev => ({ ...prev, [prNumber]: { behindBy: 0, status: 'up_to_date' } }))
    } finally {
      setUpdatingBranch(null)
    }
  }

  const isRepoAssist = (pr: RepoPR) => pr.labels?.some(l => l.name === 'repo-assist')

  return (
    <div>
      <div className="panel-header">
        <h2>Pull Requests — {repo.split('/').pop()}</h2>
        <span className="subtitle">
          {prs.length} open PRs
          {!writeMode && ' · Read-only mode'}
        </span>
      </div>

      <ActionList>
        {sorted.map(pr => {
          const isBot = isRepoAssist(pr)
          return (
            <div key={pr.number} className="pr-list-item-wrapper">
              <ActionList.Item onSelect={() => onSelectItem(pr.number)}>
                <ActionList.LeadingVisual>
                  {pr.isDraft
                    ? <GitPullRequestDraftIcon size={16} className="gh-icon-draft" />
                    : pr.state === 'MERGED'
                      ? <GitMergeIcon size={16} className="gh-icon-merged" />
                      : pr.state === 'CLOSED'
                        ? <GitPullRequestClosedIcon size={16} className="gh-icon-closed" />
                        : <GitPullRequestIcon size={16} className="gh-icon-open" />
                  }
                </ActionList.LeadingVisual>
                <div>
                  <Text weight="semibold">
                    #{pr.number} {pr.title.replace('[Repo Assist] ', '')}
                  </Text>
                  <div className="pr-meta">
                    {renderCIIcons(pr)}
                    {branchStatus[pr.number]?.status === 'behind' && (
                      <span className="ci-icon-group" title={`${branchStatus[pr.number].behindBy} commit${branchStatus[pr.number].behindBy !== 1 ? 's' : ''} behind base branch`}>
                        <AlertIcon size={14} className="gh-icon-attention" />
                      </span>
                    )}
                    {isBot && (
                      <Label variant="accent">🤖 Repo Assist</Label>
                    )}
                    <Text size="small" style={{ color: 'var(--fgColor-muted)' }}>
                      by {pr.author?.login ?? 'unknown'}
                    </Text>
                    <RelativeTime date={new Date(pr.updatedAt)} />
                  </div>
                </div>
              </ActionList.Item>
              <div className="pr-hover-actions">
                {branchStatus[pr.number]?.status === 'behind' && (
                  <span
                    className="update-branch-btn"
                    title={`Update branch (${branchStatus[pr.number].behindBy} commit${branchStatus[pr.number].behindBy !== 1 ? 's' : ''} behind)`}
                    onClick={(e) => handleUpdateBranch(e, pr.number)}
                  >
                    {updatingBranch === pr.number ? (
                      <Spinner size="small" />
                    ) : (
                      <SyncIcon size={14} className="gh-icon-attention" />
                    )}
                  </span>
                )}
                {pr.isDraft && (
                  <span
                    className="draft-ready-btn"
                    title="Mark as ready for review"
                    onClick={(e) => handleMarkReady(e, pr.number)}
                  >
                    {markingReady === pr.number ? (
                      <Spinner size="small" />
                    ) : (
                      <>
                        <GitPullRequestDraftIcon size={14} className="gh-icon-draft" />
                        <ArrowRightIcon size={10} />
                        <GitPullRequestIcon size={14} className="gh-icon-open" />
                      </>
                    )}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </ActionList>

      {prs.length === 0 && (
        <div className="empty-state">
          <Text>No open pull requests</Text>
        </div>
      )}
    </div>
  )
}

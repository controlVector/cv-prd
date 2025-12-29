import { useState, useEffect } from 'react'
import { listPRDs, optimizePRD, getPRD } from '../services/api'
import { ExportDialog } from './ExportDialog'
import { MarkdownViewer } from './MarkdownViewer'
import type { PRDSummary } from '../types'

interface PRDListProps {
  onSelectPRD: (prdId: string) => void
}

export function PRDList({ onSelectPRD }: PRDListProps) {
  const [prds, setPrds] = useState<PRDSummary[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [optimizingPRD, setOptimizingPRD] = useState<string | null>(null)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [viewingPRD, setViewingPRD] = useState<any>(null)
  const [loadingViewer, setLoadingViewer] = useState<string | null>(null)

  useEffect(() => {
    loadPRDs()
  }, [])

  const loadPRDs = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await listPRDs()
      setPrds(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load PRDs')
    } finally {
      setIsLoading(false)
    }
  }

  const handleOptimize = async (prdId: string, prdName: string) => {
    setOptimizingPRD(prdId)
    setError(null)
    try {
      const result = await optimizePRD(prdId, 'AI Paired Programming')
      alert(`✓ PRD "${prdName}" optimized successfully!\n\n` +
        `Updated: ${result.statistics.facts_updated} facts\n` +
        `Created: ${result.statistics.facts_created} new facts\n` +
        `New relationships: ${result.statistics.relationships_created}\n\n` +
        `Assessment: ${result.analysis.overall_assessment}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to optimize PRD')
      alert(`Failed to optimize PRD: ${err.response?.data?.detail || err.message}`)
    } finally {
      setOptimizingPRD(null)
    }
  }

  const handleViewMarkdown = async (prdId: string) => {
    setLoadingViewer(prdId)
    try {
      const prdData = await getPRD(prdId)
      setViewingPRD(prdData)
    } catch (err: any) {
      alert(`Failed to load PRD: ${err.response?.data?.detail || err.message}`)
    } finally {
      setLoadingViewer(null)
    }
  }

  if (isLoading) {
    return <div className="loading">Loading PRDs...</div>
  }

  if (error) {
    return <div className="error-message">{error}</div>
  }

  return (
    <div className="prd-list">
      <div className="list-header">
        <h2>Your PRDs</h2>
        <div className="list-actions">
          <button
            onClick={() => setShowExportDialog(true)}
            className="btn-secondary"
            disabled={prds.length === 0}
          >
            Export
          </button>
          <button onClick={loadPRDs} className="btn-secondary">
            Refresh
          </button>
        </div>
      </div>

      <ExportDialog
        isOpen={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        prds={prds}
      />

      {viewingPRD && (
        <MarkdownViewer
          prd={viewingPRD}
          onClose={() => setViewingPRD(null)}
        />
      )}

      {prds.length === 0 ? (
        <p className="empty-state">
          No PRDs yet. Create your first PRD to get started!
        </p>
      ) : (
        <div className="prd-grid">
          {prds.map((prd) => (
            <div key={prd.id} className="prd-card" onClick={() => onSelectPRD(prd.id)}>
              <div className="prd-card-content">
                <h3>{prd.name}</h3>
                {prd.description && <p className="prd-description">{prd.description}</p>}
                <div className="prd-stats">
                  <span className="stat">
                    <strong>{prd.chunk_count}</strong> requirements
                  </span>
                </div>
              </div>
              <div className="prd-card-cta">
                <span className="cta-text">Open PRD</span>
                <span className="cta-arrow">→</span>
              </div>
              <div className="prd-quick-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleViewMarkdown(prd.id)
                  }}
                  disabled={loadingViewer === prd.id}
                  className="btn-sm"
                  title="Quick preview"
                >
                  {loadingViewer === prd.id ? '...' : 'Preview'}
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOptimize(prd.id, prd.name)
                  }}
                  disabled={optimizingPRD === prd.id}
                  className="btn-sm btn-optimize"
                  title="Optimize for AI"
                >
                  {optimizingPRD === prd.id ? '...' : 'Optimize'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

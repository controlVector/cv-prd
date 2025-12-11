import { useState, useEffect } from 'react'
import { listPRDs, optimizePRD } from '../services/api'
import { ExportDialog } from './ExportDialog'
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

      {prds.length === 0 ? (
        <p className="empty-state">
          No PRDs yet. Create your first PRD to get started!
        </p>
      ) : (
        <div className="prd-grid">
          {prds.map((prd) => (
            <div key={prd.id} className="prd-card">
              <div className="prd-card-content" onClick={() => onSelectPRD(prd.id)} style={{ cursor: 'pointer' }}>
                <h3>{prd.name}</h3>
                {prd.description && <p>{prd.description}</p>}
                <div className="prd-stats">
                  <span className="stat">
                    <strong>{prd.chunk_count}</strong> chunks
                  </span>
                </div>
                <div className="prd-click-hint">
                  👁️ Click to view details
                </div>
              </div>
              <div className="prd-actions">
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleOptimize(prd.id, prd.name)
                  }}
                  disabled={optimizingPRD === prd.id}
                  className="btn-primary"
                  style={{ marginTop: '10px' }}
                >
                  {optimizingPRD === prd.id ? 'Optimizing...' : '🤖 Optimize for AI Paired Programming'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { getPRD, optimizePRD } from '../services/api'
import { downloadMarkdown, copyMarkdownToClipboard } from '../utils/markdown-export'
import { MarkdownViewer } from './MarkdownViewer'

interface PRDDetailProps {
  prdId: string
  onBack: () => void
}

export function PRDDetail({ prdId, onBack }: PRDDetailProps) {
  const [prdData, setPrdData] = useState<any>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isOptimizing, setIsOptimizing] = useState(false)
  const [optimizationResult, setOptimizationResult] = useState<any>(null)
  const [copySuccess, setCopySuccess] = useState(false)
  const [showViewer, setShowViewer] = useState(false)

  useEffect(() => {
    loadPRD()
  }, [prdId])

  const loadPRD = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getPRD(prdId)
      setPrdData(data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load PRD details')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownloadMarkdown = () => {
    if (prdData) {
      downloadMarkdown(prdData)
    }
  }

  const handleCopyMarkdown = async () => {
    if (prdData) {
      const success = await copyMarkdownToClipboard(prdData)
      if (success) {
        setCopySuccess(true)
        setTimeout(() => setCopySuccess(false), 2000)
      }
    }
  }

  const handleOptimize = async () => {
    setIsOptimizing(true)
    setError(null)
    try {
      const result = await optimizePRD(prdId, 'AI Paired Programming')
      setOptimizationResult(result)

      // Reload PRD to show updated content
      await loadPRD()

      alert(`✓ PRD "${prdData.name}" optimized successfully!\n\n` +
        `Updated: ${result.statistics.facts_updated} facts\n` +
        `Created: ${result.statistics.facts_created} new facts\n` +
        `New relationships: ${result.statistics.relationships_created}\n\n` +
        `Assessment: ${result.analysis.overall_assessment}`)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to optimize PRD')
    } finally {
      setIsOptimizing(false)
    }
  }

  if (isLoading) {
    return (
      <div className="prd-detail">
        <button onClick={onBack} className="btn-secondary">← Back to List</button>
        <div className="loading">Loading PRD details...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="prd-detail">
        <button onClick={onBack} className="btn-secondary">← Back to List</button>
        <div className="error-message">{error}</div>
      </div>
    )
  }

  if (!prdData) {
    return (
      <div className="prd-detail">
        <button onClick={onBack} className="btn-secondary">← Back to List</button>
        <div className="error-message">PRD not found</div>
      </div>
    )
  }

  // Group chunks by section or type
  const groupedChunks = prdData.chunks?.reduce((acc: any, chunk: any) => {
    const section = chunk.section_title || chunk.type || 'General'
    if (!acc[section]) {
      acc[section] = []
    }
    acc[section].push(chunk)
    return acc
  }, {}) || {}

  return (
    <div className="prd-detail">
      <div className="prd-detail-header">
        <button onClick={onBack} className="btn-secondary">← Back to List</button>
        <div className="prd-detail-actions">
          <button
            onClick={() => setShowViewer(true)}
            className="btn-secondary"
            title="Preview as rendered Markdown"
          >
            📝 Preview
          </button>
          <button
            onClick={handleCopyMarkdown}
            className="btn-secondary"
            title="Copy as Markdown"
          >
            {copySuccess ? '✓ Copied!' : '📋 Copy MD'}
          </button>
          <button
            onClick={handleDownloadMarkdown}
            className="btn-secondary"
            title="Download as Markdown (opens in cv-md)"
          >
            📥 Export MD
          </button>
          <button
            onClick={handleOptimize}
            disabled={isOptimizing}
            className="btn-primary"
          >
            {isOptimizing ? 'Optimizing...' : '🤖 Optimize for AI'}
          </button>
        </div>
      </div>

      {showViewer && prdData && (
        <MarkdownViewer
          prd={prdData}
          onClose={() => setShowViewer(false)}
        />
      )}

      <div className="prd-document">
        <div className="prd-document-header">
          <h1>{prdData.name}</h1>
          {prdData.description && (
            <p className="prd-description">{prdData.description}</p>
          )}
          <div className="prd-meta">
            <span className="meta-item">
              <strong>Chunks:</strong> {prdData.chunks?.length || 0}
            </span>
            <span className="meta-item">
              <strong>PRD ID:</strong> <code>{prdData.id}</code>
            </span>
          </div>
        </div>

        {optimizationResult && (
          <div className="optimization-banner">
            <h3>🎉 Recently Optimized</h3>
            <p>{optimizationResult.analysis.overall_assessment}</p>
            <div className="optimization-stats">
              <span>✓ {optimizationResult.statistics.facts_updated} updated</span>
              <span>✓ {optimizationResult.statistics.facts_created} created</span>
              <span>✓ {optimizationResult.statistics.relationships_created} new relationships</span>
            </div>
          </div>
        )}

        <div className="prd-content">
          {Object.keys(groupedChunks).length === 0 ? (
            <p className="empty-state">No content available for this PRD.</p>
          ) : (
            Object.entries(groupedChunks).map(([section, chunks]: [string, any]) => (
              <div key={section} className="prd-section">
                <h2>{section}</h2>
                {chunks.map((chunk: any, idx: number) => (
                  <div key={chunk.id || idx} className="prd-chunk">
                    <div className="chunk-header">
                      <span className={`chunk-type chunk-type-${chunk.type.toLowerCase()}`}>
                        {chunk.type}
                      </span>
                      <span className={`chunk-priority chunk-priority-${chunk.priority.toLowerCase()}`}>
                        {chunk.priority}
                      </span>
                      {chunk.optimized && (
                        <span className="chunk-badge optimized">✓ Optimized</span>
                      )}
                    </div>
                    <div className="chunk-text">
                      {chunk.text}
                    </div>
                    {chunk.optimization_notes && (
                      <div className="chunk-notes">
                        <strong>Optimization notes:</strong> {chunk.optimization_notes}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import {
  generateUserManual,
  generateApiDocs,
  generateTechnicalSpec,
  getDocumentationCoverage,
  DocSection,
} from '../services/api'
import './DocsPanel.css'

interface DocsPanelProps {
  prdId: string
  prdName: string
}

type DocType = 'user_manual' | 'api_docs' | 'technical_spec'

const DOC_TYPE_LABELS: Record<DocType, { label: string; description: string }> = {
  user_manual: {
    label: 'User Manual',
    description: 'End-user documentation explaining how to use the product'
  },
  api_docs: {
    label: 'API Documentation',
    description: 'Technical documentation for developers integrating with APIs'
  },
  technical_spec: {
    label: 'Technical Specification',
    description: 'Detailed technical architecture and implementation specs'
  }
}

export function DocsPanel({ prdId, prdName }: DocsPanelProps) {
  const [docType, setDocType] = useState<DocType>('user_manual')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedDocs, setGeneratedDocs] = useState<DocSection[]>([])
  const [docCoverage, setDocCoverage] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [generatedType, setGeneratedType] = useState<DocType | null>(null)

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      let result
      switch (docType) {
        case 'user_manual':
          result = await generateUserManual(prdId)
          break
        case 'api_docs':
          result = await generateApiDocs(prdId)
          break
        case 'technical_spec':
          result = await generateTechnicalSpec(prdId)
          break
      }
      setGeneratedDocs(result?.sections || [])
      setGeneratedType(docType)

      // Also fetch coverage
      try {
        const coverage = await getDocumentationCoverage(prdId)
        setDocCoverage(coverage)
      } catch (e) {
        // Coverage fetch is optional
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message
      if (detail.includes('API key')) {
        setError('OpenRouter API key not configured. Go to Settings to add your API key.')
      } else {
        setError(detail || 'Failed to generate documentation')
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const downloadAsMarkdown = () => {
    const markdown = generatedDocs
      .map(d => `## ${d.title}\n\n${d.content}`)
      .join('\n\n---\n\n')

    const fullContent = `# ${prdName} - ${DOC_TYPE_LABELS[generatedType || docType].label}\n\n${markdown}`

    const blob = new Blob([fullContent], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prdName.toLowerCase().replace(/\s+/g, '_')}_${docType}.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyToClipboard = () => {
    const markdown = generatedDocs
      .map(d => `## ${d.title}\n\n${d.content}`)
      .join('\n\n---\n\n')
    navigator.clipboard.writeText(markdown)
  }

  return (
    <div className="docs-panel">
      <div className="panel-intro">
        <h2>Generate Documentation</h2>
        <p>
          AI will analyze your PRD requirements and generate professional documentation
          based on the type you select.
        </p>
      </div>

      <div className="doc-type-selector">
        {(Object.keys(DOC_TYPE_LABELS) as DocType[]).map((type) => (
          <button
            key={type}
            className={`doc-type-option ${docType === type ? 'active' : ''}`}
            onClick={() => setDocType(type)}
            disabled={isGenerating}
          >
            <span className="doc-type-label">{DOC_TYPE_LABELS[type].label}</span>
            <span className="doc-type-desc">{DOC_TYPE_LABELS[type].description}</span>
          </button>
        ))}
      </div>

      <div className="generation-actions">
        <button
          className="btn-primary generate-btn"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <span className="spinner"></span>
              Generating {DOC_TYPE_LABELS[docType].label}...
            </>
          ) : (
            `Generate ${DOC_TYPE_LABELS[docType].label}`
          )}
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {docCoverage && (
        <div className="coverage-summary">
          <h4>Documentation Coverage</h4>
          <div className="coverage-stats">
            <div className="stat">
              <span className="stat-value">{docCoverage.total_requirements || 0}</span>
              <span className="stat-label">Requirements</span>
            </div>
            <div className="stat">
              <span className="stat-value">{docCoverage.requirements_with_docs || 0}</span>
              <span className="stat-label">Documented</span>
            </div>
            <div className="stat highlight">
              <span className="stat-value">{docCoverage.coverage_percent || 0}%</span>
              <span className="stat-label">Coverage</span>
            </div>
          </div>
        </div>
      )}

      {generatedDocs.length > 0 && (
        <div className="generated-docs">
          <div className="docs-header">
            <h3>
              {DOC_TYPE_LABELS[generatedType || docType].label}
              <span className="section-count">({generatedDocs.length} sections)</span>
            </h3>
            <div className="docs-actions">
              <button className="btn-secondary btn-sm" onClick={copyToClipboard}>
                Copy
              </button>
              <button className="btn-secondary btn-sm" onClick={downloadAsMarkdown}>
                Download .md
              </button>
            </div>
          </div>

          <div className="doc-sections">
            {generatedDocs.map((doc) => (
              <div key={doc.id} className="doc-section">
                <h4 className="doc-title">{doc.title}</h4>
                <div className="doc-content">
                  {doc.content.split('\n').map((line, i) => (
                    <p key={i}>{line || '\u00A0'}</p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!isGenerating && generatedDocs.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">📖</div>
          <h3>No documentation generated yet</h3>
          <p>Select a documentation type and click the generate button to create professional docs from your PRD.</p>
        </div>
      )}
    </div>
  )
}

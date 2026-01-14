import { useState, useEffect } from 'react'
import {
  getDesignFrameworks,
  getDesignStyles,
  getDesignConcepts,
  generateDesignConcepts,
  refineDesignConcept,
  generateDesignCode,
  UIFramework,
  DesignStyle,
  DesignConcept,
  GeneratedCode,
} from '../services/api'
import './DesignPanel.css'

interface DesignPanelProps {
  prdId: string
  prdName: string
}

type DesignPhase = 'concepts' | 'framework' | 'code'

export function DesignPanel({ prdId, prdName }: DesignPanelProps) {
  // State
  const [phase, setPhase] = useState<DesignPhase>('concepts')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data
  const [frameworks, setFrameworks] = useState<UIFramework[]>([])
  const [styles, setStyles] = useState<DesignStyle[]>([])
  const [concepts, setConcepts] = useState<DesignConcept[]>([])
  const [generatedCode, setGeneratedCode] = useState<GeneratedCode | null>(null)

  // Selections
  const [selectedStyle, setSelectedStyle] = useState('modern')
  const [selectedConcept, setSelectedConcept] = useState<DesignConcept | null>(null)
  const [selectedFramework, setSelectedFramework] = useState<string | null>(null)

  // Refinement
  const [showRefine, setShowRefine] = useState(false)
  const [refineFeedback, setRefineFeedback] = useState('')
  const [isRefining, setIsRefining] = useState(false)

  // Code view
  const [expandedFile, setExpandedFile] = useState<string | null>(null)

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        const [frameworksResult, stylesResult, conceptsResult] = await Promise.all([
          getDesignFrameworks(),
          getDesignStyles(),
          getDesignConcepts(prdId).catch(() => ({ concepts: [] })),
        ])
        setFrameworks(frameworksResult.frameworks)
        setStyles(stylesResult.styles)
        setConcepts(conceptsResult.concepts)
      } catch (err) {
        console.error('Failed to load design data:', err)
      }
    }
    loadData()
  }, [prdId])

  const handleGenerateConcepts = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await generateDesignConcepts(prdId, selectedStyle, 3)
      setConcepts(result.concepts)
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message
      if (detail.includes('API key')) {
        setError('OpenRouter API key not configured. Go to Settings to add your API key.')
      } else {
        setError(detail || 'Failed to generate design concepts')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectConcept = (concept: DesignConcept) => {
    setSelectedConcept(concept)
    setPhase('framework')
  }

  const handleRefine = async () => {
    if (!selectedConcept || !refineFeedback.trim()) return
    setIsRefining(true)
    setError(null)
    try {
      const refined = await refineDesignConcept(prdId, selectedConcept.id, refineFeedback)
      // Add refined concept to list
      setConcepts(prev => [refined, ...prev])
      setSelectedConcept(refined)
      setShowRefine(false)
      setRefineFeedback('')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to refine concept')
    } finally {
      setIsRefining(false)
    }
  }

  const handleGenerateCode = async () => {
    if (!selectedConcept || !selectedFramework) return
    setIsLoading(true)
    setError(null)
    try {
      const code = await generateDesignCode(prdId, selectedConcept.id, selectedFramework)
      setGeneratedCode(code)
      setPhase('code')
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message
      if (detail.includes('API key')) {
        setError('OpenRouter API key not configured. Go to Settings to add your API key.')
      } else {
        setError(detail || 'Failed to generate code')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const downloadAsZip = async () => {
    if (!generatedCode) return

    // Create a simple download of all files as text (ZIP would require a library)
    const content = generatedCode.files
      .map(f => `// ${f.path}\n// ${f.description}\n\n${f.content}`)
      .join('\n\n' + '='.repeat(80) + '\n\n')

    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prdName.toLowerCase().replace(/\s+/g, '-')}-starter-code.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  // Render concepts phase
  const renderConceptsPhase = () => (
    <div className="design-phase concepts-phase">
      <div className="phase-header">
        <h3>Design Concepts</h3>
        <p>Generate design concepts based on your PRD requirements.</p>
      </div>

      <div className="generation-controls">
        <div className="control-group">
          <label>Design Style</label>
          <select
            value={selectedStyle}
            onChange={(e) => setSelectedStyle(e.target.value)}
            disabled={isLoading}
          >
            {styles.map((style) => (
              <option key={style.id} value={style.id}>
                {style.name}
              </option>
            ))}
          </select>
        </div>
        <button
          className="btn-primary generate-btn"
          onClick={handleGenerateConcepts}
          disabled={isLoading}
        >
          {isLoading ? (
            <>
              <span className="spinner"></span>
              Generating...
            </>
          ) : (
            'Generate Concepts'
          )}
        </button>
      </div>

      {concepts.length > 0 && (
        <div className="concepts-grid">
          {concepts.map((concept) => (
            <div
              key={concept.id}
              className={`concept-card ${selectedConcept?.id === concept.id ? 'selected' : ''}`}
              onClick={() => handleSelectConcept(concept)}
            >
              <div className="concept-header">
                <h4>{concept.name}</h4>
                {concept.refined_from && (
                  <span className="refined-badge">Refined</span>
                )}
              </div>

              <p className="concept-description">{concept.description}</p>

              <div className="color-scheme">
                <div
                  className="color-swatch"
                  style={{ background: concept.color_scheme.primary }}
                  title="Primary"
                />
                <div
                  className="color-swatch"
                  style={{ background: concept.color_scheme.secondary }}
                  title="Secondary"
                />
                <div
                  className="color-swatch"
                  style={{ background: concept.color_scheme.accent }}
                  title="Accent"
                />
                <div
                  className="color-swatch"
                  style={{ background: concept.color_scheme.background }}
                  title="Background"
                />
              </div>

              <div className="concept-meta">
                <div className="typography-info">
                  <strong>Typography:</strong>
                  <span>{concept.typography.headings} / {concept.typography.body}</span>
                </div>
              </div>

              <div className="key-screens">
                <strong>Key Screens:</strong>
                <ul>
                  {concept.key_screens.slice(0, 3).map((screen, idx) => (
                    <li key={idx}>{screen}</li>
                  ))}
                </ul>
              </div>

              <div className="concept-actions">
                <button
                  className="btn-secondary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedConcept(concept)
                    setShowRefine(true)
                  }}
                >
                  Refine
                </button>
                <button
                  className="btn-primary btn-sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelectConcept(concept)
                  }}
                >
                  Select
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {concepts.length === 0 && !isLoading && (
        <div className="empty-state">
          <div className="empty-icon">🎨</div>
          <h3>No design concepts yet</h3>
          <p>Select a design style and generate concepts based on your PRD requirements.</p>
        </div>
      )}
    </div>
  )

  // Render framework selection phase
  const renderFrameworkPhase = () => (
    <div className="design-phase framework-phase">
      <div className="phase-header">
        <button className="btn-back" onClick={() => setPhase('concepts')}>
          ← Back to Concepts
        </button>
        <h3>Select Framework</h3>
        <p>Choose a UI framework for your starter code.</p>
      </div>

      {selectedConcept && (
        <div className="selected-concept-summary">
          <h4>Selected: {selectedConcept.name}</h4>
          <p>{selectedConcept.description}</p>
        </div>
      )}

      <div className="frameworks-grid">
        {frameworks.map((framework) => (
          <div
            key={framework.id}
            className={`framework-card ${selectedFramework === framework.id ? 'selected' : ''}`}
            onClick={() => setSelectedFramework(framework.id)}
          >
            <div className="framework-header">
              <h4>{framework.name}</h4>
              <span className="category-badge">{framework.category}</span>
            </div>

            <p className="framework-description">{framework.description}</p>

            <div className="framework-features">
              {framework.features.slice(0, 3).map((feature, idx) => (
                <span key={idx} className="feature-tag">
                  {feature}
                </span>
              ))}
            </div>

            <div className="best-for">
              <strong>Best for:</strong>
              <span>{framework.best_for.join(', ')}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="phase-actions">
        <button
          className="btn-primary generate-btn"
          onClick={handleGenerateCode}
          disabled={!selectedFramework || isLoading}
        >
          {isLoading ? (
            <>
              <span className="spinner"></span>
              Generating Code...
            </>
          ) : (
            'Generate Starter Code'
          )}
        </button>
      </div>
    </div>
  )

  // Render code view phase
  const renderCodePhase = () => (
    <div className="design-phase code-phase">
      <div className="phase-header">
        <button className="btn-back" onClick={() => setPhase('framework')}>
          ← Back to Framework
        </button>
        <h3>Generated Code</h3>
        <div className="code-actions">
          <button className="btn-secondary" onClick={downloadAsZip}>
            Download All
          </button>
        </div>
      </div>

      {generatedCode && (
        <>
          <div className="code-overview">
            <div className="folder-structure">
              <h4>Folder Structure</h4>
              <pre>{generatedCode.folder_structure || 'No folder structure provided'}</pre>
            </div>

            <div className="setup-commands">
              <h4>Setup Commands</h4>
              <div className="commands-list">
                {generatedCode.setup_commands.map((cmd, idx) => (
                  <div key={idx} className="command-item">
                    <code>{cmd}</code>
                    <button
                      className="btn-copy"
                      onClick={() => copyToClipboard(cmd)}
                      title="Copy"
                    >
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="files-list">
            <h4>Generated Files ({generatedCode.files.length})</h4>
            {generatedCode.files.map((file) => (
              <div key={file.path} className="file-item">
                <div
                  className="file-header"
                  onClick={() =>
                    setExpandedFile(expandedFile === file.path ? null : file.path)
                  }
                >
                  <div className="file-info">
                    <span className="file-path">{file.path}</span>
                    <span className="file-description">{file.description}</span>
                  </div>
                  <span className="expand-icon">
                    {expandedFile === file.path ? '▼' : '▶'}
                  </span>
                </div>

                {expandedFile === file.path && (
                  <div className="file-content">
                    <div className="code-header">
                      <button
                        className="btn-copy"
                        onClick={() => copyToClipboard(file.content)}
                      >
                        Copy Code
                      </button>
                    </div>
                    <pre>
                      <code>{file.content}</code>
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>

          {generatedCode.readme && (
            <div className="readme-section">
              <h4>README</h4>
              <pre>{generatedCode.readme}</pre>
            </div>
          )}
        </>
      )}
    </div>
  )

  // Render refine modal
  const renderRefineModal = () => (
    <div className="modal-overlay" onClick={() => setShowRefine(false)}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Refine Concept</h3>
          <button className="modal-close" onClick={() => setShowRefine(false)}>
            X
          </button>
        </div>

        {selectedConcept && (
          <div className="refine-form">
            <p>
              <strong>Refining:</strong> {selectedConcept.name}
            </p>

            <div className="form-group">
              <label>What would you like to change?</label>
              <textarea
                value={refineFeedback}
                onChange={(e) => setRefineFeedback(e.target.value)}
                placeholder="e.g., 'Use a darker color scheme', 'Add a dashboard view', 'Make it more playful'"
                rows={4}
              />
            </div>

            <div className="modal-actions">
              <button
                className="btn-secondary"
                onClick={() => setShowRefine(false)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={handleRefine}
                disabled={isRefining || !refineFeedback.trim()}
              >
                {isRefining ? 'Refining...' : 'Refine Concept'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <div className="design-panel">
      <div className="panel-intro">
        <h2>Design Templates</h2>
        <p>
          Generate design concepts and starter code for your frontend.
        </p>

        <div className="phase-indicator">
          <div className={`phase-step ${phase === 'concepts' ? 'active' : concepts.length > 0 ? 'completed' : ''}`}>
            <span className="step-number">1</span>
            <span className="step-label">Concepts</span>
          </div>
          <div className="phase-connector" />
          <div className={`phase-step ${phase === 'framework' ? 'active' : selectedFramework ? 'completed' : ''}`}>
            <span className="step-number">2</span>
            <span className="step-label">Framework</span>
          </div>
          <div className="phase-connector" />
          <div className={`phase-step ${phase === 'code' ? 'active' : ''}`}>
            <span className="step-number">3</span>
            <span className="step-label">Code</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button className="dismiss-error" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {phase === 'concepts' && renderConceptsPhase()}
      {phase === 'framework' && renderFrameworkPhase()}
      {phase === 'code' && renderCodePhase()}

      {showRefine && renderRefineModal()}
    </div>
  )
}

import { useState } from 'react'
import type { PRDSection, PRDResponse } from '../types'
import { createPRD } from '../services/api'
import './PRDForm.css'

export function PRDForm() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sections, setSections] = useState<PRDSection[]>([
    { title: '', content: '', priority: 'medium', tags: [] },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<PRDResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  // AI Generation state
  const [aiPrompt, setAiPrompt] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const [aiError, setAiError] = useState<string | null>(null)

  // Figma integration state
  const [figmaUrl, setFigmaUrl] = useState('')
  const [isImportingFigma, setIsImportingFigma] = useState(false)
  const [figmaError, setFigmaError] = useState<string | null>(null)

  const addSection = () => {
    setSections([
      ...sections,
      { title: '', content: '', priority: 'medium', tags: [] },
    ])
  }

  const removeSection = (index: number) => {
    setSections(sections.filter((_, i) => i !== index))
  }

  const updateSection = (
    index: number,
    field: keyof PRDSection,
    value: any
  ) => {
    const newSections = [...sections]
    newSections[index] = { ...newSections[index], [field]: value }
    setSections(newSections)
  }

  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return

    setIsGenerating(true)
    setAiError(null)

    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/prds/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to generate PRD')
      }

      const data = await response.json()

      // Populate form with generated content
      setName(data.name || '')
      setDescription(data.description || '')
      if (data.sections && data.sections.length > 0) {
        const validPriorities = ['critical', 'high', 'medium', 'low']
        setSections(data.sections.map((s: any) => {
          // Normalize priority to lowercase and validate
          const priority = (s.priority || 'medium').toLowerCase()
          return {
            title: s.title || '',
            content: s.content || '',
            priority: validPriorities.includes(priority) ? priority : 'medium',
            tags: Array.isArray(s.tags) ? s.tags : []
          }
        }))
      }

      setAiPrompt('')
    } catch (err: any) {
      setAiError(err.message || 'Failed to generate PRD')
    } finally {
      setIsGenerating(false)
    }
  }

  const handleFigmaImport = async () => {
    if (!figmaUrl.trim()) return

    setIsImportingFigma(true)
    setFigmaError(null)

    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/integrations/figma/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: figmaUrl })
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.detail || 'Failed to import from Figma')
      }

      const data = await response.json()

      // Add Figma content as sections
      if (data.screens && data.screens.length > 0) {
        const figmaSections = data.screens.map((screen: any) => ({
          title: `UI: ${screen.name}`,
          content: screen.description || `Screen: ${screen.name}\nComponents: ${screen.components?.join(', ') || 'None identified'}`,
          priority: 'medium' as const,
          tags: ['ui', 'figma', ...(screen.tags || [])]
        }))
        setSections([...sections.filter(s => s.title || s.content), ...figmaSections])
      }

      // Add workflow if present
      if (data.workflow) {
        setSections(prev => [...prev, {
          title: 'User Workflow',
          content: data.workflow,
          priority: 'high' as const,
          tags: ['workflow', 'figma', 'user-journey']
        }])
      }

      setFigmaUrl('')
    } catch (err: any) {
      setFigmaError(err.message || 'Failed to import from Figma')
    } finally {
      setIsImportingFigma(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await createPRD({
        name,
        description: description || undefined,
        sections: sections.filter((s) => s.title && s.content),
      })
      setResult(response)
      // Reset form
      setName('')
      setDescription('')
      setSections([{ title: '', content: '', priority: 'medium', tags: [] }])
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to create PRD')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="prd-form">
      <h2>Create New PRD</h2>

      {/* AI Generation Panel */}
      <div className="ai-generation-panel">
        <div className="ai-header">
          <span className="ai-icon">🤖</span>
          <h3>AI PRD Generator</h3>
        </div>
        <p className="ai-description">
          Describe your product or feature and let AI generate a structured PRD for you.
        </p>

        {aiError && <div className="error-message">{aiError}</div>}

        <div className="ai-input-group">
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Example: Create a PRD for a mobile app that allows users to track their daily water intake, set reminders, and view weekly statistics. The app should integrate with Apple Health and Google Fit."
            rows={4}
            disabled={isGenerating}
          />
          <button
            type="button"
            onClick={handleAiGenerate}
            disabled={!aiPrompt.trim() || isGenerating}
            className="btn-primary ai-generate-btn"
          >
            {isGenerating ? (
              <>
                <span className="spinner"></span>
                Generating...
              </>
            ) : (
              <>Generate PRD</>
            )}
          </button>
        </div>
      </div>

      {/* Figma Integration Panel */}
      <div className="figma-integration-panel">
        <div className="figma-header">
          <span className="figma-icon">🎨</span>
          <h3>Import from Figma</h3>
        </div>
        <p className="figma-description">
          Import screens, components, and user flows from your Figma designs.
        </p>

        {figmaError && <div className="error-message">{figmaError}</div>}

        <div className="figma-input-group">
          <input
            type="text"
            value={figmaUrl}
            onChange={(e) => setFigmaUrl(e.target.value)}
            placeholder="Paste Figma file or frame URL..."
            disabled={isImportingFigma}
          />
          <button
            type="button"
            onClick={handleFigmaImport}
            disabled={!figmaUrl.trim() || isImportingFigma}
            className="btn-secondary figma-import-btn"
          >
            {isImportingFigma ? 'Importing...' : 'Import'}
          </button>
        </div>
        <span className="figma-hint">
          Requires Figma API token in Settings. Extracts screen names, components, and annotations.
        </span>
      </div>

      <div className="divider">
        <span>or fill in manually</span>
      </div>

      {error && <div className="error-message">{error}</div>}

      {result && (
        <div className="success-message">
          <h3>✓ PRD Created Successfully!</h3>
          <p>
            <strong>{result.prd_name}</strong>
          </p>
          <p>Created {result.chunks_created} chunks</p>
          <p>Found {result.relationships_created} relationships</p>
          <details>
            <summary>View Chunks ({result.chunks.length})</summary>
            <ul>
              {result.chunks.map((chunk) => (
                <li key={chunk.id}>
                  <strong>[{chunk.type}]</strong> {chunk.text.substring(0, 100)}
                  ...
                </li>
              ))}
            </ul>
          </details>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>
            PRD Name <span className="required">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder="e.g., User Authentication System"
          />
        </div>

        <div className="form-group">
          <label>Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief overview of the PRD"
            rows={3}
          />
        </div>

        <h3>Sections</h3>

        {sections.map((section, index) => (
          <div key={index} className="section-group">
            <div className="section-header">
              <h4>Section {index + 1}</h4>
              {sections.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSection(index)}
                  className="btn-remove"
                >
                  Remove
                </button>
              )}
            </div>

            <div className="form-group">
              <label>
                Section Title <span className="required">*</span>
              </label>
              <input
                type="text"
                value={section.title}
                onChange={(e) => updateSection(index, 'title', e.target.value)}
                required
                placeholder="e.g., User Authentication Requirement"
              />
            </div>

            <div className="form-group">
              <label>
                Content <span className="required">*</span>
              </label>
              <textarea
                value={section.content}
                onChange={(e) =>
                  updateSection(index, 'content', e.target.value)
                }
                required
                placeholder="The system shall authenticate users using..."
                rows={4}
              />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label>Priority</label>
                <select
                  value={section.priority}
                  onChange={(e) =>
                    updateSection(
                      index,
                      'priority',
                      e.target.value as any
                    )
                  }
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="form-group">
                <label>Tags (comma-separated)</label>
                <input
                  type="text"
                  value={section.tags.join(', ')}
                  onChange={(e) =>
                    updateSection(
                      index,
                      'tags',
                      e.target.value.split(',').map((t) => t.trim())
                    )
                  }
                  placeholder="auth, security, oauth2"
                />
              </div>
            </div>
          </div>
        ))}

        <button type="button" onClick={addSection} className="btn-secondary">
          + Add Section
        </button>

        <div className="form-actions">
          <button type="submit" disabled={isLoading} className="btn-primary">
            {isLoading ? 'Processing...' : 'Create PRD'}
          </button>
        </div>
      </form>
    </div>
  )
}

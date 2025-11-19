import { useState } from 'react'
import type { PRDSection, PRDResponse } from '../types'
import { createPRD } from '../services/api'

export function PRDForm() {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [sections, setSections] = useState<PRDSection[]>([
    { title: '', content: '', priority: 'medium', tags: [] },
  ])
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<PRDResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

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

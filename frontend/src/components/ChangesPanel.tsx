import { useState, useEffect } from 'react'
import {
  getVersionHistory,
  getVersion,
  compareVersions,
  revertToVersion,
  addSection,
  updateSection,
  deleteSection,
  updatePRDChunk,
  deletePRDChunk,
  PRDVersion,
  PRDVersionFull,
  VersionComparison,
  AddSectionRequest,
  UpdateSectionRequest,
  UpdateChunkRequest,
} from '../services/api'
import './ChangesPanel.css'

interface ChangesPanelProps {
  prdId: string
  prdName: string
  onPRDUpdated?: () => void
}

type ViewMode = 'history' | 'compare' | 'edit-section' | 'edit-chunk' | 'add-section'

export function ChangesPanel({ prdId, prdName, onPRDUpdated }: ChangesPanelProps) {
  // Reserved for future use
  void prdName
  const [versions, setVersions] = useState<PRDVersion[]>([])
  const [selectedVersion, setSelectedVersion] = useState<PRDVersionFull | null>(null)
  const [comparison, setComparison] = useState<VersionComparison | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('history')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedVersionId, setExpandedVersionId] = useState<string | null>(null)

  // Compare mode state
  const [compareV1, setCompareV1] = useState<number | null>(null)
  const [compareV2, setCompareV2] = useState<number | null>(null)

  // Edit mode state
  const [editingSection, setEditingSection] = useState<Record<string, any> | null>(null)
  const [editingChunk, setEditingChunk] = useState<Record<string, any> | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Add section state
  const [newSection, setNewSection] = useState<AddSectionRequest>({
    title: '',
    content: '',
    priority: 'medium',
    tags: [],
  })

  useEffect(() => {
    loadVersionHistory()
  }, [prdId])

  const loadVersionHistory = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const result = await getVersionHistory(prdId)
      setVersions(result.versions)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load version history')
    } finally {
      setIsLoading(false)
    }
  }

  const handleViewVersion = async (versionId: string) => {
    try {
      const version = await getVersion(prdId, versionId)
      setSelectedVersion(version)
      setExpandedVersionId(versionId)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load version details')
    }
  }

  const handleCompare = async () => {
    if (compareV1 === null || compareV2 === null) {
      setError('Please select two versions to compare')
      return
    }
    try {
      const result = await compareVersions(prdId, compareV1, compareV2)
      setComparison(result)
      setViewMode('compare')
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to compare versions')
    }
  }

  const handleRevert = async (versionNumber: number) => {
    if (!confirm(`Revert PRD to version ${versionNumber}? This will restore all sections and chunks to that version's state.`)) {
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      const result = await revertToVersion(prdId, versionNumber)
      alert(`Successfully reverted to version ${versionNumber}.\n\nRestored ${result.restored_sections} sections and ${result.restored_chunks} chunks.`)
      await loadVersionHistory()
      onPRDUpdated?.()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to revert')
    } finally {
      setIsSaving(false)
    }
  }

  // Section editing
  const handleEditSection = (section: Record<string, any>) => {
    setEditingSection({ ...section })
    setViewMode('edit-section')
  }

  const handleSaveSection = async () => {
    if (!editingSection) return
    setIsSaving(true)
    setError(null)
    try {
      const updates: UpdateSectionRequest = {
        title: editingSection.title,
        content: editingSection.content,
        priority: editingSection.priority,
        tags: editingSection.tags,
      }
      await updateSection(prdId, editingSection.id, updates)
      setViewMode('history')
      setEditingSection(null)
      await loadVersionHistory()
      onPRDUpdated?.()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save section')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteSection = async (sectionId: string) => {
    if (!confirm('Delete this section? This will also delete all associated chunks.')) {
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await deleteSection(prdId, sectionId)
      await loadVersionHistory()
      onPRDUpdated?.()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete section')
    } finally {
      setIsSaving(false)
    }
  }

  // Add section
  const handleAddSection = async () => {
    if (!newSection.title.trim() || !newSection.content.trim()) {
      setError('Title and content are required')
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await addSection(prdId, newSection)
      setViewMode('history')
      setNewSection({ title: '', content: '', priority: 'medium', tags: [] })
      await loadVersionHistory()
      onPRDUpdated?.()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to add section')
    } finally {
      setIsSaving(false)
    }
  }

  // Chunk editing
  const handleEditChunk = (chunk: Record<string, any>) => {
    setEditingChunk({ ...chunk })
    setViewMode('edit-chunk')
  }
  void handleEditChunk // Reserved for future use

  const handleSaveChunk = async () => {
    if (!editingChunk) return
    setIsSaving(true)
    setError(null)
    try {
      const updates: UpdateChunkRequest = {
        text: editingChunk.text,
        priority: editingChunk.priority,
        tags: editingChunk.tags,
      }
      await updatePRDChunk(prdId, editingChunk.id, updates)
      setViewMode('history')
      setEditingChunk(null)
      await loadVersionHistory()
      onPRDUpdated?.()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to save chunk')
    } finally {
      setIsSaving(false)
    }
  }

  const handleDeleteChunk = async (chunkId: string) => {
    if (!confirm('Delete this chunk?')) {
      return
    }
    setIsSaving(true)
    setError(null)
    try {
      await deletePRDChunk(prdId, chunkId)
      await loadVersionHistory()
      onPRDUpdated?.()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to delete chunk')
    } finally {
      setIsSaving(false)
    }
  }
  void handleDeleteChunk // Reserved for future use

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Unknown'
    return new Date(dateStr).toLocaleString()
  }

  const getChangeTypeLabel = (changeType: string) => {
    const labels: Record<string, string> = {
      add_section: 'Added Section',
      modify_section: 'Modified Section',
      delete_section: 'Deleted Section',
      add_chunk: 'Added Chunk',
      modify_chunk: 'Modified Chunk',
      delete_chunk: 'Deleted Chunk',
      revert: 'Reverted',
      rechunk_section: 'Re-chunked Section',
    }
    return labels[changeType] || changeType
  }

  const getChangeTypeClass = (changeType: string) => {
    if (changeType.includes('add')) return 'change-add'
    if (changeType.includes('delete')) return 'change-delete'
    if (changeType.includes('modify')) return 'change-modify'
    if (changeType === 'revert') return 'change-revert'
    return ''
  }

  // Render version history
  const renderHistory = () => (
    <div className="version-history">
      <div className="history-header">
        <h3>Version History</h3>
        <div className="history-actions">
          <button
            className="btn-secondary btn-sm"
            onClick={() => setViewMode('add-section')}
          >
            + Add Section
          </button>
        </div>
      </div>

      {/* Compare controls */}
      <div className="compare-controls">
        <span className="compare-label">Compare:</span>
        <select
          value={compareV1 ?? ''}
          onChange={(e) => setCompareV1(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select version</option>
          {versions.map((v) => (
            <option key={v.id} value={v.version_number}>
              v{v.version_number}
            </option>
          ))}
        </select>
        <span className="compare-vs">vs</span>
        <select
          value={compareV2 ?? ''}
          onChange={(e) => setCompareV2(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">Select version</option>
          {versions.map((v) => (
            <option key={v.id} value={v.version_number}>
              v{v.version_number}
            </option>
          ))}
        </select>
        <button
          className="btn-secondary btn-sm"
          onClick={handleCompare}
          disabled={compareV1 === null || compareV2 === null}
        >
          Compare
        </button>
      </div>

      {/* Version list */}
      <div className="version-list">
        {versions.length === 0 ? (
          <div className="empty-state">
            <p>No version history yet. Changes will be tracked automatically.</p>
          </div>
        ) : (
          versions.map((version) => (
            <div
              key={version.id}
              className={`version-item ${expandedVersionId === version.id ? 'expanded' : ''}`}
            >
              <div
                className="version-header"
                onClick={() => handleViewVersion(version.id)}
              >
                <div className="version-info">
                  <span className="version-number">v{version.version_number}</span>
                  <span className="version-date">{formatDate(version.created_at)}</span>
                  {version.comment && (
                    <span className="version-comment">{version.comment}</span>
                  )}
                </div>
                <div className="version-meta">
                  <span className="change-count">{version.change_count} change(s)</span>
                  <button
                    className="btn-sm btn-revert"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRevert(version.version_number)
                    }}
                    disabled={isSaving}
                    title="Revert to this version"
                  >
                    Revert
                  </button>
                </div>
              </div>

              {expandedVersionId === version.id && selectedVersion && (
                <div className="version-details">
                  {selectedVersion.changes.length === 0 ? (
                    <p className="no-changes">Initial version</p>
                  ) : (
                    <div className="changes-list">
                      {selectedVersion.changes.map((change) => (
                        <div
                          key={change.id}
                          className={`change-item ${getChangeTypeClass(change.change_type)}`}
                        >
                          <span className="change-type">
                            {getChangeTypeLabel(change.change_type)}
                          </span>
                          <span className="change-entity">
                            {change.entity_type}: {change.entity_id.slice(0, 8)}...
                          </span>
                          {change.diff_data && (
                            <div className="change-diff">
                              {change.diff_data.fields_changed?.map((field: string) => (
                                <span key={field} className="changed-field">
                                  {field}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Snapshot data - sections and chunks from this version */}
                  <div className="snapshot-preview">
                    <h4>Snapshot at v{selectedVersion.version_number}</h4>
                    <div className="snapshot-sections">
                      {selectedVersion.snapshot_data.sections.map((section) => (
                        <div key={section.id} className="snapshot-section">
                          <div className="snapshot-section-header">
                            <strong>{section.title}</strong>
                            <div className="snapshot-actions">
                              <button
                                className="btn-sm"
                                onClick={() => handleEditSection(section)}
                              >
                                Edit
                              </button>
                              <button
                                className="btn-sm btn-danger"
                                onClick={() => handleDeleteSection(section.id)}
                                disabled={isSaving}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          <p className="snapshot-content">{section.content.slice(0, 200)}...</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )

  // Render comparison view
  const renderComparison = () => (
    <div className="version-comparison">
      <div className="comparison-header">
        <button
          className="btn-secondary"
          onClick={() => {
            setViewMode('history')
            setComparison(null)
          }}
        >
          Back to History
        </button>
        <h3>
          Comparing v{comparison?.version1} to v{comparison?.version2}
        </h3>
      </div>

      <p className="comparison-summary">{comparison?.summary}</p>

      {comparison && (
        <>
          {comparison.section_changes.length > 0 && (
            <div className="diff-section">
              <h4>Section Changes</h4>
              {comparison.section_changes.map((change, idx) => (
                <div key={idx} className={`diff-item diff-${change.type}`}>
                  <span className="diff-type">{change.type}</span>
                  <span className="diff-id">{change.section_id.slice(0, 8)}...</span>
                  {change.section && (
                    <div className="diff-content">
                      <strong>{change.section.title}</strong>
                    </div>
                  )}
                  {change.diff && (
                    <div className="diff-fields">
                      Changed: {change.diff.fields_changed?.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {comparison.chunk_changes.length > 0 && (
            <div className="diff-section">
              <h4>Chunk Changes</h4>
              {comparison.chunk_changes.map((change, idx) => (
                <div key={idx} className={`diff-item diff-${change.type}`}>
                  <span className="diff-type">{change.type}</span>
                  <span className="diff-id">{change.chunk_id.slice(0, 8)}...</span>
                  {change.chunk && (
                    <div className="diff-content">
                      {change.chunk.text?.slice(0, 100)}...
                    </div>
                  )}
                  {change.diff && (
                    <div className="diff-fields">
                      Changed: {change.diff.fields_changed?.join(', ')}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {comparison.section_changes.length === 0 && comparison.chunk_changes.length === 0 && (
            <p className="no-changes">No differences between these versions</p>
          )}
        </>
      )}
    </div>
  )

  // Render section editor
  const renderSectionEditor = () => (
    <div className="editor-modal">
      <div className="editor-header">
        <h3>Edit Section</h3>
        <button
          className="btn-secondary"
          onClick={() => {
            setViewMode('history')
            setEditingSection(null)
          }}
        >
          Cancel
        </button>
      </div>

      {editingSection && (
        <div className="editor-form">
          <div className="form-group">
            <label>Title</label>
            <input
              type="text"
              value={editingSection.title}
              onChange={(e) =>
                setEditingSection({ ...editingSection, title: e.target.value })
              }
            />
          </div>

          <div className="form-group">
            <label>Content</label>
            <textarea
              rows={10}
              value={editingSection.content}
              onChange={(e) =>
                setEditingSection({ ...editingSection, content: e.target.value })
              }
            />
          </div>

          <div className="form-group">
            <label>Priority</label>
            <select
              value={editingSection.priority}
              onChange={(e) =>
                setEditingSection({ ...editingSection, priority: e.target.value })
              }
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="editor-actions">
            <button
              className="btn-primary"
              onClick={handleSaveSection}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // Render chunk editor
  const renderChunkEditor = () => (
    <div className="editor-modal">
      <div className="editor-header">
        <h3>Edit Chunk</h3>
        <button
          className="btn-secondary"
          onClick={() => {
            setViewMode('history')
            setEditingChunk(null)
          }}
        >
          Cancel
        </button>
      </div>

      {editingChunk && (
        <div className="editor-form">
          <div className="form-group">
            <label>Type: {editingChunk.chunk_type}</label>
          </div>

          <div className="form-group">
            <label>Text</label>
            <textarea
              rows={10}
              value={editingChunk.text}
              onChange={(e) =>
                setEditingChunk({ ...editingChunk, text: e.target.value })
              }
            />
          </div>

          <div className="form-group">
            <label>Priority</label>
            <select
              value={editingChunk.priority}
              onChange={(e) =>
                setEditingChunk({ ...editingChunk, priority: e.target.value })
              }
            >
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div className="editor-actions">
            <button
              className="btn-primary"
              onClick={handleSaveChunk}
              disabled={isSaving}
            >
              {isSaving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  )

  // Render add section form
  const renderAddSection = () => (
    <div className="editor-modal">
      <div className="editor-header">
        <h3>Add New Section</h3>
        <button
          className="btn-secondary"
          onClick={() => {
            setViewMode('history')
            setNewSection({ title: '', content: '', priority: 'medium', tags: [] })
          }}
        >
          Cancel
        </button>
      </div>

      <div className="editor-form">
        <div className="form-group">
          <label>Title *</label>
          <input
            type="text"
            value={newSection.title}
            onChange={(e) =>
              setNewSection({ ...newSection, title: e.target.value })
            }
            placeholder="Section title"
          />
        </div>

        <div className="form-group">
          <label>Content *</label>
          <textarea
            rows={10}
            value={newSection.content}
            onChange={(e) =>
              setNewSection({ ...newSection, content: e.target.value })
            }
            placeholder="Section content (Markdown supported)"
          />
        </div>

        <div className="form-group">
          <label>Priority</label>
          <select
            value={newSection.priority}
            onChange={(e) =>
              setNewSection({ ...newSection, priority: e.target.value })
            }
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        <div className="editor-actions">
          <button
            className="btn-primary"
            onClick={handleAddSection}
            disabled={isSaving || !newSection.title.trim() || !newSection.content.trim()}
          >
            {isSaving ? 'Adding...' : 'Add Section'}
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <div className="changes-panel">
      <div className="panel-intro">
        <h2>Change Management</h2>
        <p>
          Track changes, compare versions, edit sections and chunks, and revert to previous states.
        </p>
      </div>

      {error && (
        <div className="error-message">
          {error}
          <button className="dismiss-error" onClick={() => setError(null)}>
            Dismiss
          </button>
        </div>
      )}

      {isLoading && (
        <div className="loading-state">
          <span className="spinner"></span>
          <p>Loading version history...</p>
        </div>
      )}

      {!isLoading && (
        <>
          {viewMode === 'history' && renderHistory()}
          {viewMode === 'compare' && comparison && renderComparison()}
          {viewMode === 'edit-section' && renderSectionEditor()}
          {viewMode === 'edit-chunk' && renderChunkEditor()}
          {viewMode === 'add-section' && renderAddSection()}
        </>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { save } from '@tauri-apps/plugin-dialog'
import { getExportFormats, exportPRDsToPath, ExportFormat } from '../services/api'
import type { PRDSummary } from '../types'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
  prds: PRDSummary[]
}

export function ExportDialog({ isOpen, onClose, prds }: ExportDialogProps) {
  const [formats, setFormats] = useState<ExportFormat[]>([])
  const [selectedFormat, setSelectedFormat] = useState<string>('cv')
  const [selectedType, setSelectedType] = useState<string>('structure')
  const [selectedPRDs, setSelectedPRDs] = useState<string[]>([])
  const [selectAll, setSelectAll] = useState<boolean>(true)
  const [projectName, setProjectName] = useState<string>('')
  const [isLoading, setIsLoading] = useState<boolean>(false)
  const [isExporting, setIsExporting] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      loadFormats()
      // Default to all PRDs selected
      setSelectedPRDs(prds.map(p => p.id))
      setSelectAll(true)
      setSuccessMessage(null)
      // Set default project name from first PRD, sanitized for filesystem
      if (prds.length > 0 && !projectName) {
        const defaultName = prds[0].name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
        setProjectName(defaultName || 'cv-project')
      }
    }
  }, [isOpen, prds])

  const loadFormats = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const data = await getExportFormats()
      setFormats(data.formats)
    } catch (err: any) {
      setError('Failed to load export formats')
    } finally {
      setIsLoading(false)
    }
  }

  const handleSelectAll = () => {
    if (selectAll) {
      setSelectedPRDs([])
    } else {
      setSelectedPRDs(prds.map(p => p.id))
    }
    setSelectAll(!selectAll)
  }

  const handleTogglePRD = (prdId: string) => {
    if (selectedPRDs.includes(prdId)) {
      setSelectedPRDs(selectedPRDs.filter(id => id !== prdId))
      setSelectAll(false)
    } else {
      const newSelected = [...selectedPRDs, prdId]
      setSelectedPRDs(newSelected)
      if (newSelected.length === prds.length) {
        setSelectAll(true)
      }
    }
  }

  const handleExport = async () => {
    setIsExporting(true)
    setError(null)
    setSuccessMessage(null)

    try {
      // Determine filename based on format
      const extension = selectedFormat === 'cv' ? '.cv.zip' : `.${selectedFormat}`
      const filename = `${projectName}${extension}`

      // Show native save dialog to let user choose location
      const savePath = await save({
        defaultPath: filename,
        filters: selectedFormat === 'cv'
          ? [{ name: 'CV Export', extensions: ['zip'] }]
          : selectedFormat === 'md'
          ? [{ name: 'Markdown', extensions: ['md'] }]
          : [{ name: 'PDF', extensions: ['pdf'] }],
        title: 'Save Export As...',
      })

      if (!savePath) {
        // User cancelled
        setIsExporting(false)
        return
      }

      // Have backend save directly to chosen path
      const result = await exportPRDsToPath({
        format: selectedFormat,
        export_type: selectedType,
        prd_ids: selectAll ? undefined : selectedPRDs,
        project_name: projectName,
        save_path: savePath,
      })

      setSuccessMessage(`Saved to: ${result.path}`)

      // Close dialog after brief delay
      setTimeout(() => {
        onClose()
      }, 2000)
    } catch (err: any) {
      setError(err.response?.data?.detail || err.message || 'Export failed')
    } finally {
      setIsExporting(false)
    }
  }

  const currentFormat = formats.find(f => f.id === selectedFormat)
  const hasTypes = currentFormat?.types && currentFormat.types.length > 0

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content export-dialog" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export PRDs</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        {isLoading ? (
          <div className="loading">Loading export options...</div>
        ) : successMessage ? (
          <div className="success-message">{successMessage}</div>
        ) : error ? (
          <div className="error-message">{error}</div>
        ) : (
          <div className="modal-body">
            {/* Format Selection */}
            <div className="form-group">
              <label>Export Format</label>
              <div className="format-options">
                {formats.map(format => (
                  <label
                    key={format.id}
                    className={`format-option ${selectedFormat === format.id ? 'selected' : ''} ${format.disabled ? 'disabled' : ''}`}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={format.id}
                      checked={selectedFormat === format.id}
                      onChange={() => setSelectedFormat(format.id)}
                      disabled={format.disabled}
                    />
                    <div className="format-info">
                      <strong>{format.name}</strong>
                      <span>{format.description}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Export Type (for .cv format) */}
            {hasTypes && (
              <div className="form-group">
                <label>Content</label>
                <div className="type-options">
                  {currentFormat.types.map(type => (
                    <label
                      key={type.id}
                      className={`type-option ${selectedType === type.id ? 'selected' : ''}`}
                    >
                      <input
                        type="radio"
                        name="export_type"
                        value={type.id}
                        checked={selectedType === type.id}
                        onChange={() => setSelectedType(type.id)}
                      />
                      <div className="type-info">
                        <strong>{type.name}</strong>
                        <span>{type.description}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* Project Name */}
            <div className="form-group">
              <label htmlFor="projectName">Project Name</label>
              <input
                type="text"
                id="projectName"
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="my-project"
              />
              <span className="field-hint">
                This will be the folder name for cv-git import
              </span>
            </div>

            {/* PRD Selection */}
            <div className="form-group">
              <label>
                PRDs to Export
                <button
                  type="button"
                  className="btn-link"
                  onClick={handleSelectAll}
                >
                  {selectAll ? 'Deselect All' : 'Select All'}
                </button>
              </label>
              <div className="prd-selection">
                {prds.map(prd => (
                  <label key={prd.id} className="prd-checkbox">
                    <input
                      type="checkbox"
                      checked={selectedPRDs.includes(prd.id)}
                      onChange={() => handleTogglePRD(prd.id)}
                    />
                    <span>{prd.name}</span>
                    <span className="prd-chunks">{prd.chunk_count} chunks</span>
                  </label>
                ))}
              </div>
            </div>

            {/* cv-git usage hint */}
            {selectedFormat === 'cv' && (
              <div className="export-hint">
                <strong>cv-git Integration:</strong>
                <p>After downloading, create your project folder and import:</p>
                <code>mkdir ~/project/{projectName} && cd ~/project/{projectName}</code>
                <code>cv init -y && cv import ~/Downloads/{projectName}.cv.zip</code>
              </div>
            )}
          </div>
        )}

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary"
            onClick={handleExport}
            disabled={isExporting || selectedPRDs.length === 0}
          >
            {isExporting ? 'Exporting...' : `Export ${selectedPRDs.length} PRD${selectedPRDs.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useState, useRef, DragEvent } from 'react'
import type { PRDResponse } from '../types'
import { uploadDocument } from '../services/api'

export function DocumentUpload() {
  const [file, setFile] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [result, setResult] = useState<PRDResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const allowedExtensions = ['.docx', '.md', '.markdown']
  const allowedTypes = [
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/markdown',
    'text/plain', // Some systems use text/plain for .md files
  ]

  const validateFile = (file: File): boolean => {
    const fileExt = '.' + file.name.split('.').pop()?.toLowerCase()

    if (!allowedExtensions.includes(fileExt)) {
      setError(
        `Invalid file type. Please upload a Word (.docx) or Markdown (.md) file.`
      )
      return false
    }

    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('File size must be less than 10MB')
      return false
    }

    return true
  }

  const handleFileSelect = (selectedFile: File) => {
    setError(null)
    setResult(null)

    if (validateFile(selectedFile)) {
      setFile(selectedFile)
      // Auto-populate name from filename if not set
      if (!name) {
        const nameWithoutExt = selectedFile.name
          .replace(/\.(docx|md|markdown)$/i, '')
        setName(nameWithoutExt)
      }
    }
  }

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (files && files[0]) {
      handleFileSelect(files[0])
    }
  }

  const handleDragEnter = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const files = e.dataTransfer.files
    if (files && files[0]) {
      handleFileSelect(files[0])
    }
  }

  const handleBrowseClick = () => {
    fileInputRef.current?.click()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!file) {
      setError('Please select a file to upload')
      return
    }

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const response = await uploadDocument(file, name || undefined, description || undefined)
      setResult(response)
      // Reset form
      setFile(null)
      setName('')
      setDescription('')
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload document')
    } finally {
      setIsLoading(false)
    }
  }

  const handleRemoveFile = () => {
    setFile(null)
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  return (
    <div className="document-upload">
      <h2>Upload PRD Document</h2>
      <p className="upload-description">
        Upload an existing PRD in Word (.docx) or Markdown (.md) format
      </p>

      {error && <div className="error-message">{error}</div>}

      {result && (
        <div className="success-message">
          <h3>✓ Document Uploaded Successfully!</h3>
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
        {/* Drag and Drop Zone */}
        <div
          className={`drop-zone ${isDragging ? 'dragging' : ''} ${
            file ? 'has-file' : ''
          }`}
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {!file ? (
            <>
              <div className="drop-zone-icon">📄</div>
              <p className="drop-zone-text">
                Drag and drop your PRD file here
              </p>
              <p className="drop-zone-or">or</p>
              <button
                type="button"
                className="browse-button"
                onClick={handleBrowseClick}
              >
                Browse Files
              </button>
              <p className="drop-zone-hint">
                Supports: .docx, .md, .markdown (max 10MB)
              </p>
            </>
          ) : (
            <div className="file-preview">
              <div className="file-icon">
                {file.name.endsWith('.docx') ? '📘' : '📝'}
              </div>
              <div className="file-info">
                <p className="file-name">{file.name}</p>
                <p className="file-size">
                  {(file.size / 1024).toFixed(2)} KB
                </p>
              </div>
              <button
                type="button"
                className="remove-file-button"
                onClick={handleRemoveFile}
              >
                ✕
              </button>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx,.md,.markdown"
            onChange={handleFileInputChange}
            style={{ display: 'none' }}
          />
        </div>

        {/* Optional Fields */}
        <div className="form-group">
          <label>PRD Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Leave blank to use filename"
          />
          <small className="field-hint">
            Defaults to the document filename if not specified
          </small>
        </div>

        <div className="form-group">
          <label>Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description of this PRD"
            rows={3}
          />
          <small className="field-hint">
            Defaults to an excerpt from the document if not specified
          </small>
        </div>

        <button
          type="submit"
          className="submit-button"
          disabled={isLoading || !file}
        >
          {isLoading ? 'Processing...' : 'Upload & Process Document'}
        </button>
      </form>
    </div>
  )
}

/**
 * Markdown Viewer component - integrates cv-md viewer functionality
 * Renders PRD content as formatted markdown with syntax highlighting
 */
import { useMemo } from 'react'
import { marked } from 'marked'
import { prdToMarkdown } from '../utils/markdown-export'
import type { PRDData } from '../utils/markdown-export'
import './MarkdownViewer.css'

// Configure marked options (same as cv-md)
marked.use({
  breaks: true,
  gfm: true
})

interface MarkdownViewerProps {
  prd: PRDData
  onClose: () => void
}

export function MarkdownViewer({ prd, onClose }: MarkdownViewerProps) {
  // Convert PRD to markdown, then to HTML
  const htmlContent = useMemo(() => {
    const markdown = prdToMarkdown(prd)
    return marked(markdown)
  }, [prd])

  const handleCopy = async () => {
    const markdown = prdToMarkdown(prd)
    await navigator.clipboard.writeText(markdown)
    alert('Markdown copied to clipboard!')
  }

  const handleDownload = () => {
    const markdown = prdToMarkdown(prd)
    const blob = new Blob([markdown], { type: 'text/markdown;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prd.name.replace(/[^a-zA-Z0-9]/g, '_')}.md`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  return (
    <div className="markdown-viewer-overlay">
      <div className="markdown-viewer">
        <div className="markdown-viewer-header">
          <div className="markdown-viewer-title">
            <span className="markdown-icon">📝</span>
            <span>{prd.name}</span>
          </div>
          <div className="markdown-viewer-actions">
            <button onClick={handleCopy} className="btn-viewer" title="Copy as Markdown">
              📋 Copy
            </button>
            <button onClick={handleDownload} className="btn-viewer" title="Download .md file">
              📥 Download
            </button>
            <button onClick={onClose} className="btn-viewer-close" title="Close viewer">
              ✕
            </button>
          </div>
        </div>
        <div
          className="markdown-content"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </div>
    </div>
  )
}

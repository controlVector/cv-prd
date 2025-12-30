import React, { useState } from 'react'
import { submitCustomerComplaint } from '../utils/errorReporter'

interface BugReportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function BugReportDialog({ isOpen, onClose }: BugReportDialogProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [steps, setSteps] = useState('')
  const [expected, setExpected] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const success = await submitCustomerComplaint({
      title,
      description,
      steps_to_reproduce: steps || undefined,
      expected_behavior: expected || undefined,
    })

    setIsSubmitting(false)
    if (success) {
      setSubmitted(true)
      setTimeout(() => {
        handleClose()
      }, 2000)
    } else {
      setError('Failed to submit bug report. Please try again.')
    }
  }

  const handleClose = () => {
    setSubmitted(false)
    setTitle('')
    setDescription('')
    setSteps('')
    setExpected('')
    setError(null)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h2 style={styles.title}>Report a Bug</h2>
          <button style={styles.closeButton} onClick={handleClose}>
            &times;
          </button>
        </div>

        {submitted ? (
          <div style={styles.successMessage}>
            Thank you! Your bug report has been submitted.
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={styles.form}>
            {error && <div style={styles.errorMessage}>{error}</div>}

            <div style={styles.formGroup}>
              <label htmlFor="bug-title" style={styles.label}>
                Title *
              </label>
              <input
                id="bug-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief description of the issue"
                required
                minLength={5}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="bug-description" style={styles.label}>
                Description *
              </label>
              <textarea
                id="bug-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What happened? What did you expect to happen?"
                required
                minLength={20}
                rows={4}
                style={styles.textarea}
              />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="bug-steps" style={styles.label}>
                Steps to Reproduce
              </label>
              <textarea
                id="bug-steps"
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                placeholder="1. Go to...&#10;2. Click on...&#10;3. See error"
                rows={3}
                style={styles.textarea}
              />
            </div>

            <div style={styles.formGroup}>
              <label htmlFor="bug-expected" style={styles.label}>
                Expected Behavior
              </label>
              <textarea
                id="bug-expected"
                value={expected}
                onChange={(e) => setExpected(e.target.value)}
                placeholder="What should have happened instead?"
                rows={2}
                style={styles.textarea}
              />
            </div>

            <div style={styles.actions}>
              <button
                type="button"
                style={styles.cancelButton}
                onClick={handleClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                style={styles.submitButton}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Submitting...' : 'Submit Report'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    width: '100%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    borderBottom: '1px solid #eee',
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#666',
    padding: '0',
    lineHeight: 1,
  },
  form: {
    padding: '20px',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontWeight: 500,
    fontSize: '14px',
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    boxSizing: 'border-box' as const,
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    resize: 'vertical' as const,
    fontFamily: 'inherit',
    boxSizing: 'border-box' as const,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '12px',
    marginTop: '20px',
  },
  cancelButton: {
    padding: '10px 20px',
    fontSize: '14px',
    border: '1px solid #ddd',
    borderRadius: '4px',
    backgroundColor: 'white',
    cursor: 'pointer',
  },
  submitButton: {
    padding: '10px 20px',
    fontSize: '14px',
    border: 'none',
    borderRadius: '4px',
    backgroundColor: '#007bff',
    color: 'white',
    cursor: 'pointer',
  },
  successMessage: {
    padding: '40px 20px',
    textAlign: 'center' as const,
    color: '#28a745',
    fontSize: '16px',
  },
  errorMessage: {
    padding: '12px',
    marginBottom: '16px',
    backgroundColor: '#fff3f3',
    border: '1px solid #ffcdd2',
    borderRadius: '4px',
    color: '#c62828',
    fontSize: '14px',
  },
}

export default BugReportDialog

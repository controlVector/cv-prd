import { useState, useEffect } from 'react'
import './ApiKeyWarning.css'

interface ApiKeyWarningProps {
  onOpenSettings: () => void
}

export function ApiKeyWarning({ onOpenSettings }: ApiKeyWarningProps) {
  const [visible, setVisible] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    checkApiKey()
  }, [])

  const checkApiKey = async () => {
    // Check if user has dismissed this warning
    const dismissed = localStorage.getItem('api_key_warning_dismissed')
    if (dismissed) {
      setChecking(false)
      return
    }

    // Check localStorage first
    const localKey = localStorage.getItem('openrouter_api_key')
    if (localKey) {
      setChecking(false)
      return
    }

    // Check backend health endpoint first - this is the authoritative source
    // for whether the API key is configured (via env var or saved credentials)
    try {
      const healthResponse = await fetch('http://127.0.0.1:8000/api/v1/health')
      if (healthResponse.ok) {
        const health = await healthResponse.json()
        if (health.openrouter_configured) {
          setChecking(false)
          return
        }
      }
    } catch {
      // Backend not available - will show warning
    }

    // Also check credentials endpoint as fallback
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/credentials/raw')
      if (response.ok) {
        const creds = await response.json()
        if (creds.openrouter_key) {
          setChecking(false)
          return
        }
      }
    } catch {
      // Credentials endpoint not available
    }

    // No API key found - show warning
    setVisible(true)
    setChecking(false)
  }

  const handleDismiss = () => {
    setVisible(false)
    localStorage.setItem('api_key_warning_dismissed', 'true')
  }

  const handleOpenSettings = () => {
    setVisible(false)
    onOpenSettings()
  }

  if (checking || !visible) return null

  return (
    <div className="api-key-warning">
      <div className="api-key-warning-content">
        <span className="api-key-warning-icon">⚠️</span>
        <div className="api-key-warning-text">
          <strong>OpenRouter API key not configured.</strong>
          {' '}AI features (optimization, test generation, docs) are disabled.
          {' '}Get a free key at{' '}
          <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">
            openrouter.ai
          </a>
        </div>
        <div className="api-key-warning-actions">
          <button className="btn-warning-settings" onClick={handleOpenSettings}>
            Go to Settings
          </button>
          <button className="btn-warning-dismiss" onClick={handleDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  )
}

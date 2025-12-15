import { useState, useEffect } from 'react'
import './Settings.css'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
}

type SettingsTab = 'credentials' | 'account'

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('credentials')

  // Credentials state
  const [apiKey, setApiKey] = useState('')
  const [figmaToken, setFigmaToken] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null)

  // Auth state
  const [isLoggedIn, setIsLoggedIn] = useState(false)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [authError, setAuthError] = useState('')
  const [currentUser, setCurrentUser] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen) {
      // Load credentials from shared store
      loadSharedCredentials()
      // Check if user is logged in
      checkAuth()
    }
  }, [isOpen])

  const loadSharedCredentials = async () => {
    try {
      // First try to load raw credentials from backend (populates env vars)
      const response = await fetch('http://127.0.0.1:8000/api/v1/credentials/raw')
      if (response.ok) {
        const creds = await response.json()
        if (creds.openrouter_key) setApiKey(creds.openrouter_key)
        if (creds.figma_token) setFigmaToken(creds.figma_token)
        if (creds.anthropic_key) setAnthropicKey(creds.anthropic_key)
        if (creds.github_token) setGithubToken(creds.github_token)
      }
    } catch {
      // Fall back to localStorage
      const savedKey = localStorage.getItem('openrouter_api_key')
      if (savedKey) setApiKey(savedKey)
      const savedFigma = localStorage.getItem('figma_api_token')
      if (savedFigma) setFigmaToken(savedFigma)
    }
  }

  const checkAuth = async () => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      try {
        const response = await fetch('http://127.0.0.1:8000/api/v1/auth/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        })
        const data = await response.json()
        if (data.authenticated) {
          setIsLoggedIn(true)
          setCurrentUser(data.username)
        }
      } catch {
        // Token invalid, clear it
        localStorage.removeItem('auth_token')
      }
    }
  }

  const handleSave = async () => {
    // Save to shared ControlVector credentials
    try {
      await fetch('http://127.0.0.1:8000/api/v1/credentials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openrouter_key: apiKey || null,
          anthropic_key: anthropicKey || null,
          figma_token: figmaToken || null,
          github_token: githubToken || null
        })
      })
    } catch {
      // Fall back to localStorage only
      localStorage.setItem('openrouter_api_key', apiKey)
      localStorage.setItem('figma_api_token', figmaToken)

      // Still try to set on backend env
      fetch('http://127.0.0.1:8000/api/v1/settings/openrouter-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey })
      }).catch(() => {})
    }

    onClose()
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/settings/test-openrouter-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey })
      })

      const data = await response.json()
      setTestResult(data.status === 'success' ? 'success' : 'error')
    } catch {
      setTestResult('error')
    }

    setTesting(false)
  }

  const handleLogin = async () => {
    setAuthError('')
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })

      if (!response.ok) {
        const data = await response.json()
        setAuthError(data.detail || 'Login failed')
        return
      }

      const data = await response.json()
      localStorage.setItem('auth_token', data.token)
      setIsLoggedIn(true)
      setCurrentUser(data.username)
      setPassword('')
    } catch (e) {
      setAuthError('Connection error')
    }
  }

  const handleRegister = async () => {
    setAuthError('')
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, email: email || null })
      })

      if (!response.ok) {
        const data = await response.json()
        setAuthError(data.detail || 'Registration failed')
        return
      }

      const data = await response.json()
      localStorage.setItem('auth_token', data.token)
      setIsLoggedIn(true)
      setCurrentUser(data.username)
      setPassword('')
    } catch (e) {
      setAuthError('Connection error')
    }
  }

  const handleLogout = async () => {
    const token = localStorage.getItem('auth_token')
    if (token) {
      await fetch('http://127.0.0.1:8000/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token })
      }).catch(() => {})
    }
    localStorage.removeItem('auth_token')
    setIsLoggedIn(false)
    setCurrentUser(null)
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Settings</h2>
          <button className="modal-close" onClick={onClose}>&times;</button>
        </div>

        <div className="settings-tabs">
          <button
            className={activeTab === 'credentials' ? 'active' : ''}
            onClick={() => setActiveTab('credentials')}
          >
            API Keys
          </button>
          <button
            className={activeTab === 'account' ? 'active' : ''}
            onClick={() => setActiveTab('account')}
          >
            Account
          </button>
        </div>

        <div className="modal-body">
          {activeTab === 'credentials' && (
            <>
              <div className="settings-section">
                <h3>OpenRouter API</h3>
                <p className="settings-description">
                  Used for embeddings and AI generation.
                  Get your key at <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">openrouter.ai/keys</a>
                </p>

                <div className="form-group">
                  <label htmlFor="api-key">API Key</label>
                  <div className="api-key-input-group">
                    <input
                      id="api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                    />
                    <button
                      className="btn-secondary"
                      onClick={handleTest}
                      disabled={!apiKey || testing}
                    >
                      {testing ? 'Testing...' : 'Test'}
                    </button>
                  </div>

                  {testResult === 'success' && (
                    <span className="test-result success">✓ API key is valid</span>
                  )}
                  {testResult === 'error' && (
                    <span className="test-result error">✗ Invalid API key</span>
                  )}
                </div>
              </div>

              <div className="settings-section">
                <h3>Anthropic API</h3>
                <p className="settings-description">
                  Used for Claude AI models (optional if using OpenRouter).
                  Get your key at <a href="https://console.anthropic.com/keys" target="_blank" rel="noopener noreferrer">console.anthropic.com</a>
                </p>
                <div className="form-group">
                  <label htmlFor="anthropic-key">API Key</label>
                  <input
                    id="anthropic-key"
                    type="password"
                    value={anthropicKey}
                    onChange={(e) => setAnthropicKey(e.target.value)}
                    placeholder="sk-ant-..."
                  />
                </div>
              </div>

              <div className="settings-section">
                <h3>Figma Integration</h3>
                <p className="settings-description">
                  Import designs directly into PRDs.
                  Get your token at <a href="https://www.figma.com/developers/api#access-tokens" target="_blank" rel="noopener noreferrer">Figma Developer Settings</a>
                </p>
                <div className="form-group">
                  <label htmlFor="figma-token">Figma Token</label>
                  <input
                    id="figma-token"
                    type="password"
                    value={figmaToken}
                    onChange={(e) => setFigmaToken(e.target.value)}
                    placeholder="figd_..."
                  />
                </div>
              </div>

              <div className="settings-section">
                <h3>GitHub</h3>
                <p className="settings-description">
                  Used for cv-git integration.
                  Get your token at <a href="https://github.com/settings/tokens" target="_blank" rel="noopener noreferrer">GitHub Settings</a>
                </p>
                <div className="form-group">
                  <label htmlFor="github-token">Personal Access Token</label>
                  <input
                    id="github-token"
                    type="password"
                    value={githubToken}
                    onChange={(e) => setGithubToken(e.target.value)}
                    placeholder="ghp_..."
                  />
                </div>
              </div>

              <div className="settings-info">
                <p>
                  Credentials are saved to <code>~/.controlvector/credentials.json</code> and shared with cv-git.
                </p>
              </div>
            </>
          )}

          {activeTab === 'account' && (
            <>
              {isLoggedIn ? (
                <div className="settings-section">
                  <h3>Logged In</h3>
                  <p className="settings-description">
                    You are logged in as <strong>{currentUser}</strong>
                  </p>
                  <button className="btn-secondary" onClick={handleLogout}>
                    Log Out
                  </button>
                </div>
              ) : (
                <div className="settings-section">
                  <div className="auth-toggle">
                    <button
                      className={authMode === 'login' ? 'active' : ''}
                      onClick={() => { setAuthMode('login'); setAuthError('') }}
                    >
                      Login
                    </button>
                    <button
                      className={authMode === 'register' ? 'active' : ''}
                      onClick={() => { setAuthMode('register'); setAuthError('') }}
                    >
                      Register
                    </button>
                  </div>

                  {authError && (
                    <div className="auth-error">{authError}</div>
                  )}

                  <div className="form-group">
                    <label htmlFor="username">Username</label>
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter username"
                    />
                  </div>

                  {authMode === 'register' && (
                    <div className="form-group">
                      <label htmlFor="email">Email (optional)</label>
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="your@email.com"
                      />
                    </div>
                  )}

                  <div className="form-group">
                    <label htmlFor="password">Password</label>
                    <input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter password"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          authMode === 'login' ? handleLogin() : handleRegister()
                        }
                      }}
                    />
                  </div>

                  <button
                    className="btn-primary"
                    onClick={authMode === 'login' ? handleLogin : handleRegister}
                    disabled={!username || !password}
                  >
                    {authMode === 'login' ? 'Log In' : 'Create Account'}
                  </button>
                </div>
              )}

              <div className="settings-section">
                <h3>About</h3>
                <p className="settings-description">
                  cvPRD v0.1.0 - AI-Powered Product Requirements Documentation
                </p>
                <p className="settings-description">
                  Part of the ControlVector suite of AI-native development tools.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          {activeTab === 'credentials' && (
            <button className="btn-primary" onClick={handleSave}>Save</button>
          )}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import './Settings.css'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
}

interface AIModel {
  id: string
  name: string
  provider: string
  tier: string
  pricing: {
    input_per_1m: number
    output_per_1m: number
  }
}

interface UsageSummary {
  period_days: number
  total_requests: number
  total_tokens: number
  total_cost_usd: number
  by_model: Record<string, { requests: number; tokens: number; cost_usd: number }>
  by_endpoint: Record<string, { requests: number; tokens: number; cost_usd: number }>
}

type SettingsTab = 'credentials' | 'ai' | 'usage' | 'account'

export function Settings({ isOpen, onClose }: SettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('credentials')

  // Credentials state
  const [apiKey, setApiKey] = useState('')
  const [figmaToken, setFigmaToken] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')
  const [githubToken, setGithubToken] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<'success' | 'error' | 'connection_error' | null>(null)
  const [testErrorMessage, setTestErrorMessage] = useState<string>('')

  // AI Settings state
  const [models, setModels] = useState<AIModel[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(4000)
  const [testFramework, setTestFramework] = useState('pytest')
  const [aiSettingsLoading, setAiSettingsLoading] = useState(false)
  const [aiSettingsSaved, setAiSettingsSaved] = useState(false)

  // Usage state
  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null)
  const [usageLoading, setUsageLoading] = useState(false)
  const [usageDays, setUsageDays] = useState(30)

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
      loadSharedCredentials()
      checkAuth()
      loadAISettings()
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && activeTab === 'usage') {
      loadUsageSummary()
    }
  }, [isOpen, activeTab, usageDays])

  const loadSharedCredentials = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/credentials/raw')
      if (response.ok) {
        const creds = await response.json()
        if (creds.openrouter_key) setApiKey(creds.openrouter_key)
        if (creds.figma_token) setFigmaToken(creds.figma_token)
        if (creds.anthropic_key) setAnthropicKey(creds.anthropic_key)
        if (creds.github_token) setGithubToken(creds.github_token)
      }
    } catch {
      const savedKey = localStorage.getItem('openrouter_api_key')
      if (savedKey) setApiKey(savedKey)
      const savedFigma = localStorage.getItem('figma_api_token')
      if (savedFigma) setFigmaToken(savedFigma)
    }
  }

  const loadAISettings = async () => {
    try {
      // Load available models
      const modelsResponse = await fetch('http://127.0.0.1:8000/api/v1/ai/models')
      if (modelsResponse.ok) {
        const data = await modelsResponse.json()
        setModels(data.models)
        setSelectedModel(data.current_model)
      }

      // Load current settings
      const settingsResponse = await fetch('http://127.0.0.1:8000/api/v1/ai/settings')
      if (settingsResponse.ok) {
        const settings = await settingsResponse.json()
        setSelectedModel(settings.model)
        setTemperature(settings.temperature)
        setMaxTokens(settings.max_tokens)
        setTestFramework(settings.default_test_framework)
      }
    } catch (e) {
      console.error('Failed to load AI settings:', e)
    }
  }

  const loadUsageSummary = async () => {
    setUsageLoading(true)
    try {
      const response = await fetch(`http://127.0.0.1:8000/api/v1/usage/summary?days=${usageDays}`)
      if (response.ok) {
        const data = await response.json()
        setUsageSummary(data)
      }
    } catch (e) {
      console.error('Failed to load usage summary:', e)
    }
    setUsageLoading(false)
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
        localStorage.removeItem('auth_token')
      }
    }
  }

  const handleSave = async () => {
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
      localStorage.setItem('openrouter_api_key', apiKey)
      localStorage.setItem('figma_api_token', figmaToken)
      fetch('http://127.0.0.1:8000/api/v1/settings/openrouter-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey })
      }).catch(() => {})
    }
    onClose()
  }

  const handleSaveAISettings = async () => {
    setAiSettingsLoading(true)
    setAiSettingsSaved(false)
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          temperature: temperature,
          max_tokens: maxTokens,
          default_test_framework: testFramework
        })
      })
      if (response.ok) {
        setAiSettingsSaved(true)
        setTimeout(() => setAiSettingsSaved(false), 3000)
      }
    } catch (e) {
      console.error('Failed to save AI settings:', e)
    }
    setAiSettingsLoading(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)
    setTestErrorMessage('')
    try {
      const response = await fetch('http://127.0.0.1:8000/api/v1/settings/test-openrouter-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey })
      })
      const data = await response.json()
      if (data.status === 'success') {
        setTestResult('success')
      } else {
        setTestResult('error')
        setTestErrorMessage(data.message || 'Invalid API key')
      }
    } catch (e) {
      // Connection error - backend not running or unreachable
      setTestResult('connection_error')
      setTestErrorMessage('Cannot connect to backend server. Please ensure the application started correctly.')
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

  const formatCost = (cost: number) => {
    return cost < 0.01 ? `$${cost.toFixed(4)}` : `$${cost.toFixed(2)}`
  }

  const getModelPrice = (modelId: string) => {
    const model = models.find(m => m.id === modelId)
    if (model) {
      return `$${model.pricing.input_per_1m}/${model.pricing.output_per_1m} per 1M tokens`
    }
    return ''
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
            className={activeTab === 'ai' ? 'active' : ''}
            onClick={() => setActiveTab('ai')}
          >
            AI Settings
          </button>
          <button
            className={activeTab === 'usage' ? 'active' : ''}
            onClick={() => setActiveTab('usage')}
          >
            Usage
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
                    <span className="test-result success">API key is valid</span>
                  )}
                  {testResult === 'error' && (
                    <span className="test-result error">{testErrorMessage || 'Invalid API key'}</span>
                  )}
                  {testResult === 'connection_error' && (
                    <span className="test-result error">{testErrorMessage}</span>
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

          {activeTab === 'ai' && (
            <>
              <div className="settings-section">
                <h3>AI Model</h3>
                <p className="settings-description">
                  Select the AI model to use for test generation, documentation, and other AI features.
                </p>

                <div className="form-group">
                  <label htmlFor="model-select">Model</label>
                  <select
                    id="model-select"
                    value={selectedModel}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="model-select"
                  >
                    {models.map(model => (
                      <option key={model.id} value={model.id}>
                        {model.name} ({model.provider}) - {model.tier}
                      </option>
                    ))}
                  </select>
                  {selectedModel && (
                    <span className="model-price">{getModelPrice(selectedModel)}</span>
                  )}
                </div>
              </div>

              <div className="settings-section">
                <h3>Generation Settings</h3>

                <div className="form-group">
                  <label htmlFor="temperature">
                    Temperature: {temperature.toFixed(2)}
                  </label>
                  <input
                    id="temperature"
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={temperature}
                    onChange={(e) => setTemperature(parseFloat(e.target.value))}
                    className="slider"
                  />
                  <div className="slider-labels">
                    <span>Precise</span>
                    <span>Creative</span>
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="max-tokens">Max Tokens: {maxTokens}</label>
                  <input
                    id="max-tokens"
                    type="range"
                    min="1000"
                    max="8000"
                    step="500"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                    className="slider"
                  />
                  <div className="slider-labels">
                    <span>1000</span>
                    <span>8000</span>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3>Test Generation</h3>

                <div className="form-group">
                  <label htmlFor="test-framework">Default Test Framework</label>
                  <select
                    id="test-framework"
                    value={testFramework}
                    onChange={(e) => setTestFramework(e.target.value)}
                  >
                    <option value="pytest">pytest (Python)</option>
                    <option value="jest">Jest (JavaScript/TypeScript)</option>
                    <option value="vitest">Vitest (JavaScript/TypeScript)</option>
                    <option value="mocha">Mocha (JavaScript)</option>
                    <option value="go_test">Go Test</option>
                    <option value="rust_test">Rust Test</option>
                  </select>
                </div>
              </div>

              <div className="settings-actions">
                <button
                  className="btn-primary"
                  onClick={handleSaveAISettings}
                  disabled={aiSettingsLoading}
                >
                  {aiSettingsLoading ? 'Saving...' : 'Save AI Settings'}
                </button>
                {aiSettingsSaved && (
                  <span className="save-success">Settings saved!</span>
                )}
              </div>
            </>
          )}

          {activeTab === 'usage' && (
            <>
              <div className="settings-section">
                <h3>API Usage</h3>
                <p className="settings-description">
                  Track your AI API usage and costs.
                </p>

                <div className="form-group">
                  <label htmlFor="usage-days">Time Period</label>
                  <select
                    id="usage-days"
                    value={usageDays}
                    onChange={(e) => setUsageDays(parseInt(e.target.value))}
                  >
                    <option value="7">Last 7 days</option>
                    <option value="30">Last 30 days</option>
                    <option value="90">Last 90 days</option>
                  </select>
                </div>
              </div>

              {usageLoading ? (
                <div className="usage-loading">Loading usage data...</div>
              ) : usageSummary ? (
                <>
                  <div className="usage-summary">
                    <div className="usage-stat">
                      <span className="usage-stat-value">{usageSummary.total_requests}</span>
                      <span className="usage-stat-label">Total Requests</span>
                    </div>
                    <div className="usage-stat">
                      <span className="usage-stat-value">{usageSummary.total_tokens.toLocaleString()}</span>
                      <span className="usage-stat-label">Total Tokens</span>
                    </div>
                    <div className="usage-stat highlight">
                      <span className="usage-stat-value">{formatCost(usageSummary.total_cost_usd)}</span>
                      <span className="usage-stat-label">Estimated Cost</span>
                    </div>
                  </div>

                  {Object.keys(usageSummary.by_model).length > 0 && (
                    <div className="settings-section">
                      <h4>By Model</h4>
                      <table className="usage-table">
                        <thead>
                          <tr>
                            <th>Model</th>
                            <th>Requests</th>
                            <th>Tokens</th>
                            <th>Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(usageSummary.by_model).map(([model, stats]) => (
                            <tr key={model}>
                              <td>{model.split('/')[1] || model}</td>
                              <td>{stats.requests}</td>
                              <td>{stats.tokens.toLocaleString()}</td>
                              <td>{formatCost(stats.cost_usd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {Object.keys(usageSummary.by_endpoint).length > 0 && (
                    <div className="settings-section">
                      <h4>By Feature</h4>
                      <table className="usage-table">
                        <thead>
                          <tr>
                            <th>Feature</th>
                            <th>Requests</th>
                            <th>Tokens</th>
                            <th>Cost</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(usageSummary.by_endpoint).map(([endpoint, stats]) => (
                            <tr key={endpoint}>
                              <td>{endpoint.replace(/_/g, ' ')}</td>
                              <td>{stats.requests}</td>
                              <td>{stats.tokens.toLocaleString()}</td>
                              <td>{formatCost(stats.cost_usd)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              ) : (
                <div className="usage-empty">
                  <p>No usage data yet. Start using AI features to see your usage here.</p>
                </div>
              )}
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

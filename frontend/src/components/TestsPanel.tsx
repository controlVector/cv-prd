import { useState, useEffect } from 'react'
import {
  generateTestSuite,
  getTestCoverage,
  getTestsForPrd,
  TestCase,
} from '../services/api'
import './TestsPanel.css'

interface TestsPanelProps {
  prdId: string
  prdName: string
}

export function TestsPanel({ prdId, prdName }: TestsPanelProps) {
  const [testFramework, setTestFramework] = useState('pytest')
  const [isGenerating, setIsGenerating] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [tests, setTests] = useState<TestCase[]>([])
  const [testCoverage, setTestCoverage] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedTest, setExpandedTest] = useState<string | null>(null)

  // Load existing tests on mount
  useEffect(() => {
    const loadTests = async () => {
      setIsLoading(true)
      try {
        const [testsResult, coverageResult] = await Promise.all([
          getTestsForPrd(prdId),
          getTestCoverage(prdId).catch(() => null),
        ])
        setTests(testsResult.tests || [])
        if (coverageResult) {
          setTestCoverage(coverageResult)
        }
      } catch (err) {
        console.error('Failed to load tests:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadTests()
  }, [prdId])

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      const result = await generateTestSuite(prdId, testFramework)
      // Merge new tests with existing - generated tests are returned and also stored
      const newTests = result.test_cases || []
      setTests(prev => {
        // Add new tests that don't already exist
        const existingIds = new Set(prev.map(t => t.id))
        const uniqueNew = newTests.filter(t => !existingIds.has(t.id))
        return [...prev, ...uniqueNew]
      })
      // Refresh coverage
      try {
        const coverage = await getTestCoverage(prdId)
        setTestCoverage(coverage)
      } catch (e) {
        // Coverage fetch is optional
      }
    } catch (err: any) {
      const detail = err.response?.data?.detail || err.message
      if (detail.includes('API key')) {
        setError('OpenRouter API key not configured. Go to Settings to add your API key.')
      } else {
        setError(detail || 'Failed to generate tests')
      }
    } finally {
      setIsGenerating(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const downloadAsFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
  }

  const getFileExtension = () => {
    return testFramework === 'pytest' ? 'py' : 'js'
  }

  return (
    <div className="tests-panel">
      <div className="panel-intro">
        <h2>Generate Test Cases</h2>
        <p>
          AI will analyze your PRD requirements and generate test specifications
          with code stubs for your chosen framework.
        </p>
      </div>

      <div className="generation-controls">
        <div className="control-group">
          <label>Test Framework</label>
          <select
            value={testFramework}
            onChange={(e) => setTestFramework(e.target.value)}
            disabled={isGenerating}
          >
            <option value="pytest">pytest (Python)</option>
            <option value="jest">Jest (JavaScript)</option>
            <option value="vitest">Vitest (JavaScript)</option>
            <option value="mocha">Mocha (JavaScript)</option>
          </select>
        </div>
        <button
          className="btn-primary generate-btn"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <span className="spinner"></span>
              Generating Tests...
            </>
          ) : (
            'Generate Test Suite'
          )}
        </button>
      </div>

      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      {testCoverage && (
        <div className="coverage-summary">
          <h4>Test Coverage</h4>
          <div className="coverage-stats">
            <div className="stat">
              <span className="stat-value">{testCoverage.total_requirements || 0}</span>
              <span className="stat-label">Requirements</span>
            </div>
            <div className="stat">
              <span className="stat-value">{testCoverage.covered_requirements || 0}</span>
              <span className="stat-label">With Tests</span>
            </div>
            <div className="stat">
              <span className="stat-value">{testCoverage.total_tests || 0}</span>
              <span className="stat-label">Test Cases</span>
            </div>
            <div className="stat highlight">
              <span className="stat-value">{testCoverage.coverage_percent || 0}%</span>
              <span className="stat-label">Coverage</span>
            </div>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="loading-state">
          <span className="spinner"></span>
          <p>Loading existing tests...</p>
        </div>
      )}

      {!isLoading && tests.length > 0 && (
        <div className="generated-items">
          <div className="items-header">
            <h3>Test Cases ({tests.length})</h3>
            <button
              className="btn-secondary btn-sm"
              onClick={() => {
                const allCode = tests
                  .map(t => `# ${t.name}\n# ${t.description}\n\n${t.code_stub || '# No code stub'}`)
                  .join('\n\n' + '='.repeat(60) + '\n\n')
                downloadAsFile(allCode, `${prdName.toLowerCase().replace(/\s+/g, '_')}_tests.${getFileExtension()}`)
              }}
            >
              Download All
            </button>
          </div>

          {tests.map((test) => (
            <div key={test.id} className="test-item">
              <div
                className="item-header"
                onClick={() => setExpandedTest(expandedTest === test.id ? null : test.id)}
              >
                <div className="item-info">
                  <span className={`test-type-badge ${test.test_type}`}>
                    {test.test_type}
                  </span>
                  <span className="item-name">{test.name}</span>
                </div>
                <span className="expand-icon">{expandedTest === test.id ? '▼' : '▶'}</span>
              </div>

              <p className="item-description">{test.description}</p>

              {expandedTest === test.id && test.code_stub && (
                <div className="code-block">
                  <div className="code-header">
                    <span>Code Stub ({testFramework})</span>
                    <button
                      className="btn-sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        copyToClipboard(test.code_stub!)
                      }}
                    >
                      Copy
                    </button>
                  </div>
                  <pre><code>{test.code_stub}</code></pre>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {!isLoading && !isGenerating && tests.length === 0 && !error && (
        <div className="empty-state">
          <div className="empty-icon">🧪</div>
          <h3>No tests generated yet</h3>
          <p>Select your test framework and click "Generate Test Suite" to create test cases from your PRD requirements.</p>
        </div>
      )}
    </div>
  )
}

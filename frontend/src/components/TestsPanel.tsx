import { useState, useEffect, useRef } from 'react'
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

// Progress messages to show during generation
const PROGRESS_MESSAGES = [
  'Analyzing PRD requirements...',
  'Identifying testable scenarios...',
  'Generating test specifications...',
  'Creating test cases for each requirement...',
  'Determining recommended tech stack...',
  'Finalizing test suite...',
]

export function TestsPanel({ prdId, prdName }: TestsPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStatus, setGenerationStatus] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [tests, setTests] = useState<TestCase[]>([])
  const [testCoverage, setTestCoverage] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [expandedTest, setExpandedTest] = useState<string | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

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

  const startProgressMessages = () => {
    let index = 0
    setGenerationStatus(PROGRESS_MESSAGES[0])
    progressIntervalRef.current = setInterval(() => {
      index = (index + 1) % PROGRESS_MESSAGES.length
      setGenerationStatus(PROGRESS_MESSAGES[index])
    }, 3000) // Cycle through messages every 3 seconds
  }

  const stopProgressMessages = () => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
      progressIntervalRef.current = null
    }
    setGenerationStatus('')
  }

  const handleGenerate = async () => {
    setIsGenerating(true)
    setError(null)
    startProgressMessages()

    try {
      // No framework parameter - tests are now language-agnostic with AI recommendations
      const result = await generateTestSuite(prdId)
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
      stopProgressMessages()
      setIsGenerating(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const downloadAsMarkdown = () => {
    const content = tests.map(t => {
      let md = `## ${t.name}\n\n`
      md += `**Type:** ${t.test_type}\n`
      md += `**Priority:** ${t.priority || 'medium'}\n\n`
      md += `### Description\n${t.description}\n\n`
      if (t.preconditions?.length) {
        md += `### Preconditions\n${t.preconditions.map(p => `- ${p}`).join('\n')}\n\n`
      }
      if (t.steps?.length) {
        md += `### Steps\n${t.steps.map((s, i) => `${i + 1}. ${s}`).join('\n')}\n\n`
      }
      if (t.expected_result) {
        md += `### Expected Result\n${t.expected_result}\n\n`
      }
      if (t.recommended_language) {
        md += `### Recommended Stack\n`
        md += `- **Language:** ${t.recommended_language}\n`
        md += `- **Framework:** ${t.recommended_framework || 'N/A'}\n`
        if (t.stack_reasoning) {
          md += `- **Reasoning:** ${t.stack_reasoning}\n`
        }
        md += '\n'
      }
      if (t.code_stub) {
        md += `### Code Stub\n\`\`\`\n${t.code_stub}\n\`\`\`\n`
      }
      return md
    }).join('\n---\n\n')

    const blob = new Blob([`# Test Suite: ${prdName}\n\n${content}`], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${prdName.toLowerCase().replace(/\s+/g, '_')}_tests.md`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="tests-panel">
      <div className="panel-intro">
        <h2>Generate Test Cases</h2>
        <p>
          AI will analyze your PRD requirements and generate language-agnostic test
          specifications with recommended implementation stack.
        </p>
      </div>

      <div className="generation-controls">
        <button
          className="btn-primary generate-btn"
          onClick={handleGenerate}
          disabled={isGenerating}
        >
          {isGenerating ? (
            <>
              <span className="spinner"></span>
              Generating...
            </>
          ) : (
            'Generate Test Suite'
          )}
        </button>
      </div>

      {isGenerating && generationStatus && (
        <div className="generation-progress">
          <div className="progress-indicator">
            <span className="progress-dot"></span>
            <span className="progress-dot"></span>
            <span className="progress-dot"></span>
          </div>
          <p className="progress-status">{generationStatus}</p>
          <p className="progress-hint">This may take a minute depending on the number of requirements.</p>
        </div>
      )}

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
              onClick={downloadAsMarkdown}
            >
              Export as Markdown
            </button>
          </div>

          {/* Show recommended stack if available (from first test) */}
          {tests[0]?.recommended_language && (
            <div className="recommended-stack">
              <h4>Recommended Implementation Stack</h4>
              <div className="stack-info">
                <span className="stack-badge language">{tests[0].recommended_language}</span>
                {tests[0].recommended_framework && (
                  <span className="stack-badge framework">{tests[0].recommended_framework}</span>
                )}
              </div>
              {tests[0].stack_reasoning && (
                <p className="stack-reasoning">{tests[0].stack_reasoning}</p>
              )}
            </div>
          )}

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
                  <span className="item-name">{test.name || test.title}</span>
                </div>
                <span className="expand-icon">{expandedTest === test.id ? '▼' : '▶'}</span>
              </div>

              <p className="item-description">{test.description}</p>

              {expandedTest === test.id && (
                <div className="test-details">
                  {test.preconditions && test.preconditions.length > 0 && (
                    <div className="detail-section">
                      <h5>Preconditions</h5>
                      <ul>
                        {test.preconditions.map((p, i) => <li key={i}>{p}</li>)}
                      </ul>
                    </div>
                  )}

                  {test.steps && test.steps.length > 0 && (
                    <div className="detail-section">
                      <h5>Steps</h5>
                      <ol>
                        {test.steps.map((s, i) => <li key={i}>{s}</li>)}
                      </ol>
                    </div>
                  )}

                  {test.expected_result && (
                    <div className="detail-section">
                      <h5>Expected Result</h5>
                      <p>{test.expected_result}</p>
                    </div>
                  )}

                  {test.code_stub && (
                    <div className="code-block">
                      <div className="code-header">
                        <span>Code Stub</span>
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

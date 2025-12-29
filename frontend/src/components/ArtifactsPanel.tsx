import { useState } from 'react'
import {
  generateTestSuite,
  generateUserManual,
  generateApiDocs,
  generateTechnicalSpec,
  getTestCoverage,
  getDocumentationCoverage,
  TestCase,
  DocSection,
} from '../services/api'
import './ArtifactsPanel.css'

interface ArtifactsPanelProps {
  prdId: string
  prdName: string
}

type ArtifactTab = 'tests' | 'docs'
type DocType = 'user_manual' | 'api_docs' | 'technical_spec'

export function ArtifactsPanel({ prdId, prdName }: ArtifactsPanelProps) {
  const [activeTab, setActiveTab] = useState<ArtifactTab>('tests')

  // Test state
  const [testFramework, setTestFramework] = useState('pytest')
  const [isGeneratingTests, setIsGeneratingTests] = useState(false)
  const [generatedTests, setGeneratedTests] = useState<TestCase[]>([])
  const [testCoverage, setTestCoverage] = useState<any>(null)
  const [testError, setTestError] = useState<string | null>(null)

  // Doc state
  const [docType, setDocType] = useState<DocType>('user_manual')
  const [isGeneratingDocs, setIsGeneratingDocs] = useState(false)
  const [generatedDocs, setGeneratedDocs] = useState<DocSection[]>([])
  const [docCoverage, setDocCoverage] = useState<any>(null)
  const [docError, setDocError] = useState<string | null>(null)

  // Expanded test case for viewing code
  const [expandedTest, setExpandedTest] = useState<string | null>(null)

  const handleGenerateTests = async () => {
    setIsGeneratingTests(true)
    setTestError(null)
    try {
      const result = await generateTestSuite(prdId, testFramework)
      setGeneratedTests(result.test_cases || [])
      // Also fetch coverage
      const coverage = await getTestCoverage(prdId)
      setTestCoverage(coverage)
    } catch (err: any) {
      setTestError(err.response?.data?.detail || 'Failed to generate tests. Make sure OpenRouter API key is configured.')
    } finally {
      setIsGeneratingTests(false)
    }
  }

  const handleGenerateDocs = async () => {
    setIsGeneratingDocs(true)
    setDocError(null)
    try {
      let result
      switch (docType) {
        case 'user_manual':
          result = await generateUserManual(prdId)
          break
        case 'api_docs':
          result = await generateApiDocs(prdId)
          break
        case 'technical_spec':
          result = await generateTechnicalSpec(prdId)
          break
      }
      setGeneratedDocs(result?.sections || [])
      // Also fetch coverage
      const coverage = await getDocumentationCoverage(prdId)
      setDocCoverage(coverage)
    } catch (err: any) {
      setDocError(err.response?.data?.detail || 'Failed to generate documentation. Make sure OpenRouter API key is configured.')
    } finally {
      setIsGeneratingDocs(false)
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

  return (
    <div className="artifacts-panel">
      <div className="artifacts-header">
        <h2>Generated Artifacts</h2>
        <p className="artifacts-description">
          Generate test cases and documentation from your PRD requirements using AI.
        </p>
      </div>

      <div className="artifacts-tabs">
        <button
          className={activeTab === 'tests' ? 'active' : ''}
          onClick={() => setActiveTab('tests')}
        >
          Test Cases
        </button>
        <button
          className={activeTab === 'docs' ? 'active' : ''}
          onClick={() => setActiveTab('docs')}
        >
          Documentation
        </button>
      </div>

      {activeTab === 'tests' && (
        <div className="artifacts-content">
          <div className="generation-controls">
            <div className="control-group">
              <label>Test Framework</label>
              <select
                value={testFramework}
                onChange={(e) => setTestFramework(e.target.value)}
                disabled={isGeneratingTests}
              >
                <option value="pytest">pytest (Python)</option>
                <option value="jest">Jest (JavaScript)</option>
                <option value="vitest">Vitest (JavaScript)</option>
                <option value="mocha">Mocha (JavaScript)</option>
              </select>
            </div>
            <button
              className="btn-primary generate-btn"
              onClick={handleGenerateTests}
              disabled={isGeneratingTests}
            >
              {isGeneratingTests ? (
                <>
                  <span className="spinner"></span>
                  Generating Tests...
                </>
              ) : (
                'Generate Test Suite'
              )}
            </button>
          </div>

          {testError && (
            <div className="error-message">{testError}</div>
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
                  <span className="stat-value">{testCoverage.requirements_with_tests || 0}</span>
                  <span className="stat-label">With Tests</span>
                </div>
                <div className="stat highlight">
                  <span className="stat-value">{testCoverage.coverage_percent || 0}%</span>
                  <span className="stat-label">Coverage</span>
                </div>
              </div>
            </div>
          )}

          {generatedTests.length > 0 && (
            <div className="generated-items">
              <div className="items-header">
                <h4>Generated Tests ({generatedTests.length})</h4>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    const allCode = generatedTests
                      .map(t => `# ${t.name}\n# ${t.description}\n\n${t.code_stub || '# No code stub'}`)
                      .join('\n\n' + '='.repeat(60) + '\n\n')
                    downloadAsFile(allCode, `${prdName.toLowerCase().replace(/\s+/g, '_')}_tests.py`)
                  }}
                >
                  Download All
                </button>
              </div>

              {generatedTests.map((test) => (
                <div key={test.id} className="artifact-item test-item">
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
                        <span>Code Stub</span>
                        <button
                          className="btn-sm"
                          onClick={() => copyToClipboard(test.code_stub!)}
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

          {!isGeneratingTests && generatedTests.length === 0 && !testError && (
            <div className="empty-state">
              <p>No tests generated yet. Click "Generate Test Suite" to create test cases from your PRD requirements.</p>
            </div>
          )}
        </div>
      )}

      {activeTab === 'docs' && (
        <div className="artifacts-content">
          <div className="generation-controls">
            <div className="control-group">
              <label>Documentation Type</label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                disabled={isGeneratingDocs}
              >
                <option value="user_manual">User Manual</option>
                <option value="api_docs">API Documentation</option>
                <option value="technical_spec">Technical Specification</option>
              </select>
            </div>
            <button
              className="btn-primary generate-btn"
              onClick={handleGenerateDocs}
              disabled={isGeneratingDocs}
            >
              {isGeneratingDocs ? (
                <>
                  <span className="spinner"></span>
                  Generating Docs...
                </>
              ) : (
                'Generate Documentation'
              )}
            </button>
          </div>

          {docError && (
            <div className="error-message">{docError}</div>
          )}

          {docCoverage && (
            <div className="coverage-summary">
              <h4>Documentation Coverage</h4>
              <div className="coverage-stats">
                <div className="stat">
                  <span className="stat-value">{docCoverage.total_requirements || 0}</span>
                  <span className="stat-label">Requirements</span>
                </div>
                <div className="stat">
                  <span className="stat-value">{docCoverage.requirements_with_docs || 0}</span>
                  <span className="stat-label">Documented</span>
                </div>
                <div className="stat highlight">
                  <span className="stat-value">{docCoverage.coverage_percent || 0}%</span>
                  <span className="stat-label">Coverage</span>
                </div>
              </div>
            </div>
          )}

          {generatedDocs.length > 0 && (
            <div className="generated-items">
              <div className="items-header">
                <h4>Generated Sections ({generatedDocs.length})</h4>
                <button
                  className="btn-secondary btn-sm"
                  onClick={() => {
                    const markdown = generatedDocs
                      .map(d => `## ${d.title}\n\n${d.content}`)
                      .join('\n\n---\n\n')
                    downloadAsFile(
                      `# ${prdName} - ${docType.replace('_', ' ').toUpperCase()}\n\n${markdown}`,
                      `${prdName.toLowerCase().replace(/\s+/g, '_')}_${docType}.md`
                    )
                  }}
                >
                  Download as Markdown
                </button>
              </div>

              {generatedDocs.map((doc) => (
                <div key={doc.id} className="artifact-item doc-item">
                  <h5 className="doc-title">{doc.title}</h5>
                  <div className="doc-content">
                    {doc.content.split('\n').map((line, i) => (
                      <p key={i}>{line || <br />}</p>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isGeneratingDocs && generatedDocs.length === 0 && !docError && (
            <div className="empty-state">
              <p>No documentation generated yet. Select a type and click "Generate Documentation" to create docs from your PRD.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

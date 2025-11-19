import { useState } from 'react'
import { PRDForm } from './components/PRDForm'
import { SearchInterface } from './components/SearchInterface'
import { PRDList } from './components/PRDList'
import { PRDDetail } from './components/PRDDetail'
import { DocumentUpload } from './components/DocumentUpload'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'upload' | 'search' | 'list'>(
    'create'
  )
  const [selectedPRD, setSelectedPRD] = useState<string | null>(null)

  return (
    <div className="app">
      <header className="app-header">
        <h1>cvPRD</h1>
        <p>AI-Powered Product Requirements Documentation</p>
      </header>

      <nav className="app-nav">
        <button
          className={activeTab === 'create' ? 'active' : ''}
          onClick={() => setActiveTab('create')}
        >
          Create PRD
        </button>
        <button
          className={activeTab === 'upload' ? 'active' : ''}
          onClick={() => setActiveTab('upload')}
        >
          Upload Document
        </button>
        <button
          className={activeTab === 'search' ? 'active' : ''}
          onClick={() => setActiveTab('search')}
        >
          Search
        </button>
        <button
          className={activeTab === 'list' ? 'active' : ''}
          onClick={() => setActiveTab('list')}
        >
          Your PRDs
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'create' && <PRDForm />}
        {activeTab === 'upload' && <DocumentUpload />}
        {activeTab === 'search' && <SearchInterface />}
        {activeTab === 'list' && !selectedPRD && (
          <PRDList onSelectPRD={(prdId) => setSelectedPRD(prdId)} />
        )}
        {activeTab === 'list' && selectedPRD && (
          <PRDDetail
            prdId={selectedPRD}
            onBack={() => setSelectedPRD(null)}
          />
        )}
      </main>

      <footer className="app-footer">
        <p>
          Powered by Qdrant, Neo4j, and sentence-transformers |{' '}
          <a
            href="http://localhost:7474"
            target="_blank"
            rel="noopener noreferrer"
          >
            Neo4j Browser
          </a>{' '}
          |{' '}
          <a
            href="http://localhost:6333/dashboard"
            target="_blank"
            rel="noopener noreferrer"
          >
            Qdrant Dashboard
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App

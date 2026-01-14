import { useState } from 'react'
import { PRDForm } from './components/PRDForm'
import { SearchInterface } from './components/SearchInterface'
import { PRDList } from './components/PRDList'
import { PRDDetail } from './components/PRDDetail'
import { DocumentUpload } from './components/DocumentUpload'
import { Settings } from './components/Settings'
import { UpdateNotification } from './components/UpdateNotification'
import { ApiKeyWarning } from './components/ApiKeyWarning'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'upload' | 'search' | 'list'>(
    'create'
  )
  const [selectedPRD, setSelectedPRD] = useState<string | null>(null)
  const [showSettings, setShowSettings] = useState(false)

  return (
    <div className="app">
      <UpdateNotification />
      <ApiKeyWarning onOpenSettings={() => setShowSettings(true)} />
      <header className="app-header">
        <img src="/cflogo.png" alt="Control Fabric" className="app-logo" />
        <div className="app-header-content">
          <h1>Control Fabric PRD</h1>
          <p>AI-Powered Product Requirements Documentation</p>
        </div>
        <button
          className="settings-button"
          onClick={() => setShowSettings(true)}
          title="Settings"
        >
          ⚙
        </button>
      </header>

      <Settings isOpen={showSettings} onClose={() => setShowSettings(false)} />

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
          Powered by FalkorDB, Qdrant, and sentence-transformers |{' '}
          <a
            href="http://localhost:6333/dashboard"
            target="_blank"
            rel="noopener noreferrer"
          >
            Qdrant Dashboard
          </a>{' '}
          |{' '}
          <a
            href="http://localhost:8000/docs"
            target="_blank"
            rel="noopener noreferrer"
          >
            API Docs
          </a>
        </p>
      </footer>
    </div>
  )
}

export default App

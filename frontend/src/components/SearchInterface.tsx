import { useState } from 'react'
import { searchSemantic } from '../services/api'
import type { SearchResult } from '../types'

export function SearchInterface() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [searchPerformed, setSearchPerformed] = useState(false)

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!query.trim()) return

    setIsLoading(true)
    setSearchPerformed(true)

    try {
      const response = await searchSemantic(query, 10)
      setResults(response.results)
    } catch (err) {
      console.error('Search failed:', err)
      setResults([])
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="search-interface">
      <h2>Semantic Search</h2>
      <p className="subtitle">
        Search across all PRD requirements using natural language
      </p>

      <form onSubmit={handleSearch} className="search-form">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g., How do we handle security and authentication?"
          className="search-input"
        />
        <button type="submit" disabled={isLoading} className="btn-primary">
          {isLoading ? 'Searching...' : 'Search'}
        </button>
      </form>

      {searchPerformed && (
        <div className="search-results">
          {results.length === 0 ? (
            <p className="no-results">No results found</p>
          ) : (
            <>
              <p className="results-count">Found {results.length} results</p>
              {results.map((result) => (
                <div key={result.chunk_id} className="result-card">
                  <div className="result-header">
                    <span className="result-score">
                      Score: {result.score.toFixed(3)}
                    </span>
                    <span className={`badge badge-${result.payload.priority}`}>
                      {result.payload.priority}
                    </span>
                    <span className="badge badge-type">
                      {result.payload.chunk_type}
                    </span>
                  </div>

                  <h4>{result.payload.section_title}</h4>
                  <p className="result-text">{result.payload.text}</p>

                  {result.payload.tags.length > 0 && (
                    <div className="result-tags">
                      {result.payload.tags.map((tag) => (
                        <span key={tag} className="tag">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  <details className="result-context">
                    <summary>View Full Context</summary>
                    <p>{result.payload.context}</p>
                  </details>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  )
}

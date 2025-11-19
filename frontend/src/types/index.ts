export interface PRDSection {
  title: string
  content: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  tags: string[]
}

export interface CreatePRDRequest {
  name: string
  description?: string
  sections: PRDSection[]
}

export interface Chunk {
  id: string
  type: string
  text: string
  priority: string
  tags: string[]
}

export interface PRDResponse {
  prd_id: string
  prd_name: string
  chunks_created: number
  relationships_created: number
  chunks: Chunk[]
}

export interface SearchResult {
  chunk_id: string
  score: number
  payload: {
    chunk_id: string
    prd_id: string
    chunk_type: string
    text: string
    context: string
    priority: string
    tags: string[]
    section_title: string
  }
}

export interface SearchResponse {
  query: string
  results: SearchResult[]
  count: number
}

export interface PRDSummary {
  id: string
  name: string
  description: string | null
  chunk_count: number
}

export interface OptimizeResponse {
  status: string
  prd_id: string
  prd_name: string
  optimization_goal: string
  analysis: {
    overall_assessment: string
    structural_insights: string
  }
  statistics: {
    facts_updated: number
    facts_created: number
    relationships_created: number
    facts_unchanged: number
  }
  detailed_analysis: any
}

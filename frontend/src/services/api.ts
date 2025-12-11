import axios from 'axios'
import type {
  CreatePRDRequest,
  PRDResponse,
  SearchResponse,
  PRDSummary,
  OptimizeResponse,
} from '../types'

// Detect if running in Electron
const isElectron = () => {
  return !!(window as any).electron
}

// Use absolute URL when running in Electron desktop app
const baseURL = isElectron()
  ? 'http://localhost:8000/api/v1'
  : '/api/v1'

const api = axios.create({
  baseURL,
  headers: {
    'Content-Type': 'application/json',
  },
})

export const createPRD = async (data: CreatePRDRequest): Promise<PRDResponse> => {
  const response = await api.post<PRDResponse>('/prds', data)
  return response.data
}

export const listPRDs = async (): Promise<PRDSummary[]> => {
  const response = await api.get<{ prds: PRDSummary[] }>('/prds')
  return response.data.prds
}

export const getPRD = async (prdId: string) => {
  const response = await api.get(`/prds/${prdId}`)
  return response.data
}

export const searchSemantic = async (
  query: string,
  limit: number = 10,
  prdId?: string
): Promise<SearchResponse> => {
  const response = await api.post<SearchResponse>('/search', {
    query,
    limit,
    prd_id: prdId,
  })
  return response.data
}

export const getChunkContext = async (chunkId: string) => {
  const response = await api.get(`/chunks/${chunkId}/context`)
  return response.data
}

export const healthCheck = async () => {
  const response = await api.get('/health')
  return response.data
}

export const optimizePRD = async (
  prdId: string,
  optimizationGoal: string = 'AI Paired Programming'
): Promise<OptimizeResponse> => {
  const response = await api.post<OptimizeResponse>(
    `/prds/${prdId}/optimize?optimization_goal=${encodeURIComponent(optimizationGoal)}`
  )
  return response.data
}

export const uploadDocument = async (
  file: File,
  name?: string,
  description?: string
): Promise<PRDResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  if (name) {
    formData.append('name', name)
  }
  if (description) {
    formData.append('description', description)
  }

  const response = await api.post<PRDResponse>('/prds/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

// Export types
export interface ExportFormat {
  id: string
  name: string
  description: string
  types: { id: string; name: string; description: string }[]
  disabled?: boolean
}

export interface ExportRequest {
  format: string
  export_type: string
  prd_ids?: string[]
  project_name?: string
}

export const getExportFormats = async (): Promise<{ formats: ExportFormat[] }> => {
  const response = await api.get('/export/formats')
  return response.data
}

export const exportPRDs = async (request: ExportRequest): Promise<Blob> => {
  const response = await api.post('/export', request, {
    responseType: 'blob',
  })
  return response.data
}

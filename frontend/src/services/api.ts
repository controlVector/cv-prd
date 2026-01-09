import axios from 'axios'
import type {
  CreatePRDRequest,
  PRDResponse,
  SearchResponse,
  PRDSummary,
  OptimizeResponse,
} from '../types'

// Detect if running in a desktop app (Electron or Tauri)
const isDesktopApp = () => {
  // Check for Electron
  if ((window as any).electron) return true
  // Check for Tauri
  if ((window as any).__TAURI__) return true
  // Check if served from tauri:// or file:// protocol
  if (window.location.protocol === 'tauri:' || window.location.protocol === 'file:') return true
  return false
}

// Use absolute URL when running in desktop app (Tauri or Electron)
const baseURL = isDesktopApp()
  ? 'http://127.0.0.1:8000/api/v1'
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
  save_path?: string
}

export interface ExportResponse {
  success: boolean
  path: string
  filename: string
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

export const exportPRDsToPath = async (request: ExportRequest): Promise<ExportResponse> => {
  const response = await api.post('/export', request)
  return response.data
}

// =============================================================================
// Test Generation
// =============================================================================

export interface GenerateTestsRequest {
  test_type?: 'unit' | 'integration' | 'acceptance' | 'all'
  framework?: 'pytest' | 'jest' | 'mocha' | 'vitest'
  include_code_stub?: boolean
}

export interface TestCase {
  id: string
  name: string
  description: string
  test_type: string
  code_stub?: string
  requirement_chunk_id: string
}

export interface GenerateTestsResponse {
  chunk_id: string
  test_cases: TestCase[]
  count: number
}

export interface TestSuiteResponse {
  prd_id: string
  total_tests: number
  by_type: Record<string, number>
  test_cases: TestCase[]
}

export const generateTestsForChunk = async (
  chunkId: string,
  options: GenerateTestsRequest = {}
): Promise<GenerateTestsResponse> => {
  const response = await api.post(`/chunks/${chunkId}/generate-tests`, {
    test_type: options.test_type || 'all',
    framework: options.framework,
    include_code_stub: options.include_code_stub ?? true,
  })
  return response.data
}

export const generateTestSuite = async (
  prdId: string,
  framework?: string
): Promise<TestSuiteResponse> => {
  const response = await api.post(`/prds/${prdId}/generate-test-suite`, {
    framework,
  })
  return response.data
}

export const getTestsForChunk = async (chunkId: string): Promise<TestCase[]> => {
  const response = await api.get(`/chunks/${chunkId}/tests`)
  return response.data
}

export const getTestsForPrd = async (prdId: string): Promise<{ tests: TestCase[] }> => {
  const response = await api.get(`/prds/${prdId}/tests`)
  return response.data
}

export const getTestCoverage = async (prdId: string) => {
  const response = await api.get(`/prds/${prdId}/test-coverage`)
  return response.data
}

// =============================================================================
// Documentation Generation
// =============================================================================

export interface DocSection {
  id: string
  title: string
  content: string
  doc_type: string
  requirement_chunk_id?: string
}

export interface GenerateDocsResponse {
  prd_id: string
  doc_type: string
  sections: DocSection[]
  count: number
}

export interface ReleaseNotesResponse {
  prd_id: string
  version: string
  content: string
  sections: {
    features: string[]
    improvements: string[]
    fixes: string[]
  }
}

export const generateUserManual = async (
  prdId: string,
  audience: string = 'end users'
): Promise<GenerateDocsResponse> => {
  const response = await api.post(
    `/prds/${prdId}/generate-user-manual?audience=${encodeURIComponent(audience)}`
  )
  return response.data
}

export const generateApiDocs = async (prdId: string): Promise<GenerateDocsResponse> => {
  const response = await api.post(`/prds/${prdId}/generate-api-docs`)
  return response.data
}

export const generateTechnicalSpec = async (prdId: string): Promise<GenerateDocsResponse> => {
  const response = await api.post(`/prds/${prdId}/generate-technical-spec`)
  return response.data
}

export const generateReleaseNotes = async (
  prdId: string,
  version: string,
  changes?: string[]
): Promise<ReleaseNotesResponse> => {
  const response = await api.post(`/prds/${prdId}/generate-release-notes`, {
    version,
    changes,
  })
  return response.data
}

export const getDocumentationForChunk = async (chunkId: string): Promise<DocSection[]> => {
  const response = await api.get(`/chunks/${chunkId}/documentation`)
  return response.data
}

export const getDocumentationCoverage = async (prdId: string) => {
  const response = await api.get(`/prds/${prdId}/documentation-coverage`)
  return response.data
}

// =============================================================================
// Async Job Management
// =============================================================================

export interface JobStatus {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled'
  progress: number
  current_step: string | null
  error_message: string | null
  result_data: Record<string, any> | null
}

export interface AsyncUploadResponse {
  job_id: string
  status: string
  message: string
}

/**
 * Upload a document asynchronously with progress tracking.
 * Returns immediately with a job_id that can be polled for progress.
 */
export const uploadDocumentAsync = async (
  file: File,
  name?: string,
  description?: string
): Promise<AsyncUploadResponse> => {
  const formData = new FormData()
  formData.append('file', file)
  if (name) {
    formData.append('name', name)
  }
  if (description) {
    formData.append('description', description)
  }

  const response = await api.post<AsyncUploadResponse>('/prds/upload/async', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
  return response.data
}

/**
 * Get the status of a background job.
 * Poll this to track progress of async operations.
 */
export const getJobStatus = async (jobId: string): Promise<JobStatus> => {
  const response = await api.get<JobStatus>(`/jobs/${jobId}`)
  return response.data
}

/**
 * Cancel a pending or running job.
 */
export const cancelJob = async (jobId: string): Promise<void> => {
  await api.post(`/jobs/${jobId}/cancel`)
}

/**
 * Poll a job until completion.
 * Calls onProgress callback with status updates.
 * Returns the final job status.
 */
export const pollJobUntilComplete = async (
  jobId: string,
  onProgress?: (status: JobStatus) => void,
  pollInterval: number = 500
): Promise<JobStatus> => {
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const status = await getJobStatus(jobId)

        if (onProgress) {
          onProgress(status)
        }

        if (status.status === 'completed') {
          resolve(status)
        } else if (status.status === 'failed') {
          reject(new Error(status.error_message || 'Job failed'))
        } else if (status.status === 'cancelled') {
          reject(new Error('Job was cancelled'))
        } else {
          // Still processing, poll again
          setTimeout(poll, pollInterval)
        }
      } catch (error) {
        reject(error)
      }
    }

    poll()
  })
}

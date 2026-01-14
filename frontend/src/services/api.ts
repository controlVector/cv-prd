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

// =============================================================================
// Version History & Change Management
// =============================================================================

export interface PRDVersion {
  id: string
  prd_id: string
  version_number: number
  created_at: string | null
  created_by: string | null
  comment: string | null
  change_count: number
}

export interface PRDVersionFull extends PRDVersion {
  snapshot_data: {
    prd: Record<string, any>
    sections: Record<string, any>[]
    chunks: Record<string, any>[]
  }
  changes: PRDChange[]
}

export interface PRDChange {
  id: string
  version_id: string
  prd_id: string
  change_type: string
  entity_type: string
  entity_id: string
  previous_value: Record<string, any> | null
  new_value: Record<string, any> | null
  diff_data: Record<string, any> | null
  created_at: string | null
}

export interface VersionComparison {
  prd_id: string
  version1: number
  version2: number
  section_changes: {
    type: 'added' | 'modified' | 'deleted'
    section_id: string
    section?: Record<string, any>
    diff?: Record<string, any>
  }[]
  chunk_changes: {
    type: 'added' | 'modified' | 'deleted'
    chunk_id: string
    chunk?: Record<string, any>
    diff?: Record<string, any>
  }[]
  summary: string
}

export interface AddSectionRequest {
  title: string
  content: string
  priority?: string
  tags?: string[]
}

export interface UpdateSectionRequest {
  title?: string
  content?: string
  priority?: string
  tags?: string[]
}

export interface UpdateChunkRequest {
  text?: string
  priority?: string
  tags?: string[]
}

export interface SectionCRUDResponse {
  section: Record<string, any>
  version: PRDVersion
  diff?: Record<string, any>
}

export interface ChunkCRUDResponse {
  chunk: Record<string, any>
  version: PRDVersion
  diff?: Record<string, any>
  embedding_updated?: boolean
}

export interface DeleteResponse {
  version: PRDVersion
  deleted_section?: Record<string, any>
  deleted_chunk?: Record<string, any>
  deleted_chunks?: number
}

export interface RevertResponse {
  version: PRDVersion
  reverted_to: number
  restored_sections: number
  restored_chunks: number
}

// Version History API

export const getVersionHistory = async (
  prdId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ versions: PRDVersion[]; count: number }> => {
  const response = await api.get(`/prds/${prdId}/versions`, {
    params: { limit, offset },
  })
  return response.data
}

export const getVersion = async (
  prdId: string,
  versionId: string
): Promise<PRDVersionFull> => {
  const response = await api.get(`/prds/${prdId}/versions/${versionId}`)
  return response.data
}

export const getVersionByNumber = async (
  prdId: string,
  versionNumber: number
): Promise<PRDVersionFull> => {
  const response = await api.get(
    `/prds/${prdId}/versions/number/${versionNumber}`
  )
  return response.data
}

export const compareVersions = async (
  prdId: string,
  v1: number,
  v2: number
): Promise<VersionComparison> => {
  const response = await api.get(`/prds/${prdId}/versions/compare`, {
    params: { v1, v2 },
  })
  return response.data
}

export const revertToVersion = async (
  prdId: string,
  versionNumber: number,
  comment?: string
): Promise<RevertResponse> => {
  const response = await api.post(`/prds/${prdId}/revert`, {
    version_number: versionNumber,
    comment,
  })
  return response.data
}

// Section CRUD API

export const addSection = async (
  prdId: string,
  data: AddSectionRequest
): Promise<SectionCRUDResponse> => {
  const response = await api.post(`/prds/${prdId}/sections`, data)
  return response.data
}

export const updateSection = async (
  prdId: string,
  sectionId: string,
  data: UpdateSectionRequest
): Promise<SectionCRUDResponse> => {
  const response = await api.put(`/prds/${prdId}/sections/${sectionId}`, data)
  return response.data
}

export const deleteSection = async (
  prdId: string,
  sectionId: string
): Promise<DeleteResponse> => {
  const response = await api.delete(`/prds/${prdId}/sections/${sectionId}`)
  return response.data
}

// Chunk CRUD API (with version tracking)

export const updatePRDChunk = async (
  prdId: string,
  chunkId: string,
  data: UpdateChunkRequest
): Promise<ChunkCRUDResponse> => {
  const response = await api.put(`/prds/${prdId}/chunks/${chunkId}`, data)
  return response.data
}

export const deletePRDChunk = async (
  prdId: string,
  chunkId: string
): Promise<DeleteResponse> => {
  const response = await api.delete(`/prds/${prdId}/chunks/${chunkId}`)
  return response.data
}

// =============================================================================
// Design Templates
// =============================================================================

export interface UIFramework {
  id: string
  name: string
  description: string
  category: string
  features: string[]
  best_for: string[]
}

export interface UIFrameworkDetails extends UIFramework {
  npm_packages: string[]
  docs_url: string
  github_url: string
  setup_commands: string[]
}

export interface DesignStyle {
  id: string
  name: string
}

export interface DesignConcept {
  id: string
  prd_id: string
  prd_name: string
  name: string
  description: string
  key_screens: string[]
  color_scheme: {
    primary: string
    secondary: string
    accent: string
    background: string
    text: string
  }
  typography: {
    headings: string
    body: string
  }
  ui_patterns: string[]
  differentiators: string[]
  refined_from?: string
}

export interface GeneratedCodeFile {
  path: string
  content: string
  description: string
}

export interface GeneratedCode {
  id: string
  concept_id: string
  framework_id: string
  prd_id: string
  files: GeneratedCodeFile[]
  setup_commands: string[]
  readme: string
  folder_structure: string
}

// Framework & Styles API

export const getDesignFrameworks = async (): Promise<{ frameworks: UIFramework[] }> => {
  const response = await api.get('/design/frameworks')
  return response.data
}

export const getDesignFrameworkDetails = async (
  frameworkId: string
): Promise<UIFrameworkDetails> => {
  const response = await api.get(`/design/frameworks/${frameworkId}`)
  return response.data
}

export const getDesignStyles = async (): Promise<{ styles: DesignStyle[] }> => {
  const response = await api.get('/design/styles')
  return response.data
}

// Design Concepts API

export const generateDesignConcepts = async (
  prdId: string,
  style: string = 'modern',
  numConcepts: number = 3
): Promise<{ prd_id: string; style: string; concepts: DesignConcept[]; count: number }> => {
  const response = await api.post(`/prds/${prdId}/design/concepts`, {
    style,
    num_concepts: numConcepts,
  })
  return response.data
}

export const getDesignConcepts = async (
  prdId: string
): Promise<{ prd_id: string; concepts: DesignConcept[]; count: number }> => {
  const response = await api.get(`/prds/${prdId}/design/concepts`)
  return response.data
}

export const refineDesignConcept = async (
  prdId: string,
  conceptId: string,
  feedback: string
): Promise<DesignConcept> => {
  const response = await api.post(
    `/prds/${prdId}/design/concepts/${conceptId}/refine`,
    { feedback }
  )
  return response.data
}

// Code Generation API

export const generateDesignCode = async (
  prdId: string,
  conceptId: string,
  frameworkId: string
): Promise<GeneratedCode> => {
  const response = await api.post(
    `/prds/${prdId}/design/concepts/${conceptId}/generate-code`,
    { framework_id: frameworkId }
  )
  return response.data
}

export const getDesignCode = async (
  prdId: string,
  conceptId: string
): Promise<{ concept_id: string; code_results: GeneratedCode[]; count: number }> => {
  const response = await api.get(`/prds/${prdId}/design/concepts/${conceptId}/code`)
  return response.data
}

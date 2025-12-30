/**
 * Error Reporter Utility
 *
 * Provides global error handling for frontend JavaScript errors,
 * unhandled promise rejections, and manual bug reporting.
 */

interface ErrorReport {
  error_type: string
  message: string
  stack_trace?: string
  component?: string
  url?: string
  user_action?: string
  is_react_crash: boolean
  breadcrumbs: string[]
}

interface CustomerComplaint {
  title: string
  description: string
  steps_to_reproduce?: string
  expected_behavior?: string
}

// Breadcrumb tracking for context
const breadcrumbs: string[] = []
const MAX_BREADCRUMBS = 20

/**
 * Add a breadcrumb for tracking user actions
 */
export function addBreadcrumb(action: string): void {
  const timestamp = new Date().toISOString()
  breadcrumbs.push(`[${timestamp}] ${action}`)
  if (breadcrumbs.length > MAX_BREADCRUMBS) {
    breadcrumbs.shift()
  }
}

/**
 * Get current breadcrumbs
 */
export function getBreadcrumbs(): string[] {
  return [...breadcrumbs]
}

/**
 * Detect if running in a desktop app
 */
const isDesktopApp = (): boolean => {
  if ((window as any).electron) return true
  if ((window as any).__TAURI__) return true
  if (window.location.protocol === 'tauri:' || window.location.protocol === 'file:')
    return true
  return false
}

/**
 * Get the API base URL
 */
const getBaseURL = (): string => {
  return isDesktopApp() ? 'http://127.0.0.1:8000/api/v1' : '/api/v1'
}

/**
 * Send an error report to the backend
 */
async function reportError(report: ErrorReport): Promise<void> {
  try {
    const baseURL = getBaseURL()
    await fetch(`${baseURL}/bugs/frontend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...report,
        breadcrumbs: getBreadcrumbs(),
      }),
    })
  } catch (e) {
    // Silently fail - don't cause more errors
    console.error('Failed to report error:', e)
  }
}

/**
 * Setup global error handlers for uncaught errors
 */
export function setupGlobalErrorHandlers(): void {
  // JavaScript errors
  window.onerror = (
    message: string | Event,
    source?: string,
    _lineno?: number,
    _colno?: number,
    error?: Error
  ): boolean => {
    reportError({
      error_type: error?.name || 'Error',
      message: String(message),
      stack_trace: error?.stack,
      url: source || window.location.href,
      is_react_crash: false,
      breadcrumbs: getBreadcrumbs(),
    })

    // Return false to allow default error handling
    return false
  }

  // Unhandled promise rejections
  window.onunhandledrejection = (event: PromiseRejectionEvent): void => {
    const error = event.reason
    reportError({
      error_type: 'UnhandledRejection',
      message: error?.message || String(error),
      stack_trace: error?.stack,
      url: window.location.href,
      is_react_crash: false,
      breadcrumbs: getBreadcrumbs(),
    })
  }

  console.log('Global error handlers initialized')
}

/**
 * Setup axios interceptor for API error tracking
 */
export function setupAxiosErrorInterceptor(axios: any): void {
  axios.interceptors.response.use(
    (response: any) => response,
    (error: any) => {
      if (error.response?.status >= 500) {
        reportError({
          error_type: `HTTP_${error.response.status}`,
          message: error.response?.data?.detail || error.message,
          url: error.config?.url,
          user_action: `${error.config?.method?.toUpperCase()} ${error.config?.url}`,
          is_react_crash: false,
          breadcrumbs: getBreadcrumbs(),
        })
      }
      return Promise.reject(error)
    }
  )
}

/**
 * Manually report an error
 */
export async function reportManualError(
  errorType: string,
  message: string,
  stackTrace?: string,
  component?: string
): Promise<boolean> {
  try {
    await reportError({
      error_type: errorType,
      message,
      stack_trace: stackTrace,
      component,
      url: window.location.href,
      is_react_crash: false,
      breadcrumbs: getBreadcrumbs(),
    })
    return true
  } catch (e) {
    console.error('Failed to report error:', e)
    return false
  }
}

/**
 * Submit a customer complaint/bug report
 */
export async function submitCustomerComplaint(
  complaint: CustomerComplaint
): Promise<boolean> {
  try {
    const baseURL = getBaseURL()
    const response = await fetch(`${baseURL}/bugs/complaint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(complaint),
    })
    return response.ok
  } catch (e) {
    console.error('Failed to submit bug report:', e)
    return false
  }
}

/**
 * Get bug reporting configuration status
 */
export async function getBugReportingConfig(): Promise<{
  enabled: boolean
  project_id: string
  project_name: string
} | null> {
  try {
    const baseURL = getBaseURL()
    const response = await fetch(`${baseURL}/bugs/config`)
    if (response.ok) {
      return await response.json()
    }
    return null
  } catch (e) {
    console.error('Failed to get bug reporting config:', e)
    return null
  }
}

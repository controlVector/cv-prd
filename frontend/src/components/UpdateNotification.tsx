import { useState, useEffect } from 'react'
import { check } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'

interface UpdateState {
  available: boolean
  version: string | null
  releaseNotes: string | null
  downloading: boolean
  progress: number
  error: string | null
}

export function UpdateNotification() {
  const [updateState, setUpdateState] = useState<UpdateState>({
    available: false,
    version: null,
    releaseNotes: null,
    downloading: false,
    progress: 0,
    error: null,
  })
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    checkForUpdates()
  }, [])

  async function checkForUpdates() {
    try {
      const update = await check()
      if (update) {
        setUpdateState({
          available: true,
          version: update.version,
          releaseNotes: update.body || null,
          downloading: false,
          progress: 0,
          error: null,
        })
      }
    } catch (error) {
      console.error('Update check failed:', error)
    }
  }

  async function downloadAndInstall() {
    try {
      setUpdateState((prev) => ({ ...prev, downloading: true, error: null }))

      const update = await check()
      if (!update) return

      let downloaded = 0
      let contentLength = 0

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength || 0
            break
          case 'Progress':
            downloaded += event.data.chunkLength
            const progress = contentLength > 0 ? (downloaded / contentLength) * 100 : 0
            setUpdateState((prev) => ({ ...prev, progress }))
            break
          case 'Finished':
            setUpdateState((prev) => ({ ...prev, progress: 100 }))
            break
        }
      })

      await relaunch()
    } catch (error) {
      setUpdateState((prev) => ({
        ...prev,
        downloading: false,
        error: error instanceof Error ? error.message : 'Update failed',
      }))
    }
  }

  if (!updateState.available || dismissed) {
    return null
  }

  return (
    <div className="update-notification">
      <div className="update-content">
        <div className="update-icon">🚀</div>
        <div className="update-text">
          <strong>Update Available!</strong>
          <span>Version {updateState.version} is ready to install</span>
        </div>
      </div>

      {updateState.error && (
        <div className="update-error">{updateState.error}</div>
      )}

      {updateState.downloading ? (
        <div className="update-progress">
          <div
            className="update-progress-bar"
            style={{ width: `${updateState.progress}%` }}
          />
          <span>{Math.round(updateState.progress)}%</span>
        </div>
      ) : (
        <div className="update-actions">
          <button className="update-btn-install" onClick={downloadAndInstall}>
            Install & Restart
          </button>
          <button className="update-btn-dismiss" onClick={() => setDismissed(true)}>
            Later
          </button>
        </div>
      )}
    </div>
  )
}

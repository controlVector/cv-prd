const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const express = require('express');
const findProcess = require('find-process');

let mainWindow;
let backendProcess;
let qdrantProcess;
let expressServer;

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 3456; // Internal port for serving frontend
const QDRANT_PORT = 6333;

// Determine if running in development or production
const isDev = !app.isPackaged;

// Get paths for bundled resources
function getResourcePath(relativePath) {
  if (isDev) {
    return path.join(__dirname, relativePath);
  }
  return path.join(process.resourcesPath, relativePath);
}

// Start embedded Qdrant vector database
async function startQdrant() {
  return new Promise((resolve, reject) => {
    console.log('Starting Qdrant vector database...');

    const dataPath = path.join(app.getPath('userData'), 'qdrant_data');
    const qdrantBinary = getResourcePath(
      path.join('databases', 'qdrant', process.platform === 'win32' ? 'qdrant.exe' : 'qdrant')
    );

    // For now, we'll use Docker in development and embedded in production
    if (isDev) {
      console.log('Using Docker Qdrant in development mode');
      resolve();
      return;
    }

    qdrantProcess = spawn(qdrantBinary, ['--storage-path', dataPath], {
      env: { ...process.env, QDRANT__SERVICE__HTTP_PORT: QDRANT_PORT.toString() }
    });

    qdrantProcess.stdout.on('data', (data) => {
      console.log(`Qdrant: ${data}`);
      if (data.includes('listening')) {
        resolve();
      }
    });

    qdrantProcess.stderr.on('data', (data) => {
      console.error(`Qdrant Error: ${data}`);
    });

    qdrantProcess.on('error', (error) => {
      reject(error);
    });

    // Timeout after 10 seconds
    setTimeout(() => resolve(), 10000);
  });
}

// Start Python backend
async function startBackend() {
  return new Promise((resolve, reject) => {
    console.log('Starting Python backend...');

    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'cvprd.db');

    let backendCommand;
    let backendArgs = [];
    let backendCwd;

    if (isDev) {
      // Development mode: run with Python directly
      const backendPath = path.join(__dirname, '..', 'backend');
      backendCommand = process.platform === 'win32' ? 'python' : 'python3';
      backendArgs = ['-m', 'uvicorn', 'app.main:app', '--host', '0.0.0.0', '--port', BACKEND_PORT.toString()];
      backendCwd = backendPath;
    } else {
      // Production mode: run bundled executable
      // PyInstaller creates: backend-dist/cvprd-backend.exe (flat structure)
      const backendDir = getResourcePath('backend-dist');
      const exeName = process.platform === 'win32' ? 'cvprd-backend.exe' : 'cvprd-backend';
      backendCommand = path.join(backendDir, exeName);
      backendArgs = [];
      backendCwd = backendDir;
    }

    backendProcess = spawn(backendCommand, backendArgs, {
      cwd: backendCwd,
      env: {
        ...process.env,
        DATABASE_URL: `sqlite:///${dbPath}`,
        QDRANT_HOST: 'localhost',
        QDRANT_PORT: QDRANT_PORT.toString(),
        NEO4J_ENABLED: 'false', // Disable Neo4j for desktop version
        PORT: BACKEND_PORT.toString()
      }
    });

    backendProcess.stdout.on('data', (data) => {
      console.log(`Backend: ${data}`);
      if (data.includes('Application startup complete') || data.includes('Uvicorn running')) {
        setTimeout(() => resolve(), 2000); // Wait 2 seconds for full startup
      }
    });

    backendProcess.stderr.on('data', (data) => {
      console.error(`Backend Error: ${data}`);
    });

    backendProcess.on('error', (error) => {
      console.error('Failed to start backend:', error);
      reject(error);
    });

    // Timeout after 30 seconds
    setTimeout(() => resolve(), 30000);
  });
}

// Start Express server to serve frontend
function startFrontendServer() {
  return new Promise((resolve, reject) => {
    console.log('Starting frontend server...');

    const frontendPath = isDev
      ? path.join(__dirname, '..', 'frontend', 'dist')
      : getResourcePath('frontend-dist');

    const expressApp = express();

    // Serve static files
    expressApp.use(express.static(frontendPath));

    // Handle SPA routing
    expressApp.get('*', (req, res) => {
      res.sendFile(path.join(frontendPath, 'index.html'));
    });

    expressServer = expressApp.listen(FRONTEND_PORT, () => {
      console.log(`Frontend server running on port ${FRONTEND_PORT}`);
      resolve();
    });

    expressServer.on('error', (error) => {
      console.error('Failed to start frontend server:', error);
      reject(error);
    });
  });
}

// Create main window
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true
    },
    icon: path.join(__dirname, 'resources', 'icon.png'),
    title: 'cvPRD - Product Requirements Documentation',
    show: false // Don't show until ready
  });

  // Load the frontend
  mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);

  // Show window when ready
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Initialize application
async function initialize() {
  try {
    console.log('Initializing cvPRD Desktop...');

    // Check if ports are available
    const backendCheck = await findProcess('port', BACKEND_PORT);
    if (backendCheck.length > 0) {
      await dialog.showMessageBox({
        type: 'error',
        title: 'Port Conflict',
        message: `Port ${BACKEND_PORT} is already in use. Please close any applications using this port and try again.`
      });
      app.quit();
      return;
    }

    // Start services
    if (!isDev) {
      await startQdrant();
    }
    await startBackend();
    await startFrontendServer();

    // Create window
    createWindow();

    console.log('cvPRD Desktop initialized successfully!');
  } catch (error) {
    console.error('Failed to initialize application:', error);
    await dialog.showMessageBox({
      type: 'error',
      title: 'Initialization Error',
      message: `Failed to start cvPRD: ${error.message}\n\nPlease check the logs for more details.`
    });
    app.quit();
  }
}

// Cleanup on exit
function cleanup() {
  console.log('Cleaning up...');

  if (backendProcess) {
    backendProcess.kill();
  }

  if (qdrantProcess) {
    qdrantProcess.kill();
  }

  if (expressServer) {
    expressServer.close();
  }
}

// App lifecycle
app.whenReady().then(initialize);

app.on('window-all-closed', () => {
  cleanup();
  app.quit();
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

app.on('before-quit', () => {
  cleanup();
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  dialog.showErrorBox('Unexpected Error', error.message);
});

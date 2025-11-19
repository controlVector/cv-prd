# cvPRD Desktop Application

This document explains how to build and distribute cvPRD as a standalone desktop application, similar to Microsoft Word.

## Overview

The desktop version of cvPRD packages everything into a single distributable application:

- **Frontend**: React app bundled and served locally
- **Backend**: Python FastAPI server bundled as an executable
- **Databases**:
  - SQLite for document storage (portable)
  - Qdrant for vector search (embedded/portable)
  - Neo4j disabled (optional graph features removed for simplicity)

Users can download and run cvPRD without installing Python, Node.js, Docker, or any dependencies.

## Architecture

```
cvPRD Desktop App
├── Electron Shell (UI Container)
│   ├── Main Process (Node.js)
│   │   ├── Launches Python backend
│   │   ├── Starts Qdrant (if needed)
│   │   └── Serves frontend files
│   └── Renderer Process (Browser)
│       └── React Frontend
├── Bundled Backend (PyInstaller)
│   └── FastAPI + All Python deps
└── Databases
    ├── SQLite (cvprd.db in user data folder)
    └── Qdrant (embedded or portable)
```

## Prerequisites

### For Building

- **Python 3.10+** with pip
- **Node.js 18+** with npm
- **Git** (optional)

### For End Users

**Nothing!** The built application is completely standalone.

## Building the Desktop App

### Quick Build (All Platforms)

**Linux/Mac:**
```bash
./build-desktop.sh
```

**Windows:**
```cmd
build-desktop.bat
```

This creates an unpacked application in `electron/dist/` for testing.

### Creating Installers

To create distributable installer packages:

**Linux/Mac:**
```bash
./build-desktop.sh --dist
```

**Windows:**
```cmd
build-desktop.bat --dist
```

This creates platform-specific installers:
- **Windows**: `.exe` installer and portable `.exe`
- **Mac**: `.dmg` disk image and `.zip` archive
- **Linux**: `.AppImage` and `.deb` package

## Build Output

After building, you'll find:

```
electron/dist/
├── win-unpacked/          # Windows unpacked (for testing)
├── cvPRD Setup 1.0.0.exe  # Windows installer
├── cvPRD-1.0.0.AppImage   # Linux AppImage
├── cvPRD-1.0.0.deb        # Debian package
├── cvPRD-1.0.0.dmg        # macOS disk image
└── mac/cvPRD.app          # macOS app bundle
```

## Testing the Application

### Development Mode

Test without building:

```bash
cd electron
npm install
npm start
```

This runs Electron in development mode using:
- Existing backend code (not bundled)
- Docker Qdrant (port 6333)
- Frontend dist files

### Testing Built Application

After running `./build-desktop.sh`:

**Linux:**
```bash
./electron/dist/linux-unpacked/cvprd
```

**Mac:**
```bash
open electron/dist/mac/cvPRD.app
```

**Windows:**
```cmd
electron\dist\win-unpacked\cvPRD.exe
```

## Distribution

### Installing on End-User Machines

**Windows:**
1. Run `cvPRD Setup 1.0.0.exe`
2. Follow installer wizard
3. Launch from Start Menu or Desktop shortcut

**Mac:**
1. Open `cvPRD-1.0.0.dmg`
2. Drag cvPRD to Applications folder
3. Launch from Applications

**Linux (AppImage):**
```bash
chmod +x cvPRD-1.0.0.AppImage
./cvPRD-1.0.0.AppImage
```

**Linux (Debian/Ubuntu):**
```bash
sudo dpkg -i cvPRD-1.0.0.deb
cvprd
```

### File Sizes

Approximate sizes:
- **Windows installer**: ~200-300 MB
- **Mac DMG**: ~250-350 MB
- **Linux AppImage**: ~200-300 MB

Size includes:
- Electron runtime (~100 MB)
- Python runtime + dependencies (~100-150 MB)
- Sentence Transformers model (~80 MB)
- Application code (~20 MB)

## Data Storage

User data is stored in platform-specific locations:

**Windows:**
```
C:\Users\<username>\AppData\Roaming\cvprd-desktop\
```

**Mac:**
```
~/Library/Application Support/cvprd-desktop/
```

**Linux:**
```
~/.config/cvprd-desktop/
```

Contains:
- `cvprd.db` - SQLite database with PRDs
- `qdrant_data/` - Vector database storage
- `logs/` - Application logs

## Configuration

### Customizing the Build

Edit `electron/package.json` to customize:

```json
{
  "name": "cvprd-desktop",
  "version": "1.0.0",
  "build": {
    "appId": "com.yourcompany.cvprd",
    "productName": "cvPRD",
    "win": {
      "target": ["nsis", "portable"]
    }
  }
}
```

### Adding Icons

Place custom icons in `electron/resources/`:

- `icon.ico` - Windows icon (256x256)
- `icon.icns` - macOS icon bundle
- `icon.png` - Linux icon (512x512)

You can generate these from a single PNG using:
```bash
npm install -g electron-icon-builder
electron-icon-builder --input=icon.png --output=electron/resources
```

## Troubleshooting

### Port Already in Use

If port 8000 is taken:
1. Close any applications using port 8000
2. Or edit `electron/main.js` to change `BACKEND_PORT`

### Backend Fails to Start

Check logs in:
- **Windows**: `%APPDATA%\cvprd-desktop\logs\`
- **Mac**: `~/Library/Logs/cvprd-desktop/`
- **Linux**: `~/.config/cvprd-desktop/logs/`

### PyInstaller Build Fails

Common issues:
1. **Missing modules**: Add to `hiddenimports` in `backend/cvprd.spec`
2. **Large binary**: Normal for ML models (sentence-transformers)
3. **Python version**: Ensure Python 3.10-3.12

### Electron Build Fails

1. Clear cache: `rm -rf electron/dist electron/node_modules`
2. Reinstall: `cd electron && npm install`
3. Check Node.js version: `node --version` (should be 18+)

## Advanced Configuration

### Using External Qdrant

To connect to an external Qdrant server instead of embedded:

Edit `electron/main.js`:
```javascript
env: {
  ...process.env,
  QDRANT_HOST: 'your-qdrant-server.com',
  QDRANT_PORT: '6333',
  // ...
}
```

### Enabling Neo4j

To enable graph features with external Neo4j:

Edit `electron/main.js`:
```javascript
env: {
  ...process.env,
  NEO4J_ENABLED: 'true',
  NEO4J_URI: 'bolt://localhost:7687',
  NEO4J_USER: 'neo4j',
  NEO4J_PASSWORD: 'password',
  // ...
}
```

### Code Signing (macOS/Windows)

For distributing to end users, you should code sign:

**macOS:**
```bash
export CSC_LINK=/path/to/certificate.p12
export CSC_KEY_PASSWORD=cert-password
./build-desktop.sh --dist
```

**Windows:**
```cmd
set CSC_LINK=C:\path\to\certificate.pfx
set CSC_KEY_PASSWORD=cert-password
build-desktop.bat --dist
```

## Updating the Application

To add auto-update support:

1. Install electron-updater:
   ```bash
   cd electron
   npm install electron-updater
   ```

2. Set up update server (GitHub Releases, S3, etc.)

3. Add update logic to `electron/main.js`:
   ```javascript
   const { autoUpdater } = require('electron-updater')

   app.whenReady().then(() => {
     autoUpdater.checkForUpdatesAndNotify()
   })
   ```

4. Configure in `electron/package.json`:
   ```json
   {
     "build": {
       "publish": {
         "provider": "github",
         "owner": "your-username",
         "repo": "cvprd"
       }
     }
   }
   ```

## Performance Optimization

### Reducing Size

1. **Exclude unused dependencies** in `backend/requirements.txt`
2. **Use lighter embedding model** (e.g., `all-MiniLM-L12-v2` → `all-MiniLM-L6-v2`)
3. **Enable UPX compression** (already enabled in spec file)

### Improving Startup Time

1. **Lazy load** sentence-transformers model
2. **Pre-compile** Python bytecode
3. **Use SSD** for Qdrant data

## Comparison: Web vs Desktop

| Feature | Web Version | Desktop Version |
|---------|-------------|-----------------|
| Installation | Docker Compose | Single installer |
| Database | PostgreSQL + Neo4j + Qdrant | SQLite + Qdrant |
| Updates | Pull latest code | Auto-updater |
| Data Location | Docker volumes | User app data folder |
| Multi-user | ✓ (needs auth) | Single user per install |
| Graph Features | ✓ Full Neo4j | ✗ Disabled |
| Performance | Depends on server | Local machine |

## License & Distribution

This desktop application bundles:
- Electron (MIT License)
- Python + dependencies (various open-source licenses)
- Your application code (your license)

Ensure compliance with all bundled software licenses when distributing.

## Support

For issues:
1. Check `TROUBLESHOOTING.md`
2. Review logs in user data folder
3. Open issue on GitHub with:
   - OS and version
   - Error messages
   - Log files

## Next Steps

- [ ] Add application icon
- [ ] Set up code signing
- [ ] Configure auto-updates
- [ ] Create release workflow (CI/CD)
- [ ] Write end-user documentation
- [ ] Test on all platforms
- [ ] Create demo video

---

**Ready to distribute cvPRD as a desktop app!**

Build with: `./build-desktop.sh --dist`

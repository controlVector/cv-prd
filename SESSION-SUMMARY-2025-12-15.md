# CV Project Session Summary - December 15, 2025

## What We Accomplished

### CV-Git (CLI Tool)
- **Published to NPM**: `@controlvector/cv-git@0.3.5`
- **Install**: `npm install -g @controlvector/cv-git`
- **NPM Page**: https://www.npmjs.com/package/@controlvector/cv-git

Key features implemented:
- `cv commit` - Works with ANY git repo, uses stored credentials for author identity
- `cv push` - Uses stored credentials, syncs knowledge graph if CV initialized
- `cv services` - Auto-discovers cv-prd, Qdrant, FalkorDB services
- `cv prd api` - API subcommands for PRD management

### CV-PRD (Desktop App)
- **Published to GitHub Releases**: v0.1.1
- **Release URL**: https://github.com/controlVector/cv-prd/releases/tag/v0.1.1

Available packages:
| Platform | Package | Size |
|----------|---------|------|
| Windows | CV-PRD_0.1.1_x64-setup.exe | 53MB |
| Windows | CV-PRD_0.1.1_x64_en-US.msi | 54MB |
| macOS Intel | CV-PRD_0.1.1_x64.dmg | 47MB |
| macOS ARM | CV-PRD_0.1.1_aarch64.dmg | 47MB |
| Linux Deb | CV-PRD_0.1.1_amd64.deb | 64MB |
| Linux RPM | CV-PRD-0.1.1-1.x86_64.rpm | 64MB |
| Linux AppImage | CV-PRD_0.1.1_amd64.AppImage | 133MB |

### CI/CD Automation
- **cv-git**: `.github/workflows/publish.yml` - Triggers on `v*` tags, publishes to NPM
- **cv-prd**: `.github/workflows/release.yml` - Triggers on `v*` tags, builds all platforms, creates GitHub release

## Technical Fixes Made Today

1. **Binary naming mismatch** - Changed `cv-prd-backend-*` to `cvprd-backend-*` to match tauri.conf.json
2. **Rust toolchain action** - Fixed `dtolnay/rust-action` to `dtolnay/rust-toolchain`
3. **Release permissions** - Added `permissions: contents: write` for GitHub release creation
4. **NPM provenance** - Fixed repository URL case sensitivity (`controlvector` → `controlVector`)

## How to Release New Versions

### CV-Git
```bash
cd ~/project/cv-git
# Update version in packages/cli/package.json
git add -A && git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push && git push --tags
# Workflow auto-publishes to NPM
```

### CV-PRD
```bash
cd ~/project/cv-prd
# Update version in: src-tauri/Cargo.toml, src-tauri/tauri.conf.json, frontend/package.json
git add -A && git commit -m "chore: bump version to X.Y.Z"
git tag vX.Y.Z
git push && git push --tags
# Workflow builds all platforms and creates draft release
# Publish the draft at: https://github.com/controlVector/cv-prd/releases
```

## Security Reminder

The following tokens were exposed during this session and should be revoked/regenerated:
- NPM tokens (both of them)
- GitHub PAT

Revoke at:
- https://www.npmjs.com/settings/~/tokens
- https://github.com/settings/tokens

## Local Development

### Running locally
```bash
# CV-PRD backend
cd ~/project/cv-prd/backend
source venv/bin/activate
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# CV-PRD frontend
cd ~/project/cv-prd/frontend
npm run dev

# Build desktop app
cd ~/project/cv-prd
./build-desktop.sh
```

### Installed locally
- CV-PRD v0.1.1 installed via `sudo dpkg -i`
- Launch with `cv-prd` command

## Share Links

**Email blurb for colleagues:**

CV-Git: `npm install -g @controlvector/cv-git`

CV-PRD Downloads:
- Windows: https://github.com/controlVector/cv-prd/releases/download/v0.1.1/CV-PRD_0.1.1_x64-setup.exe
- Mac Intel: https://github.com/controlVector/cv-prd/releases/download/v0.1.1/CV-PRD_0.1.1_x64.dmg
- Mac ARM: https://github.com/controlVector/cv-prd/releases/download/v0.1.1/CV-PRD_0.1.1_aarch64.dmg
- Linux .deb: https://github.com/controlVector/cv-prd/releases/download/v0.1.1/CV-PRD_0.1.1_amd64.deb

#!/bin/bash
# Build script for CV-PRD desktop application
# Builds Python backend with PyInstaller, then builds Tauri app

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== CV-PRD Desktop Build ==="

# Detect platform
case "$(uname -s)" in
    Linux*)     PLATFORM=linux;;
    Darwin*)    PLATFORM=macos;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM=windows;;
    *)          PLATFORM=unknown;;
esac

echo "Platform: $PLATFORM"

# Step 1: Build frontend
echo ""
echo "=== Building Frontend ==="
cd frontend
npm install
npm run build
cd ..

# Step 2: Build Python backend with PyInstaller
echo ""
echo "=== Building Python Backend ==="

# Create virtual environment if needed
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate

# Install dependencies
pip install -r requirements.txt
pip install pyinstaller

# Create binaries directory
mkdir -p src-tauri/binaries

# Build backend executable
pyinstaller cv-prd-backend.spec --distpath src-tauri/binaries --clean -y

# Rename based on platform (Tauri expects platform suffix)
if [ "$PLATFORM" = "windows" ]; then
    BACKEND_NAME="cv-prd-backend-x86_64-pc-windows-msvc.exe"
elif [ "$PLATFORM" = "macos" ]; then
    if [ "$(uname -m)" = "arm64" ]; then
        BACKEND_NAME="cv-prd-backend-aarch64-apple-darwin"
    else
        BACKEND_NAME="cv-prd-backend-x86_64-apple-darwin"
    fi
else
    BACKEND_NAME="cv-prd-backend-x86_64-unknown-linux-gnu"
fi

if [ -f "src-tauri/binaries/cv-prd-backend" ]; then
    mv "src-tauri/binaries/cv-prd-backend" "src-tauri/binaries/$BACKEND_NAME"
fi

deactivate

# Step 3: Build Tauri application
echo ""
echo "=== Building Tauri Application ==="
export PATH="$HOME/.cargo/bin:$PATH"
cargo tauri build

echo ""
echo "=== Build Complete ==="
echo "Output files are in src-tauri/target/release/bundle/"

# List output files
if [ -d "src-tauri/target/release/bundle" ]; then
    echo ""
    echo "Generated packages:"
    find src-tauri/target/release/bundle -type f \( -name "*.deb" -o -name "*.AppImage" -o -name "*.dmg" -o -name "*.msi" -o -name "*.exe" \) 2>/dev/null
fi

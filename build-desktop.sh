#!/bin/bash

# Build script for cvPRD Desktop Application
# This script builds all components and packages them into an Electron app

set -e  # Exit on error

echo "=============================================="
echo "Building cvPRD Desktop Application"
echo "=============================================="

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Get the directory of the script
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Step 1: Build Frontend
echo -e "\n${BLUE}Step 1/4: Building React Frontend${NC}"
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi
echo "Building frontend..."
npm run build

# Copy frontend build to electron directory
echo "Copying frontend build to electron directory..."
rm -rf ../electron/frontend-dist
cp -r dist ../electron/frontend-dist
echo -e "${GREEN}✓ Frontend built successfully${NC}"

# Step 2: Build Backend
echo -e "\n${BLUE}Step 2/4: Building Python Backend${NC}"
cd ../backend

# Check if venv exists
if [ ! -d "venv" ]; then
    echo "Creating Python virtual environment..."
    python3 -m venv venv
fi

# Activate venv
source venv/bin/activate

# Install dependencies
echo "Installing backend dependencies..."
pip install -q -r requirements.txt

# Install PyInstaller if not available
if ! pip show pyinstaller >/dev/null 2>&1; then
    echo "Installing PyInstaller..."
    pip install pyinstaller
fi

# Build backend executable
echo "Building backend executable with PyInstaller..."
python build_backend.py

echo -e "${GREEN}✓ Backend built successfully${NC}"

# Step 3: Prepare Electron App
echo -e "\n${BLUE}Step 3/4: Preparing Electron App${NC}"
cd ../electron

# Install electron dependencies
if [ ! -d "node_modules" ]; then
    echo "Installing Electron dependencies..."
    npm install
fi

# Create resources directory if it doesn't exist
mkdir -p resources/databases/qdrant

# Note: In production, you would download portable Qdrant here
echo "Note: Using system Qdrant in development mode"
echo "For production, download portable Qdrant binary"

echo -e "${GREEN}✓ Electron app prepared${NC}"

# Step 4: Package Application
echo -e "\n${BLUE}Step 4/4: Packaging Desktop Application${NC}"

# Determine platform
if [[ "$OSTYPE" == "darwin"* ]]; then
    PLATFORM="mac"
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "cygwin" ]]; then
    PLATFORM="win"
else
    PLATFORM="linux"
fi

echo "Building for platform: $PLATFORM"

# Build based on flag
if [ "$1" == "--dist" ]; then
    echo "Creating distributable package..."
    npm run dist
    echo -e "${GREEN}✓ Distributable package created in electron/dist/${NC}"
elif [ "$1" == "--pack" ]; then
    echo "Creating unpacked distribution..."
    npm run pack
    echo -e "${GREEN}✓ Unpacked distribution created in electron/dist/${NC}"
else
    echo "Creating unpacked distribution for testing..."
    npm run pack
    echo -e "${GREEN}✓ Unpacked distribution created in electron/dist/${NC}"
    echo ""
    echo "To create a distributable installer, run: ./build-desktop.sh --dist"
fi

echo ""
echo "=============================================="
echo -e "${GREEN}Build Complete!${NC}"
echo "=============================================="
echo ""
echo "Output location: electron/dist/"
echo ""

if [ "$1" != "--dist" ]; then
    echo "To test the application:"
    echo "  cd electron && npm start"
    echo ""
    echo "To create installer packages:"
    echo "  ./build-desktop.sh --dist"
fi

echo ""

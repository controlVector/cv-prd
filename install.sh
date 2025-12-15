#!/bin/bash
# CV-PRD installer script
# Usage: curl -fsSL https://raw.githubusercontent.com/controlvector/cv-prd/main/install.sh | bash

set -e

REPO="controlvector/cv-prd"
VERSION="${1:-latest}"

echo "Installing CV-PRD..."

# Detect OS and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

case "$OS" in
  linux)
    case "$ARCH" in
      x86_64|amd64) 
        PKG_SUFFIX="_amd64.deb"
        INSTALL_CMD="sudo dpkg -i"
        ;;
      aarch64|arm64)
        PKG_SUFFIX="_arm64.deb"
        INSTALL_CMD="sudo dpkg -i"
        ;;
      *)
        echo "Unsupported architecture: $ARCH"
        exit 1
        ;;
    esac
    ;;
  darwin)
    PKG_SUFFIX=".dmg"
    echo "macOS detected. Please download the .dmg from GitHub releases."
    echo "https://github.com/$REPO/releases/latest"
    exit 0
    ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

# Get download URL
if [ "$VERSION" = "latest" ]; then
  DOWNLOAD_URL=$(curl -s "https://api.github.com/repos/$REPO/releases/latest" | \
    grep "browser_download_url.*$PKG_SUFFIX" | \
    cut -d '"' -f 4 | head -1)
else
  DOWNLOAD_URL="https://github.com/$REPO/releases/download/$VERSION/CV-PRD_${VERSION#v}$PKG_SUFFIX"
fi

if [ -z "$DOWNLOAD_URL" ]; then
  echo "Could not find download URL. Please install manually from:"
  echo "https://github.com/$REPO/releases"
  exit 1
fi

# Download and install
TMPFILE=$(mktemp)
echo "Downloading from $DOWNLOAD_URL..."
curl -fSL "$DOWNLOAD_URL" -o "$TMPFILE"

echo "Installing..."
$INSTALL_CMD "$TMPFILE"

rm -f "$TMPFILE"

echo ""
echo "CV-PRD installed successfully!"
echo "Run 'cv-prd' to start the application."

#!/bin/bash
# CV-PRD Installer for Ubuntu/Debian
# Usage: curl -fsSL https://raw.githubusercontent.com/controlVector/cv-prd/main/install.sh | bash

set -e

VERSION="0.1.0"
INSTALL_DIR="/opt/cv-prd"
SERVICE_NAME="cv-prd"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}"
echo "╔═══════════════════════════════════════╗"
echo "║        CV-PRD Installer v${VERSION}         ║"
echo "║  AI-Powered PRD Documentation         ║"
echo "╚═══════════════════════════════════════╝"
echo -e "${NC}"

# Must run as root for system service
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Please run with sudo: sudo bash install.sh${NC}"
    exit 1
fi

# Get the actual user (not root)
ACTUAL_USER=${SUDO_USER:-$USER}
ACTUAL_HOME=$(getent passwd "$ACTUAL_USER" | cut -d: -f6)

# Check for Docker
check_docker() {
    if command -v docker &> /dev/null && command -v docker compose &> /dev/null; then
        echo -e "${GREEN}✓ Docker and Docker Compose found${NC}"
        return 0
    fi
    return 1
}

# Install Docker
install_docker() {
    echo -e "${YELLOW}Installing Docker...${NC}"

    apt-get update
    apt-get install -y ca-certificates curl gnupg
    install -m 0755 -d /etc/apt/keyrings
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
    chmod a+r /etc/apt/keyrings/docker.gpg

    echo \
      "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
      $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
      tee /etc/apt/sources.list.d/docker.list > /dev/null

    apt-get update
    apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin

    usermod -aG docker "$ACTUAL_USER"
    echo -e "${GREEN}✓ Docker installed${NC}"
}

# Check for Python 3.10+
check_python() {
    if command -v python3 &> /dev/null; then
        PY_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
        PY_MAJOR=$(echo $PY_VERSION | cut -d. -f1)
        PY_MINOR=$(echo $PY_VERSION | cut -d. -f2)
        if [ "$PY_MAJOR" -ge 3 ] && [ "$PY_MINOR" -ge 10 ]; then
            echo -e "${GREEN}✓ Python $PY_VERSION found${NC}"
            return 0
        fi
    fi
    return 1
}

# Install Python
install_python() {
    echo -e "${YELLOW}Installing Python 3.11...${NC}"
    apt-get update
    apt-get install -y python3.11 python3.11-venv python3-pip
    update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.11 1
}

# Check for Node.js (for frontend)
check_nodejs() {
    if command -v node &> /dev/null; then
        echo -e "${GREEN}✓ Node.js $(node -v) found${NC}"
        return 0
    fi
    return 1
}

# Install Node.js
install_nodejs() {
    echo -e "${YELLOW}Installing Node.js 20.x...${NC}"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
}

# Main installation
main() {
    echo "Checking dependencies..."
    echo

    # Check/install Docker
    if ! check_docker; then
        read -p "Docker not found. Install it? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            install_docker
        else
            echo -e "${RED}Docker is required for cv-prd. Exiting.${NC}"
            exit 1
        fi
    fi

    # Check/install Python
    if ! check_python; then
        read -p "Python 3.10+ not found. Install it? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            install_python
        else
            echo -e "${RED}Python 3.10+ is required. Exiting.${NC}"
            exit 1
        fi
    fi

    # Check/install Node.js
    if ! check_nodejs; then
        read -p "Node.js not found. Install it? [Y/n] " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]] || [[ -z $REPLY ]]; then
            install_nodejs
        else
            echo -e "${YELLOW}Warning: Node.js is needed to build the frontend${NC}"
        fi
    fi

    echo
    echo "Installing cv-prd..."

    # Create install directory
    mkdir -p "$INSTALL_DIR"

    # Clone or copy repository
    if [ -f "backend/requirements.txt" ]; then
        # Local install
        echo "Installing from local directory..."
        cp -r . "$INSTALL_DIR/"
    else
        # Clone from GitHub
        echo "Cloning cv-prd repository..."
        git clone --depth 1 https://github.com/controlVector/cv-prd.git "$INSTALL_DIR"
    fi

    cd "$INSTALL_DIR"

    # Create Python virtual environment
    echo "Setting up Python virtual environment..."
    python3 -m venv backend/venv
    source backend/venv/bin/activate
    pip install --upgrade pip
    pip install -r backend/requirements.txt
    deactivate

    # Build frontend
    if command -v npm &> /dev/null; then
        echo "Building frontend..."
        cd frontend
        npm install
        npm run build
        cd ..
    fi

    # Create environment file
    if [ ! -f "backend/.env" ]; then
        cp backend/.env.example backend/.env 2>/dev/null || cat > backend/.env << 'ENV'
# cv-prd Configuration
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/cvprd
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
FALKORDB_URL=redis://localhost:6380

# Embedding model (runs locally)
EMBEDDING_MODEL=all-MiniLM-L6-v2
ENV
    fi

    # Create Docker Compose file for databases
    cat > docker-compose.yml << 'COMPOSE'
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: cvprd-postgres
    environment:
      POSTGRES_DB: cvprd
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - cvprd-postgres:/var/lib/postgresql/data
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    container_name: cvprd-redis
    ports:
      - "6379:6379"
    volumes:
      - cvprd-redis:/data
    restart: unless-stopped

  falkordb:
    image: falkordb/falkordb:latest
    container_name: cvprd-falkordb
    ports:
      - "6380:6379"
    volumes:
      - cvprd-falkordb:/data
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:latest
    container_name: cvprd-qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - cvprd-qdrant:/qdrant/storage
    restart: unless-stopped

volumes:
  cvprd-postgres:
  cvprd-redis:
  cvprd-falkordb:
  cvprd-qdrant:
COMPOSE

    # Create systemd service
    cat > /etc/systemd/system/cv-prd.service << SERVICE
[Unit]
Description=CV-PRD AI-Powered PRD Documentation
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=$ACTUAL_USER
WorkingDirectory=$INSTALL_DIR
Environment=PATH=$INSTALL_DIR/backend/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStartPre=/usr/bin/docker compose up -d
ExecStart=$INSTALL_DIR/backend/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
ExecStop=/usr/bin/docker compose down
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
SERVICE

    # Set permissions
    chown -R "$ACTUAL_USER:$ACTUAL_USER" "$INSTALL_DIR"

    # Enable and start service
    systemctl daemon-reload
    systemctl enable cv-prd

    # Create CLI command
    cat > /usr/local/bin/cvprd << 'CLI'
#!/bin/bash

case "$1" in
    start)
        sudo systemctl start cv-prd
        echo "cv-prd started. Access at http://localhost:8000"
        ;;
    stop)
        sudo systemctl stop cv-prd
        echo "cv-prd stopped"
        ;;
    restart)
        sudo systemctl restart cv-prd
        echo "cv-prd restarted"
        ;;
    status)
        systemctl status cv-prd
        ;;
    logs)
        journalctl -u cv-prd -f
        ;;
    open)
        xdg-open http://localhost:8000 2>/dev/null || echo "Open http://localhost:8000 in your browser"
        ;;
    *)
        echo "CV-PRD - AI-Powered PRD Documentation"
        echo ""
        echo "Usage: cvprd <command>"
        echo ""
        echo "Commands:"
        echo "  start    Start cv-prd service"
        echo "  stop     Stop cv-prd service"
        echo "  restart  Restart cv-prd service"
        echo "  status   Show service status"
        echo "  logs     Show service logs"
        echo "  open     Open cv-prd in browser"
        ;;
esac
CLI
    chmod +x /usr/local/bin/cvprd

    echo
    echo -e "${GREEN}╔═══════════════════════════════════════╗${NC}"
    echo -e "${GREEN}║     CV-PRD installed successfully!    ║${NC}"
    echo -e "${GREEN}╚═══════════════════════════════════════╝${NC}"
    echo
    echo "Next steps:"
    echo "  1. Start the service:     cvprd start"
    echo "  2. Check status:          cvprd status"
    echo "  3. Open in browser:       cvprd open"
    echo "  4. View logs:             cvprd logs"
    echo
    echo "The service will start automatically on boot."
    echo "Access the application at: http://localhost:8000"
    echo
}

# Uninstall
if [ "$1" = "uninstall" ]; then
    echo "Uninstalling cv-prd..."
    systemctl stop cv-prd 2>/dev/null || true
    systemctl disable cv-prd 2>/dev/null || true
    rm -f /etc/systemd/system/cv-prd.service
    rm -f /usr/local/bin/cvprd
    rm -rf "$INSTALL_DIR"
    systemctl daemon-reload
    echo -e "${GREEN}CV-PRD uninstalled successfully${NC}"
    echo -e "${YELLOW}Note: Docker volumes (databases) were not removed.${NC}"
    echo "To remove data: docker volume rm cvprd-postgres cvprd-redis cvprd-falkordb cvprd-qdrant"
    exit 0
fi

main

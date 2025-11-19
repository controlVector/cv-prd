#!/bin/bash

# cvPRD Setup Script
# This script sets up the development environment for cvPRD

set -e

echo "=================================="
echo "  cvPRD Setup Script"
echo "=================================="
echo ""

# Check prerequisites
echo "Checking prerequisites..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.10 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✓ Python $PYTHON_VERSION found"

# Check Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker."
    exit 1
fi
echo "✓ Docker found"

# Check Docker Compose and determine which command to use
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
    echo "✓ Docker Compose V1 found"
elif docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
    echo "✓ Docker Compose V2 found"
else
    echo "❌ Docker Compose is not installed. Please install Docker Compose."
    exit 1
fi

echo ""
echo "Step 1: Starting Docker containers..."
echo "This will start PostgreSQL, Neo4j, Qdrant, and Redis"

cd infrastructure/docker
$DOCKER_COMPOSE up -d

echo "Waiting for services to be healthy (30 seconds)..."
sleep 30

echo ""
echo "Step 2: Setting up Python environment..."

cd ../../backend

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
else
    echo "Virtual environment already exists"
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing Python dependencies..."
pip install --upgrade pip -q
pip install -r requirements.txt -q

echo ""
echo "Step 3: Creating __init__.py files..."
cd ..
touch backend/app/__init__.py
touch backend/app/core/__init__.py
touch backend/app/models/__init__.py
touch backend/app/services/__init__.py

echo ""
echo "=================================="
echo "  Setup Complete! ✓"
echo "=================================="
echo ""
echo "To run the demo:"
echo "  1. cd backend && source venv/bin/activate"
echo "  2. cd .. && python demo/demo.py"
echo ""
echo "Or simply run:"
echo "  ./run-demo.sh"
echo ""
echo "To explore the databases:"
echo "  - Neo4j Browser: http://localhost:7474 (user: neo4j, pass: cvprd_dev)"
echo "  - Qdrant Dashboard: http://localhost:6333/dashboard"
echo ""
echo "To stop the databases:"
echo "  cd infrastructure/docker && $DOCKER_COMPOSE stop"
echo ""

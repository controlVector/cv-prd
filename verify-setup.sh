#!/bin/bash

# Script to verify that all services are running correctly

echo "=================================="
echo "  cvPRD Setup Verification"
echo "=================================="
echo ""

# Detect docker-compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Docker Compose is not installed"
    exit 1
fi

# Check if Docker containers are running
echo "Checking Docker containers..."
cd infrastructure/docker

POSTGRES_STATUS=$($DOCKER_COMPOSE ps -q postgres 2>/dev/null)
NEO4J_STATUS=$($DOCKER_COMPOSE ps -q neo4j 2>/dev/null)
QDRANT_STATUS=$($DOCKER_COMPOSE ps -q qdrant 2>/dev/null)
REDIS_STATUS=$($DOCKER_COMPOSE ps -q redis 2>/dev/null)

if [ -z "$POSTGRES_STATUS" ]; then
    echo "❌ PostgreSQL is not running"
    POSTGRES_OK=false
else
    echo "✓ PostgreSQL is running"
    POSTGRES_OK=true
fi

if [ -z "$NEO4J_STATUS" ]; then
    echo "❌ Neo4j is not running"
    NEO4J_OK=false
else
    echo "✓ Neo4j is running"
    NEO4J_OK=true
fi

if [ -z "$QDRANT_STATUS" ]; then
    echo "❌ Qdrant is not running"
    QDRANT_OK=false
else
    echo "✓ Qdrant is running"
    QDRANT_OK=true
fi

if [ -z "$REDIS_STATUS" ]; then
    echo "❌ Redis is not running"
    REDIS_OK=false
else
    echo "✓ Redis is running"
    REDIS_OK=true
fi

cd ../..

echo ""
echo "Checking service endpoints..."

# Check PostgreSQL
if nc -z localhost 5432 2>/dev/null; then
    echo "✓ PostgreSQL port 5432 is accessible"
else
    echo "❌ PostgreSQL port 5432 is not accessible"
fi

# Check Neo4j HTTP
if nc -z localhost 7474 2>/dev/null; then
    echo "✓ Neo4j HTTP port 7474 is accessible"
else
    echo "❌ Neo4j HTTP port 7474 is not accessible"
fi

# Check Neo4j Bolt
if nc -z localhost 7687 2>/dev/null; then
    echo "✓ Neo4j Bolt port 7687 is accessible"
else
    echo "❌ Neo4j Bolt port 7687 is not accessible"
fi

# Check Qdrant
if nc -z localhost 6333 2>/dev/null; then
    echo "✓ Qdrant port 6333 is accessible"
else
    echo "❌ Qdrant port 6333 is not accessible"
fi

# Check Redis
if nc -z localhost 6379 2>/dev/null; then
    echo "✓ Redis port 6379 is accessible"
else
    echo "❌ Redis port 6379 is not accessible"
fi

echo ""
echo "Checking Python environment..."

if [ -d "backend/venv" ]; then
    echo "✓ Virtual environment exists"

    # Check if key packages are installed
    source backend/venv/bin/activate

    if python -c "import fastapi" 2>/dev/null; then
        echo "✓ FastAPI is installed"
    else
        echo "❌ FastAPI is not installed"
    fi

    if python -c "import qdrant_client" 2>/dev/null; then
        echo "✓ Qdrant client is installed"
    else
        echo "❌ Qdrant client is not installed"
    fi

    if python -c "import neo4j" 2>/dev/null; then
        echo "✓ Neo4j driver is installed"
    else
        echo "❌ Neo4j driver is not installed"
    fi

    if python -c "import sentence_transformers" 2>/dev/null; then
        echo "✓ Sentence transformers is installed"
    else
        echo "❌ Sentence transformers is not installed"
    fi

    deactivate
else
    echo "❌ Virtual environment does not exist"
    echo "   Run ./setup.sh to create it"
fi

echo ""
echo "=================================="
echo "  Verification Complete"
echo "=================================="
echo ""

if [ "$POSTGRES_OK" = true ] && [ "$NEO4J_OK" = true ] && [ "$QDRANT_OK" = true ] && [ -d "backend/venv" ]; then
    echo "✓ All systems are ready!"
    echo ""
    echo "You can now run the demo:"
    echo "  ./run-demo.sh"
    echo ""
    echo "Or explore the databases:"
    echo "  Neo4j Browser: http://localhost:7474"
    echo "  Qdrant Dashboard: http://localhost:6333/dashboard"
else
    echo "❌ Some issues detected. Please fix them before running the demo."
    echo ""
    echo "To start the databases:"
    echo "  cd infrastructure/docker && $DOCKER_COMPOSE up -d"
    echo ""
    echo "To set up Python environment:"
    echo "  ./setup.sh"
fi

echo ""

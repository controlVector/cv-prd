#!/bin/bash

echo "Checking if required ports are available..."
echo ""

check_port() {
    PORT=$1
    SERVICE=$2

    if lsof -Pi :$PORT -sTCP:LISTEN -t >/dev/null 2>&1 ; then
        echo "❌ Port $PORT ($SERVICE) is in use"
        echo "   Process: $(lsof -Pi :$PORT -sTCP:LISTEN | tail -n 1)"
        return 1
    else
        echo "✓ Port $PORT ($SERVICE) is available"
        return 0
    fi
}

ALL_CLEAR=true

check_port 5433 "PostgreSQL" || ALL_CLEAR=false
check_port 7474 "Neo4j HTTP" || ALL_CLEAR=false
check_port 7687 "Neo4j Bolt" || ALL_CLEAR=false
check_port 6333 "Qdrant" || ALL_CLEAR=false
check_port 6380 "Redis" || ALL_CLEAR=false

echo ""

if [ "$ALL_CLEAR" = true ]; then
    echo "✓ All ports are available! You can start the services."
    echo ""
    echo "Run: cd infrastructure/docker && docker compose up -d"
else
    echo "❌ Some ports are in use. You can either:"
    echo "   1. Stop the services using those ports"
    echo "   2. Use different port numbers in docker-compose.yml"
fi

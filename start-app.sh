#!/bin/bash

echo "=================================="
echo "  Starting cvPRD Application"
echo "=================================="
echo ""

# Check if Docker containers are running
echo "Checking Docker containers..."
cd infrastructure/docker

# Detect docker-compose command
if command -v docker-compose &> /dev/null; then
    DOCKER_COMPOSE="docker-compose"
elif docker compose version &> /dev/null 2>&1; then
    DOCKER_COMPOSE="docker compose"
else
    echo "❌ Docker Compose not found"
    exit 1
fi

# Check if containers are running
if ! $DOCKER_COMPOSE ps | grep -q "Up"; then
    echo "Starting Docker containers..."
    $DOCKER_COMPOSE up -d
    echo "Waiting for services to be healthy..."
    sleep 10
else
    echo "✓ Docker containers are running"
fi

cd ../..

echo ""
echo "Starting Backend API on http://localhost:8000"
echo "Starting Frontend on http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "Shutting down..."
    kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup INT TERM

# Start backend in background
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 > ../backend.log 2>&1 &
BACKEND_PID=$!
cd ..

# Give backend time to start
sleep 3

# Start frontend in background
cd frontend
npm run dev > ../frontend.log 2>&1 &
FRONTEND_PID=$!
cd ..

echo "✓ Backend started (PID: $BACKEND_PID) - logs in backend.log"
echo "✓ Frontend started (PID: $FRONTEND_PID) - logs in frontend.log"
echo ""
echo "Application is ready!"
echo "  - Frontend: http://localhost:3000"
echo "  - Backend API: http://localhost:8000"
echo "  - API Docs: http://localhost:8000/docs"
echo "  - Neo4j Browser: http://localhost:7474"
echo "  - Qdrant Dashboard: http://localhost:6333/dashboard"
echo ""

# Wait for processes
wait $BACKEND_PID $FRONTEND_PID

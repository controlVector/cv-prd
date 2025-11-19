#!/bin/bash

echo "Starting cvPRD application..."
echo "=============================="
echo ""

# Start infrastructure
echo "1. Starting infrastructure services (Docker)..."
cd /home/jwscho/cvPRD/infrastructure/docker
docker-compose up -d

echo "   Waiting for services to be ready..."
sleep 5

# Check if backend is already running
if lsof -Pi :8000 -sTCP:LISTEN -t >/dev/null ; then
    echo "2. Backend already running on port 8000"
else
    echo "2. Starting backend..."
    cd /home/jwscho/cvPRD/backend
    uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
    BACKEND_PID=$!
    echo "   Backend started (PID: $BACKEND_PID)"
fi

echo "   Waiting for backend to be ready..."
sleep 3

# Check if frontend is already running
if lsof -Pi :5173 -sTCP:LISTEN -t >/dev/null ; then
    echo "3. Frontend already running on port 5173"
else
    echo "3. Starting frontend..."
    cd /home/jwscho/cvPRD/frontend
    npm run dev &
    FRONTEND_PID=$!
    echo "   Frontend started (PID: $FRONTEND_PID)"
fi

echo ""
echo "=============================="
echo "✓ All services started!"
echo "=============================="
echo ""
echo "Access points:"
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo "  Neo4j:     http://localhost:7474"
echo ""
echo "To stop services:"
echo "  Press Ctrl+C in terminals where services are running"
echo "  Or run: docker-compose down (in infrastructure/docker)"
echo ""

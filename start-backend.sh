#!/bin/bash

echo "Starting cvPRD Backend API..."

# Activate virtual environment
cd backend
source venv/bin/activate

# Start FastAPI server
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

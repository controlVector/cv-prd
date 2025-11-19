#!/bin/bash

# Simple script to run the demo

set -e

echo "Starting cvPRD demo..."
echo ""

# Check if venv exists
if [ ! -d "backend/venv" ]; then
    echo "Virtual environment not found. Please run ./setup.sh first"
    exit 1
fi

# Activate venv and run demo
cd backend
source venv/bin/activate
cd ..
python demo/demo.py

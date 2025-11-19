#!/bin/bash

echo "Starting cvPRD Frontend..."

# Install dependencies if needed
cd frontend
if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

# Start development server
npm run dev

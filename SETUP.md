# Setup Guide - Get cvPRD Running in 5 Minutes

This guide gets you up and running with cvPRD on a fresh machine.

## What You Need

- **Python 3.10, 3.11, or 3.12** - [Download here](https://www.python.org/downloads/)
- **Node.js 18 or newer** - [Download here](https://nodejs.org/)
- **Docker Desktop** - [Download here](https://www.docker.com/products/docker-desktop/)

## Step-by-Step Setup

### 1. Get the Code

```bash
git clone <your-repo-url>
cd cvPRD
```

### 2. Start the Databases

Make sure Docker Desktop is running, then:

```bash
cd infrastructure/docker
docker compose up -d
```

Wait about 30 seconds for everything to start. You can check with:
```bash
docker compose ps
```

You should see 3 services running (postgres, neo4j, qdrant).

### 3. Setup Python Backend

```bash
cd ../../backend

# Create virtual environment
python -m venv venv

# Activate it
source venv/bin/activate       # Mac/Linux
# OR
venv\Scripts\activate          # Windows

# Install dependencies (takes 2-3 minutes)
pip install -r requirements.txt
```

### 4. Setup React Frontend

```bash
cd ../frontend

# Install dependencies (takes 1-2 minutes)
npm install
```

### 5. Run the Application

From the project root directory:

```bash
./start-app.sh     # Mac/Linux/WSL
```

**On Windows (PowerShell):**
```powershell
# Start backend
cd backend
venv\Scripts\activate
Start-Process -NoNewWindow uvicorn app.main:app --reload --port 8000

# Start frontend (new terminal)
cd frontend
npm run dev
```

### 6. Open the App

Open your browser to:
- **Frontend**: http://localhost:3000
- **API Docs**: http://localhost:8000/docs

## Verify It's Working

1. Go to http://localhost:3000
2. Click "Create PRD"
3. Fill in:
   - Name: "Test PRD"
   - Section Title: "Test Feature"
   - Content: "The system shall do something cool"
4. Click "Create PRD"
5. Go to "Search" tab
6. Search for "cool"
7. You should see your requirement!

## Common Issues

### Port Already in Use

If you see "Address already in use" errors:

```bash
# Check what's using the ports
./check-ports.sh

# Kill processes or change ports in the config
```

### Python Virtual Environment Issues

**"venv: command not found"**
```bash
# Install python3-venv
sudo apt install python3-venv  # Ubuntu/Debian
```

**"pip: command not found"**
```bash
# Make sure pip is installed
python -m ensurepip --upgrade
```

### Docker Not Running

Make sure Docker Desktop is:
1. Installed
2. Running (check system tray/menu bar)
3. Not showing any errors

### npm install Fails

```bash
# Clear npm cache
npm cache clean --force

# Try again
npm install
```

### Still Stuck?

1. Check the logs:
   - Backend: `backend.log`
   - Frontend: `frontend.log`

2. Restart everything:
   ```bash
   # Stop services
   cd infrastructure/docker
   docker compose down

   # Start fresh
   docker compose up -d
   cd ../..
   ./start-app.sh
   ```

3. Ask for help with:
   - Your OS and version
   - Error messages from logs
   - Output of `python --version` and `node --version`

## Next Steps

Once running:
- Read [USER_GUIDE.md](./USER_GUIDE.md) to learn how to use cvPRD
- Check [API_SPEC.md](./API_SPEC.md) to understand the API
- See [ARCHITECTURE.md](./ARCHITECTURE.md) for system design

## Stopping the Application

Press `Ctrl+C` in the terminal where `start-app.sh` is running.

To stop the databases:
```bash
cd infrastructure/docker
docker compose stop
```

To remove everything (including data):
```bash
docker compose down -v
```

---

**Need help?** Open an issue on GitLab with your error messages and setup details.

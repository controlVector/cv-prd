@echo off
REM Build script for cvPRD Desktop Application (Windows)

echo ==============================================
echo Building cvPRD Desktop Application
echo ==============================================

cd /d %~dp0

REM Step 1: Build Frontend
echo.
echo Step 1/4: Building React Frontend
cd frontend

if not exist "node_modules\" (
    echo Installing frontend dependencies...
    call npm install
)

echo Building frontend...
call npm run build

echo Copying frontend build to electron directory...
if exist "..\electron\frontend-dist" rmdir /s /q "..\electron\frontend-dist"
xcopy /E /I /Y dist "..\electron\frontend-dist"
echo [OK] Frontend built successfully

REM Step 2: Build Backend
echo.
echo Step 2/4: Building Python Backend
cd ..\backend

REM Check if venv exists
if not exist "venv\" (
    echo Creating Python virtual environment...
    python -m venv venv
)

REM Activate venv
call venv\Scripts\activate.bat

REM Install dependencies
echo Installing backend dependencies...
pip install -q -r requirements.txt

REM Install PyInstaller
pip show pyinstaller >nul 2>&1
if errorlevel 1 (
    echo Installing PyInstaller...
    pip install pyinstaller
)

REM Build backend
echo Building backend executable...
python build_backend.py

echo [OK] Backend built successfully

REM Step 3: Prepare Electron
echo.
echo Step 3/4: Preparing Electron App
cd ..\electron

if not exist "node_modules\" (
    echo Installing Electron dependencies...
    call npm install
)

if not exist "resources\databases\qdrant" mkdir resources\databases\qdrant

echo [OK] Electron app prepared

REM Step 4: Package
echo.
echo Step 4/4: Packaging Desktop Application

if "%1"=="--dist" (
    echo Creating distributable package...
    call npm run dist
    echo [OK] Distributable created in electron\dist\
) else if "%1"=="--pack" (
    echo Creating unpacked distribution...
    call npm run pack
    echo [OK] Unpacked distribution in electron\dist\
) else (
    echo Creating unpacked distribution for testing...
    call npm run pack
    echo [OK] Unpacked distribution in electron\dist\
    echo.
    echo To create installer: build-desktop.bat --dist
)

echo.
echo ==============================================
echo Build Complete!
echo ==============================================
echo.
echo Output: electron\dist\
echo.

if not "%1"=="--dist" (
    echo To test: cd electron ^&^& npm start
    echo To create installer: build-desktop.bat --dist
)

pause

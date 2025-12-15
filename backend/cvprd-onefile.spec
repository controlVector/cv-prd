# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for cvPRD backend - Single file version
No local ML models - uses OpenRouter API for embeddings
"""

import sys
import os
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Collect all app submodules
hiddenimports = collect_submodules('app')

# Add uvicorn and FastAPI dependencies
hiddenimports += [
    'uvicorn.logging',
    'uvicorn.loops',
    'uvicorn.loops.auto',
    'uvicorn.protocols',
    'uvicorn.protocols.http',
    'uvicorn.protocols.http.auto',
    'uvicorn.protocols.websockets',
    'uvicorn.protocols.websockets.auto',
    'uvicorn.lifespan',
    'uvicorn.lifespan.on',
    'sqlalchemy.ext.declarative',
    'sqlalchemy.sql.default_comparator',
    'qdrant_client',
    'passlib.handlers.bcrypt',
    'httptools',
    'uvloop',
    'pydantic',
    'pydantic_settings',
    'fastapi',
    'starlette',
    'anyio',
    'sniffio',
    'httpx',
    'redis',
    'markdown',
    'pypdf',
]

# No heavy excludes needed without torch
excludes = [
    'matplotlib',
    'scipy',
    'pandas',
    'numpy.testing',
]

a = Analysis(
    ['run_server.py'],
    pathex=[],
    binaries=[],
    datas=[],
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=excludes,
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

# Single-file executable
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name='cvprd-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

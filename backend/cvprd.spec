# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for cvPRD backend
This bundles the FastAPI backend into a standalone executable
"""

import sys
from PyInstaller.utils.hooks import collect_data_files, collect_submodules

block_cipher = None

# Platform-specific settings
is_windows = sys.platform == 'win32'

# Collect all submodules
hiddenimports = [
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
    'sentence_transformers',
    'torch',
    'transformers',
    'qdrant_client',
    'passlib.handlers.bcrypt',
]

# uvloop is only available on Unix systems (Linux/macOS)
if not is_windows:
    hiddenimports.append('uvloop')

# Collect data files for sentence-transformers models
datas = []
datas += collect_data_files('sentence_transformers')
datas += collect_data_files('torch')
datas += collect_data_files('transformers')

a = Analysis(
    ['run_server.py'],
    pathex=[],
    binaries=[],
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'scipy', 'pandas', 'numpy.testing'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='cvprd-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=['python*.dll', 'vcruntime*.dll', 'api-ms-*.dll', 'ucrtbase.dll'] if is_windows else [],
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=['python*.dll', 'vcruntime*.dll', 'api-ms-*.dll', 'ucrtbase.dll'] if is_windows else [],
    name='cvprd-backend',
)

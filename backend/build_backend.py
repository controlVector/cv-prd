#!/usr/bin/env python3
"""
Build script for bundling the cvPRD backend using PyInstaller
"""

import os
import sys
import shutil
import subprocess
from pathlib import Path

def main():
    """Build the backend executable"""

    print("=" * 60)
    print("Building cvPRD Backend for Desktop Distribution")
    print("=" * 60)

    # Get paths
    backend_dir = Path(__file__).parent
    project_root = backend_dir.parent
    electron_dir = project_root / "electron"
    output_dir = electron_dir / "backend-dist"

    # Clean previous build
    if output_dir.exists():
        print(f"\nCleaning previous build at {output_dir}")
        shutil.rmtree(output_dir)

    # Install PyInstaller if not available
    try:
        import PyInstaller
        print("\nPyInstaller found")
    except ImportError:
        print("\nInstalling PyInstaller...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "pyinstaller"])

    # Run PyInstaller
    print("\nRunning PyInstaller...")
    os.chdir(backend_dir)

    spec_file = backend_dir / "cvprd.spec"
    cmd = [
        sys.executable,
        "-m", "PyInstaller",
        str(spec_file),
        "--clean",
        "--noconfirm"
    ]

    try:
        subprocess.check_call(cmd)
        print("\n✓ Backend built successfully!")
    except subprocess.CalledProcessError as e:
        print(f"\n✗ Build failed: {e}")
        return 1

    # Move to electron directory
    dist_dir = backend_dir / "dist" / "cvprd-backend"
    if dist_dir.exists():
        print(f"\nMoving build output to {output_dir}")
        output_dir.parent.mkdir(parents=True, exist_ok=True)
        shutil.move(str(dist_dir), str(output_dir))
        print("✓ Build output moved")

    # Clean up temporary files
    print("\nCleaning up temporary files...")
    for temp_dir in [backend_dir / "build", backend_dir / "dist"]:
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

    print("\n" + "=" * 60)
    print("Backend build complete!")
    print(f"Output: {output_dir}")
    print("=" * 60)

    return 0

if __name__ == "__main__":
    sys.exit(main())

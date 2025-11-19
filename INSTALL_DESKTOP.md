# cvPRD Desktop - Installation Guide for Users

Welcome to cvPRD Desktop! This guide will help you install and start using cvPRD on your computer.

## What is cvPRD?

cvPRD is an AI-powered Product Requirements Documentation tool that helps you:
- Create and organize product requirements
- Search requirements using natural language
- Track dependencies and relationships
- Generate documentation automatically

## System Requirements

- **Windows**: Windows 10 or later (64-bit)
- **Mac**: macOS 10.13 (High Sierra) or later
- **Linux**: Ubuntu 18.04+, Fedora 32+, or equivalent
- **RAM**: 4 GB minimum, 8 GB recommended
- **Disk Space**: 500 MB for application + storage for your PRDs
- **Internet**: Not required after installation (fully offline capable)

## Installation

### Windows

1. **Download** the installer: `cvPRD-Setup-1.0.0.exe`

2. **Run the installer**
   - Double-click the downloaded file
   - If Windows SmartScreen appears, click "More info" → "Run anyway"
   - Follow the installation wizard
   - Choose installation location (default: `C:\Program Files\cvPRD`)

3. **Launch cvPRD**
   - Find cvPRD in your Start Menu
   - Or use the Desktop shortcut

### macOS

1. **Download** the disk image: `cvPRD-1.0.0.dmg`

2. **Install the app**
   - Open the downloaded `.dmg` file
   - Drag the cvPRD icon to your Applications folder
   - Eject the disk image

3. **Launch cvPRD**
   - Open Finder → Applications
   - Double-click cvPRD
   - If macOS blocks the app, go to System Preferences → Security & Privacy → Click "Open Anyway"

### Linux

**Option 1: AppImage (Universal)**

1. **Download**: `cvPRD-1.0.0.AppImage`
2. **Make executable**:
   ```bash
   chmod +x cvPRD-1.0.0.AppImage
   ```
3. **Run**:
   ```bash
   ./cvPRD-1.0.0.AppImage
   ```

**Option 2: Debian/Ubuntu (.deb)**

1. **Download**: `cvPRD-1.0.0.deb`
2. **Install**:
   ```bash
   sudo dpkg -i cvPRD-1.0.0.deb
   ```
3. **Run**:
   ```bash
   cvprd
   ```
   Or find it in your applications menu.

## First Launch

When you first start cvPRD:

1. **Initial Setup** (automatic)
   - The app will create a local database
   - Download AI models (one-time, ~80 MB)
   - This takes 30-60 seconds

2. **Welcome Screen**
   - You'll see the cvPRD interface
   - Create your first PRD to get started!

## Getting Started

### Creating Your First PRD

1. Click **"Create PRD"** button
2. Fill in:
   - **Name**: e.g., "User Authentication System"
   - **Description**: Brief overview
3. Add sections:
   - **Title**: e.g., "Login Feature"
   - **Content**: Requirements description
   - **Priority**: Critical/High/Medium/Low
   - **Tags**: Keywords for organization
4. Click **"Create"**

### Searching Requirements

1. Go to the **"Search"** tab
2. Type natural language queries:
   - "How do we handle security?"
   - "What are payment requirements?"
3. View results with relevance scores

### Organizing PRDs

- **View all PRDs**: Click "My PRDs" in the sidebar
- **Edit PRD**: Click on any PRD to edit
- **Delete PRD**: Use the delete button (with confirmation)

## Data Storage

Your PRDs are stored locally on your computer at:

- **Windows**: `C:\Users\<YourName>\AppData\Roaming\cvprd-desktop\`
- **Mac**: `~/Library/Application Support/cvprd-desktop/`
- **Linux**: `~/.config/cvprd-desktop/`

### Backing Up Your Data

**Important**: Always back up your PRDs!

1. Close cvPRD
2. Copy the data folder above to a safe location
3. To restore, copy the folder back

## Uninstalling

### Windows

1. Go to Settings → Apps → Apps & Features
2. Find cvPRD in the list
3. Click Uninstall

**To remove data**:
Delete `C:\Users\<YourName>\AppData\Roaming\cvprd-desktop\`

### macOS

1. Open Finder → Applications
2. Drag cvPRD to Trash
3. Empty Trash

**To remove data**:
Delete `~/Library/Application Support/cvprd-desktop/`

### Linux

**AppImage**: Just delete the `.AppImage` file

**Debian/Ubuntu**:
```bash
sudo apt remove cvprd
```

**To remove data**:
```bash
rm -rf ~/.config/cvprd-desktop/
```

## Troubleshooting

### App Won't Start

**Windows**:
- Right-click cvPRD → Run as Administrator
- Check if port 8000 is available

**Mac**:
- Try: System Preferences → Security & Privacy → "Open Anyway"
- Allow network connections if prompted

**Linux**:
- Ensure AppImage is executable: `chmod +x cvPRD*.AppImage`
- Install required libraries: `sudo apt install libfuse2`

### "Port Already in Use" Error

Another program is using port 8000:
1. Close other apps that might use port 8000
2. Restart cvPRD
3. If persists, restart your computer

### Slow Performance

- **First launch**: Models are loading (normal)
- **Large PRDs**: Search may take 1-2 seconds (normal)
- **Low memory**: Close other applications
- **Improve speed**: Upgrade to SSD, add more RAM

### Search Not Working

1. Make sure you've created at least one PRD
2. Wait for initial model download to complete
3. Check that PRD has content (not empty)

### Data Recovery

If your database gets corrupted:

1. Close cvPRD
2. Navigate to data folder (see "Data Storage" above)
3. Rename `cvprd.db` to `cvprd.db.backup`
4. Restart cvPRD (creates fresh database)
5. If needed, contact support to recover from backup

## Privacy & Security

- **100% Offline**: All data stays on your computer
- **No Tracking**: We don't collect any usage data
- **No Internet Required**: Works completely offline
- **Local AI Models**: Embeddings generated locally

## Updates

Future versions will include automatic updates. For now:

1. Download the new version
2. Install over the existing version (keeps your data)
3. Your PRDs are automatically preserved

## Getting Help

### Documentation
- User Guide: See "Help" menu in the app
- Video Tutorials: [Link to tutorials]

### Support
- Email: support@cvprd.com
- GitHub Issues: [Link to issues]
- Community Forum: [Link to forum]

### Known Limitations

- **No collaboration**: Single user per installation
- **No cloud sync**: Data is local only
- **No mobile apps**: Desktop only
- **Graph features**: Limited compared to web version

## Tips & Best Practices

1. **Be Specific**: Write clear, detailed requirements
2. **Use Tags**: Organize PRDs with consistent tags
3. **Regular Backups**: Back up weekly or before major changes
4. **Descriptive Names**: Use clear PRD and section names
5. **Link Dependencies**: Explicitly mention related requirements

## Feedback

We'd love to hear from you!

- **Feature Requests**: [Link to feature requests]
- **Bug Reports**: [Link to bug tracker]
- **Questions**: [Link to Q&A]

---

**Thank you for using cvPRD Desktop!**

Need help? Check the Help menu in the app or visit [support link]

# Document Upload Feature - Implementation Checklist

## Phase 1: Backend Document Parsing (Week 1-2)

### 1.1 Dependencies Installation
- [ ] Add to `backend/requirements.txt`:
  ```
  python-docx>=0.8.11        # Word document parsing
  pypdf>=4.0.0               # PDF text extraction
  markdown>=3.5.0            # Markdown parsing
  python-pptx>=0.6.21        # PowerPoint support (optional)
  ```
- [ ] Run `pip install -r requirements.txt` in venv

### 1.2 Create Document Parser Service
- [ ] Create new file: `/backend/app/services/document_parser.py`
- [ ] Implement `DocumentParser` class with methods:
  - [ ] `parse_docx(file_path: str) -> PRD`
    - Extract headings as section titles
    - Extract paragraph content as section content
    - Auto-detect priorities from formatting/keywords
  - [ ] `parse_markdown(content: str, filename: str) -> PRD`
    - Parse markdown headers (# ## ###) as sections
    - Extract content between headers
    - Support code blocks and lists
  - [ ] `parse_pdf(file_path: str) -> PRD`
    - Extract text from PDF pages
    - Attempt to detect structure
    - Fallback: treat each paragraph as section
  - [ ] `_extract_sections_from_markdown(content: str) -> List[PRDSection]`
  - [ ] `_extract_sections_from_docx(doc) -> List[PRDSection]`
  - [ ] `_infer_priority(text: str) -> Priority`
  - [ ] `_extract_tags(text: str) -> List[str]`

### 1.3 Update Configuration
- [ ] Modify `/backend/app/core/config.py`:
  - [ ] Add `UPLOAD_FOLDER: str = "/tmp/cvprd_uploads"`
  - [ ] Add `MAX_FILE_SIZE: int = 50 * 1024 * 1024` (50MB)
  - [ ] Add `ALLOWED_UPLOAD_TYPES: List[str] = [".docx", ".md", ".pdf"]`

### 1.4 Create Upload API Endpoint
- [ ] Modify `/backend/app/api/routes.py`:
  - [ ] Import: `from fastapi import UploadFile, File`
  - [ ] Add new request model: `UploadPRDRequest`
  - [ ] Add new response model: `UploadPRDResponse`
  - [ ] Create endpoint: `@router.post("/prds/upload")`
    ```python
    @router.post("/prds/upload", response_model=PRDResponse)
    async def upload_and_create_prd(file: UploadFile = File(...)):
        """Upload document (.docx, .md, .pdf) and create PRD"""
        # Validate file extension
        # Save file temporarily
        # Parse document using DocumentParser
        # Call orchestrator.process_prd()
        # Return result
        # Clean up temp file
    ```

### 1.5 Testing
- [ ] Create test file: `/backend/tests/test_document_parser.py`
- [ ] Test Word parsing with sample .docx
- [ ] Test Markdown parsing with sample .md
- [ ] Test PDF parsing with sample .pdf
- [ ] Test file upload endpoint with curl/Postman
- [ ] Test with various document structures
- [ ] Test error handling (invalid files, corrupted docs)
- [ ] Test large file handling

### 1.6 Integration Testing
- [ ] Upload document → Verify chunks created
- [ ] Verify embeddings generated
- [ ] Verify vector indexing in Qdrant
- [ ] Verify graph nodes in Neo4j
- [ ] Verify semantic search works on uploaded content
- [ ] Verify relationship detection

---

## Phase 2: Frontend Upload Component (Week 2)

### 2.1 Create Upload Component
- [ ] Create file: `/frontend/src/components/DocumentUpload.tsx`
- [ ] Features:
  - [ ] File input with drag-and-drop support
  - [ ] Show selected file name and size
  - [ ] Upload progress indicator
  - [ ] Loading state during upload
  - [ ] Success/error messages
  - [ ] Redirect to PRD detail after upload

```typescript
interface DocumentUploadProps {
  onSuccess: (prdResponse: PRDResponse) => void
  onError: (error: string) => void
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onSuccess, onError }) => {
  // Drag-and-drop functionality
  // File input handler
  // Upload logic with axios
  // Progress tracking
  // Response handling
}
```

### 2.2 Update API Client
- [ ] Modify `/frontend/src/services/api.ts`:
  - [ ] Add new function: `uploadDocument(file: File): Promise<PRDResponse>`
    ```typescript
    export const uploadDocument = async (file: File): Promise<PRDResponse> => {
      const formData = new FormData()
      formData.append('file', file)
      const response = await api.post<PRDResponse>('/prds/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      return response.data
    }
    ```

### 2.3 Update Main App Component
- [ ] Modify `/frontend/src/App.tsx`:
  - [ ] Import DocumentUpload component
  - [ ] Add tab/route for document upload
  - [ ] Show upload component with handlers
  - [ ] Display success message with PRD link

### 2.4 Update Type Definitions
- [ ] Modify `/frontend/src/types/index.ts`:
  - [ ] Add `DocumentUploadResponse` type
  - [ ] Ensure all types match backend responses

### 2.5 Frontend Testing
- [ ] Test file selection
- [ ] Test drag-and-drop
- [ ] Test upload with small file
- [ ] Test upload with large file
- [ ] Test error handling (unsupported file)
- [ ] Test success redirect
- [ ] Test progress indication
- [ ] Test with network latency simulation

---

## Phase 3: Enhanced Chunking & Detection (Week 3)

### 3.1 Improve Chunk Type Detection
- [ ] Enhance `/backend/app/services/chunking_service.py`:
  - [ ] Add more keyword patterns for each chunk type
  - [ ] Improve section header analysis
  - [ ] Add confidence scoring
  - [ ] Support numbered/bulleted lists as sections

### 3.2 Better Relationship Detection
- [ ] Enhance relationship detection in ChunkingService:
  - [ ] Improve synonym detection
  - [ ] Better dependency keyword matching
  - [ ] Reduce false positives
  - [ ] Calculate relationship strength more accurately

### 3.3 Format Preservation
- [ ] Consider tracking original formatting
  - [ ] Preserve bold/italic/underline as metadata
  - [ ] Track list structures
  - [ ] Preserve code snippets
  - [ ] Extract images (optional, store metadata)

---

## Phase 4: Quality Assurance & Polish (Week 4)

### 4.1 Validation & Error Handling
- [ ] File size validation
- [ ] File type validation
- [ ] File corruption detection
- [ ] Duplicate detection (same content)
- [ ] Empty document handling
- [ ] Special character handling

### 4.2 User Experience
- [ ] Loading spinners during upload
- [ ] Detailed error messages
- [ ] Upload progress percentage
- [ ] File preview before upload (optional)
- [ ] Batch upload support (optional)

### 4.3 Database Persistence
- [ ] Implement PostgreSQL storage (optional but recommended):
  - [ ] Store original document metadata
  - [ ] Track upload timestamp
  - [ ] Track document version
  - [ ] Support document updates

### 4.4 Performance Optimization
- [ ] Batch embedding generation for large documents
- [ ] Streaming uploads for large files
- [ ] Caching for frequently accessed chunks
- [ ] Index optimization in Qdrant

### 4.5 Documentation
- [ ] Document upload API in OpenAPI/Swagger
- [ ] Add examples to README
- [ ] Create user guide for upload feature
- [ ] Document supported file formats and limits

---

## Phase 5: Testing & Deployment (Week 4-5)

### 5.1 Unit Tests
- [ ] Test DocumentParser with various file types
- [ ] Test PRD conversion logic
- [ ] Test error handling
- [ ] Test API endpoint

### 5.2 Integration Tests
- [ ] End-to-end upload test
- [ ] Semantic search on uploaded content
- [ ] Relationship detection verification
- [ ] Graph integrity check

### 5.3 User Acceptance Testing
- [ ] Test with real documents
- [ ] Performance testing with large files
- [ ] Stress testing (multiple uploads)
- [ ] Browser compatibility testing

### 5.4 Deployment
- [ ] Update Docker image if needed
- [ ] Update deployment documentation
- [ ] Create migration guide for existing users
- [ ] Add feature flag for gradual rollout (optional)

---

## Detailed Implementation Examples

### Example 1: Word Document Parser

```python
# /backend/app/services/document_parser.py

from docx import Document
from app.models.prd_models import PRD, PRDSection, Priority
from typing import List
import uuid
import os
import tempfile

class DocumentParser:
    @staticmethod
    def parse_docx(file_path: str) -> PRD:
        """Parse Word document into PRD structure"""
        doc = Document(file_path)
        
        # Extract title from document properties or first heading
        title = doc.core_properties.title or "Untitled Document"
        description = doc.core_properties.subject or ""
        
        sections = []
        current_heading = None
        current_content_lines = []
        
        for para in doc.paragraphs:
            # Check if paragraph is a heading
            if para.style.name.startswith('Heading'):
                # Save previous section if exists
                if current_heading and current_content_lines:
                    sections.append(PRDSection(
                        title=current_heading,
                        content="\n".join(current_content_lines).strip(),
                        priority=Priority.MEDIUM,  # Can improve detection
                        tags=[]
                    ))
                
                # Start new section
                current_heading = para.text
                current_content_lines = []
            elif current_heading and para.text.strip():
                current_content_lines.append(para.text)
        
        # Add last section
        if current_heading and current_content_lines:
            sections.append(PRDSection(
                title=current_heading,
                content="\n".join(current_content_lines).strip(),
                priority=Priority.MEDIUM,
                tags=[]
            ))
        
        # If no sections found, create one from all text
        if not sections:
            all_text = "\n".join(p.text for p in doc.paragraphs if p.text.strip())
            sections.append(PRDSection(
                title="Content",
                content=all_text,
                priority=Priority.MEDIUM,
                tags=[]
            ))
        
        return PRD(
            id=str(uuid.uuid4()),
            name=title,
            description=description,
            sections=sections
        )
```

### Example 2: Markdown Parser

```python
# /backend/app/services/document_parser.py

import re
from app.models.prd_models import PRD, PRDSection, Priority

class DocumentParser:
    @staticmethod
    def parse_markdown(content: str, filename: str) -> PRD:
        """Parse markdown document into PRD structure"""
        lines = content.split('\n')
        
        sections = []
        current_heading = None
        current_content_lines = []
        
        for line in lines:
            # Check for markdown heading
            heading_match = re.match(r'^(#{1,6})\s+(.+)$', line)
            
            if heading_match:
                # Save previous section
                if current_heading and current_content_lines:
                    sections.append(PRDSection(
                        title=current_heading,
                        content="\n".join(current_content_lines).strip(),
                        priority=Priority.MEDIUM,
                        tags=[]
                    ))
                
                # Start new section (use only top-level headings)
                level = len(heading_match.group(1))
                if level == 1 or level == 2:  # H1 or H2
                    current_heading = heading_match.group(2).strip()
                    current_content_lines = []
            elif current_heading and line.strip():
                current_content_lines.append(line)
        
        # Add last section
        if current_heading and current_content_lines:
            sections.append(PRDSection(
                title=current_heading,
                content="\n".join(current_content_lines).strip(),
                priority=Priority.MEDIUM,
                tags=[]
            ))
        
        return PRD(
            id=str(uuid.uuid4()),
            name=filename.replace('.md', ''),
            sections=sections
        )
```

### Example 3: FastAPI Upload Endpoint

```python
# /backend/app/api/routes.py

from fastapi import UploadFile, File, HTTPException
import tempfile
import os
from app.services.document_parser import DocumentParser

@router.post("/prds/upload", response_model=PRDResponse)
async def upload_and_create_prd(file: UploadFile = File(...)):
    """
    Upload a document (.docx, .md, .pdf) and create a PRD from it
    """
    try:
        # Validate file type
        allowed_types = {'.docx', '.md', '.pdf', '.txt'}
        file_ext = os.path.splitext(file.filename)[1].lower()
        
        if file_ext not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported file type. Allowed: {allowed_types}"
            )
        
        # Validate file size (50MB max)
        max_size = 50 * 1024 * 1024
        content = await file.read()
        if len(content) > max_size:
            raise HTTPException(
                status_code=413,
                detail="File too large (max 50MB)"
            )
        
        # Save temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        
        try:
            # Parse document based on type
            if file_ext == '.docx':
                prd = DocumentParser.parse_docx(tmp_path)
            elif file_ext == '.md':
                prd = DocumentParser.parse_markdown(content.decode('utf-8'), file.filename)
            elif file_ext == '.pdf':
                prd = DocumentParser.parse_pdf(tmp_path)
            elif file_ext == '.txt':
                text = content.decode('utf-8')
                prd = DocumentParser.parse_plaintext(text, file.filename)
            
            # Process through orchestrator
            result = orchestrator.process_prd(prd)
            
            logger.info(f"Uploaded document: {file.filename} -> PRD: {prd.name}")
            
            return PRDResponse(
                prd_id=result["prd_id"],
                prd_name=result["prd_name"],
                chunks_created=result["chunks_created"],
                relationships_created=result["relationships_created"],
                chunks=result["chunks"],
            )
        
        finally:
            # Clean up temp file
            if os.path.exists(tmp_path):
                os.remove(tmp_path)
    
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error uploading document: {e}")
        raise HTTPException(status_code=500, detail=str(e))
```

### Example 4: React Upload Component

```typescript
// /frontend/src/components/DocumentUpload.tsx

import React, { useState, useRef } from 'react'
import { uploadDocument } from '../services/api'
import { PRDResponse } from '../types'

interface DocumentUploadProps {
  onSuccess: (prd: PRDResponse) => void
  onError: (error: string) => void
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onSuccess, onError }) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const files = e.dataTransfer.files
    if (files.length > 0) {
      setSelectedFile(files[0])
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setSelectedFile(e.target.files[0])
    }
  }

  const handleUpload = async () => {
    if (!selectedFile) {
      onError('Please select a file')
      return
    }

    setIsUploading(true)
    setProgress(0)

    try {
      // Simulate progress
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90))
      }, 200)

      const result = await uploadDocument(selectedFile)
      clearInterval(progressInterval)
      setProgress(100)
      onSuccess(result)
    } catch (error) {
      onError(`Upload failed: ${error}`)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="document-upload">
      <div
        className={`upload-area ${isDragging ? 'dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p>Drag and drop your document here</p>
        <p>or</p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
        >
          Browse Files
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".docx,.md,.pdf,.txt"
          onChange={handleFileSelect}
          hidden
        />
      </div>

      {selectedFile && (
        <div className="file-selected">
          <p>Selected: {selectedFile.name}</p>
          <p>Size: {(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
      )}

      {isUploading && (
        <div className="progress-bar">
          <div style={{ width: `${progress}%` }}></div>
          <span>{progress}%</span>
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!selectedFile || isUploading}
        className="upload-button"
      >
        {isUploading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  )
}

export default DocumentUpload
```

---

## Testing Checklist

### Unit Tests
- [ ] `test_parse_docx_with_headings`
- [ ] `test_parse_markdown_structure`
- [ ] `test_parse_pdf_text_extraction`
- [ ] `test_priority_detection`
- [ ] `test_tag_extraction`
- [ ] `test_file_validation`
- [ ] `test_large_file_handling`

### Integration Tests
- [ ] `test_upload_and_process_docx`
- [ ] `test_upload_and_semantic_search`
- [ ] `test_relationship_detection_after_upload`
- [ ] `test_graph_integrity_after_upload`

### E2E Tests
- [ ] Upload .docx → View in UI
- [ ] Upload .md → Search in uploaded content
- [ ] Upload .pdf → Check relationships detected
- [ ] Multiple uploads → No conflicts

---

## Success Criteria

- Document upload endpoint accepts .docx, .md, .pdf files
- Uploaded documents are parsed into PRD sections
- Each section is chunked, embedded, and indexed
- Semantic search works on uploaded content
- Relationships are correctly detected
- Frontend upload component is user-friendly
- No data loss or corruption
- Proper error handling and user feedback

---

Generated: November 2025

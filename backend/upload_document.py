#!/usr/bin/env python3
"""
CLI tool to upload and process PRD documents (Word or Markdown)

Usage:
    python upload_document.py <file_path> [--name NAME] [--description DESC]

Examples:
    python upload_document.py ./my_prd.docx
    python upload_document.py ./my_prd.md --name "Mobile App PRD" --description "PRD for mobile application"
"""

import sys
import argparse
import logging
from pathlib import Path

# Add the app directory to the path
sys.path.insert(0, str(Path(__file__).parent))

from app.services.document_parser import DocumentParser, DocumentParserError
from app.services.orchestrator import PRDOrchestrator
from app.core.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


def print_section_separator():
    """Print a visual separator"""
    print("\n" + "=" * 80 + "\n")


def print_prd_summary(prd):
    """Print a summary of the parsed PRD"""
    print(f"PRD ID: {prd.id}")
    print(f"Name: {prd.name}")
    print(f"Description: {prd.description or 'N/A'}")
    print(f"\nSections ({len(prd.sections)}):")
    for i, section in enumerate(prd.sections, 1):
        print(f"  {i}. {section.title}")
        print(f"     Priority: {section.priority.value}")
        print(f"     Tags: {', '.join(section.tags) if section.tags else 'None'}")
        print(f"     Content length: {len(section.content)} characters")


def print_processing_results(results):
    """Print the processing results"""
    print(f"\nProcessing Results:")
    print(f"  Chunks created: {results['chunks_created']}")
    print(f"  Relationships created: {results['relationships_created']}")

    if results.get('graph_stats'):
        print(f"\nGraph Statistics:")
        for key, value in results['graph_stats'].items():
            print(f"  {key}: {value}")

    if results.get('vector_stats'):
        print(f"\nVector Database Statistics:")
        print(f"  Collection: {results['vector_stats'].get('collection_name', 'N/A')}")
        print(f"  Total vectors: {results['vector_stats'].get('vectors_count', 'N/A')}")


def main():
    parser = argparse.ArgumentParser(
        description='Upload and process PRD documents (Word or Markdown)',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s my_prd.docx
  %(prog)s my_prd.md --name "Mobile App PRD"
  %(prog)s document.docx --name "Project X" --description "Initial requirements"
        """
    )

    parser.add_argument(
        'file_path',
        help='Path to the document file (.docx, .md, .markdown)'
    )

    parser.add_argument(
        '--name',
        '-n',
        help='Custom name for the PRD (defaults to filename)'
    )

    parser.add_argument(
        '--description',
        '-d',
        help='Description for the PRD (defaults to first section excerpt)'
    )

    parser.add_argument(
        '--skip-processing',
        action='store_true',
        help='Only parse the document without processing into vector/graph databases'
    )

    parser.add_argument(
        '--verbose',
        '-v',
        action='store_true',
        help='Enable verbose output'
    )

    args = parser.parse_args()

    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    # Validate file exists
    file_path = Path(args.file_path)
    if not file_path.exists():
        print(f"Error: File not found: {args.file_path}", file=sys.stderr)
        return 1

    try:
        print_section_separator()
        print(f"Parsing document: {file_path}")
        print_section_separator()

        # Parse the document
        prd = DocumentParser.parse_document(
            str(file_path),
            prd_name=args.name,
            prd_description=args.description
        )

        # Display parsed PRD
        print_prd_summary(prd)

        if args.skip_processing:
            print("\nSkipping processing (--skip-processing flag set)")
            print_section_separator()
            return 0

        # Process the PRD through the orchestrator
        print_section_separator()
        print("Processing PRD into knowledge graph...")
        print_section_separator()

        orchestrator = PRDOrchestrator()
        try:
            results = orchestrator.process_prd(prd)
            print_processing_results(results)

            print_section_separator()
            print("SUCCESS! PRD has been uploaded and processed.")
            print(f"PRD ID: {prd.id}")
            print(f"You can now search for content from this PRD using semantic search.")
            print_section_separator()

        finally:
            orchestrator.close()

        return 0

    except DocumentParserError as e:
        print(f"\nError parsing document: {e}", file=sys.stderr)
        return 1
    except Exception as e:
        logger.exception("Unexpected error during processing")
        print(f"\nUnexpected error: {e}", file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

#!/usr/bin/env python3
"""
Demo script showcasing cvPRD functionality:
- PRD chunking
- Vector embeddings and semantic search
- Knowledge graph creation and traversal
"""

import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.models.prd_models import PRD, PRDSection, Priority
from app.services.embedding_service import EmbeddingService
from app.services.vector_service import VectorService
from app.services.graph_service import GraphService
from app.services.chunking_service import ChunkingService
from app.core.config import settings
import uuid
import time


def print_header(text):
    """Print a formatted header"""
    print("\n" + "=" * 80)
    print(f"  {text}")
    print("=" * 80 + "\n")


def print_section(text):
    """Print a formatted section"""
    print(f"\n--- {text} ---\n")


def create_sample_prd():
    """Create a sample PRD for authentication system"""
    prd = PRD(
        id=str(uuid.uuid4()),
        name="User Authentication System",
        description="Complete authentication system with OAuth2 and MFA support",
        sections=[
            PRDSection(
                title="User Authentication Requirement",
                content="The system shall authenticate users using OAuth2 protocol with support for multiple providers including Google, GitHub, and Microsoft.",
                priority=Priority.CRITICAL,
                tags=["auth", "security", "oauth2"],
            ),
            PRDSection(
                title="Multi-Factor Authentication",
                content="The system must support multi-factor authentication (MFA) using TOTP (Time-based One-Time Password). This feature depends on User Authentication being implemented first.",
                priority=Priority.HIGH,
                tags=["auth", "security", "mfa"],
            ),
            PRDSection(
                title="Session Management",
                content="The system shall manage user sessions with configurable timeout periods. Sessions must be stored securely and support both cookie-based and token-based authentication.",
                priority=Priority.HIGH,
                tags=["auth", "session"],
            ),
            PRDSection(
                title="Password Reset Feature",
                content="Users shall be able to reset their password through email verification. This requires the email notification system to be operational.",
                priority=Priority.MEDIUM,
                tags=["auth", "password", "email"],
            ),
            PRDSection(
                title="Rate Limiting Constraint",
                content="Authentication endpoints must implement rate limiting to prevent brute force attacks. Maximum 5 failed login attempts per IP address per minute.",
                priority=Priority.HIGH,
                tags=["security", "rate-limiting"],
            ),
            PRDSection(
                title="Security Audit Logging",
                content="All authentication events (login, logout, failed attempts, password changes) shall be logged for security auditing purposes.",
                priority=Priority.MEDIUM,
                tags=["security", "logging", "audit"],
            ),
        ],
    )
    return prd


def main():
    print_header("cvPRD Prototype Demo")
    print("This demo showcases:")
    print("  1. PRD Chunking - Breaking down PRDs into semantic chunks")
    print("  2. Vector Embeddings - Converting chunks to searchable vectors")
    print("  3. Semantic Search - Finding relevant chunks by meaning")
    print("  4. Knowledge Graph - Linking chunks with relationships")
    print("  5. Graph Traversal - Finding dependencies and related chunks")

    # Initialize services
    print_section("Initializing Services")
    print("Loading embedding model (this may take a moment)...")
    embedding_service = EmbeddingService(model_name=settings.EMBEDDING_MODEL)
    print(f"✓ Embedding model loaded (dimension: {embedding_service.get_dimension()})")

    print("\nConnecting to Qdrant vector database...")
    vector_service = VectorService(
        host=settings.QDRANT_HOST,
        port=settings.QDRANT_PORT,
        collection_name=settings.QDRANT_COLLECTION,
        vector_size=settings.EMBEDDING_DIMENSION,
    )
    print("✓ Connected to Qdrant")

    print("\nConnecting to Neo4j knowledge graph...")
    graph_service = GraphService(
        uri=settings.NEO4J_URI,
        user=settings.NEO4J_USER,
        password=settings.NEO4J_PASSWORD,
    )
    print("✓ Connected to Neo4j")

    # Clear previous data for clean demo
    print("\nClearing previous demo data...")
    graph_service.clear_all()

    # Step 1: Create and chunk PRD
    print_header("Step 1: Create PRD and Generate Chunks")
    prd = create_sample_prd()
    print(f"PRD Name: {prd.name}")
    print(f"Description: {prd.description}")
    print(f"Sections: {len(prd.sections)}")

    print("\nChunking PRD into semantic components...")
    chunks = ChunkingService.chunk_prd(prd)
    print(f"✓ Created {len(chunks)} chunks\n")

    for i, chunk in enumerate(chunks, 1):
        print(f"{i}. [{chunk.chunk_type.value.upper()}] {chunk.metadata['section_title']}")
        print(f"   Priority: {chunk.priority.value}")
        print(f"   Tags: {', '.join(chunk.tags)}")
        print(f"   Text preview: {chunk.text[:80]}...")
        print()

    # Step 2: Generate embeddings and index in vector DB
    print_header("Step 2: Generate Embeddings and Index in Vector Database")
    print("Generating embeddings for all chunks...")

    for chunk in chunks:
        # Combine context and text for better embeddings
        full_text = f"{chunk.context_prefix} - {chunk.text}"

        # Generate embedding
        vector = embedding_service.embed_text(full_text)

        # Index in Qdrant
        payload = {
            "chunk_id": chunk.id,
            "prd_id": chunk.prd_id,
            "chunk_type": chunk.chunk_type.value,
            "text": chunk.text,
            "context": full_text,
            "priority": chunk.priority.value,
            "tags": chunk.tags,
            "section_title": chunk.metadata["section_title"],
        }

        vector_service.index_chunk(chunk_id=chunk.id, vector=vector, payload=payload)

    collection_info = vector_service.get_collection_info()
    print(f"✓ Indexed {collection_info['points_count']} chunks in Qdrant")

    # Step 3: Build knowledge graph
    print_header("Step 3: Build Knowledge Graph")

    # Create PRD node
    print(f"Creating PRD node: {prd.name}")
    graph_service.create_prd_node(
        prd_id=prd.id, prd_data={"name": prd.name, "description": prd.description}
    )

    # Create chunk nodes
    print(f"Creating {len(chunks)} chunk nodes...")
    for chunk in chunks:
        graph_service.create_chunk_node(
            chunk_id=chunk.id,
            chunk_data={
                "type": chunk.chunk_type.value,
                "text": chunk.text,
                "priority": chunk.priority.value,
                "context": chunk.context_prefix,
            },
        )
        graph_service.link_chunk_to_prd(chunk_id=chunk.id, prd_id=prd.id)

    # Detect and create relationships
    print("\nDetecting relationships between chunks...")
    relationships = ChunkingService.detect_relationships(chunks)
    print(f"Found {len(relationships)} relationships")

    for source_id, target_id, rel_type in relationships:
        # Find chunk names for display
        source_chunk = next(c for c in chunks if c.id == source_id)
        target_chunk = next(c for c in chunks if c.id == target_id)

        print(
            f"  {source_chunk.metadata['section_title']} "
            f"-[{rel_type}]-> "
            f"{target_chunk.metadata['section_title']}"
        )

        graph_service.create_relationship(
            source_id=source_id,
            target_id=target_id,
            rel_type=rel_type,
            properties={"strength": 0.8},
        )

    stats = graph_service.get_graph_stats()
    print(f"\n✓ Knowledge graph created:")
    print(f"  Total chunks: {stats['total_chunks']}")
    print(f"  Dependencies: {stats['dependency_count']}")
    print(f"  References: {stats['reference_count']}")

    # Step 4: Semantic Search
    print_header("Step 4: Semantic Search Demo")

    search_queries = [
        "How do we handle security and authentication?",
        "What about password management?",
        "Tell me about logging and auditing",
    ]

    for query in search_queries:
        print(f'Query: "{query}"')

        # Generate query embedding
        query_vector = embedding_service.embed_text(query)

        # Search
        results = vector_service.search(
            query_vector=query_vector, limit=3, score_threshold=0.3
        )

        print(f"Found {len(results)} relevant chunks:\n")
        for i, result in enumerate(results, 1):
            print(f"  {i}. Score: {result['score']:.3f}")
            print(f"     Type: {result['payload']['chunk_type']}")
            print(f"     Section: {result['payload']['section_title']}")
            print(f"     Text: {result['payload']['text'][:100]}...")
            print()

    # Step 5: Graph Traversal
    print_header("Step 5: Knowledge Graph Traversal")

    # Find the MFA chunk to show dependencies
    mfa_chunk = next(c for c in chunks if "Multi-Factor" in c.metadata["section_title"])

    print(f"Analyzing chunk: {mfa_chunk.metadata['section_title']}")
    print(f"Text: {mfa_chunk.text[:150]}...\n")

    # Get all relationships
    relationships = graph_service.get_all_relationships(mfa_chunk.id)

    print("Relationships:")
    if relationships["dependencies"]:
        print("\n  Dependencies (this chunk depends on):")
        for dep in relationships["dependencies"]:
            print(f"    - [{dep['type']}] {dep['text'][:60]}...")

    if relationships["dependents"]:
        print("\n  Dependents (chunks that depend on this):")
        for dep in relationships["dependents"]:
            print(f"    - [{dep['type']}] {dep['text'][:60]}...")

    if relationships["references"]:
        print("\n  References:")
        for ref in relationships["references"]:
            print(f"    - [{ref['type']}] {ref['text'][:60]}...")

    # Find related chunks
    print(f"\nFinding chunks related to '{mfa_chunk.metadata['section_title']}'...")
    related = graph_service.find_related_chunks(mfa_chunk.id, max_results=5)

    if related:
        print(f"Found {len(related)} related chunks:")
        for rel in related:
            print(f"  - [{rel['type']}] via {rel['relationship_type']}")
            print(f"    {rel['text'][:80]}...")
    else:
        print("  No related chunks found")

    # Step 6: AI Context Building Demo
    print_header("Step 6: AI Context Building (for Code Generation)")

    print("Building context package for AI agent to generate authentication code...\n")

    # Select auth requirement
    auth_chunk = next(
        c for c in chunks if "Authentication Requirement" in c.metadata["section_title"]
    )

    print(f"Primary Requirement: {auth_chunk.metadata['section_title']}")

    # Get dependencies
    deps = graph_service.get_dependencies(auth_chunk.id, depth=2)

    # Build context
    context_parts = [
        "# Context for AI Code Generation",
        "",
        "## Primary Requirement",
        f"**Type:** {auth_chunk.chunk_type.value}",
        f"**Priority:** {auth_chunk.priority.value}",
        f"**Description:** {auth_chunk.text}",
        "",
    ]

    if deps:
        context_parts.extend(
            [
                "## Dependencies",
                "",
            ]
        )
        for dep in deps:
            context_parts.append(f"- [{dep['type']}] {dep['text']}")

    # Get related security chunks
    security_results = vector_service.search(
        query_vector=embedding_service.embed_text("security authentication"),
        limit=3,
        filters={"tags": ["security"]},
    )

    if security_results:
        context_parts.extend(
            [
                "",
                "## Related Security Requirements",
                "",
            ]
        )
        for result in security_results:
            if result["chunk_id"] != auth_chunk.id:
                context_parts.append(f"- {result['payload']['text']}")

    full_context = "\n".join(context_parts)

    print(full_context)
    print(f"\n✓ Context package ready ({len(full_context)} characters)")
    print("This context would be sent to an AI agent for code generation.")

    # Summary
    print_header("Demo Complete!")
    print("Summary of what we demonstrated:")
    print("  ✓ Chunked a PRD into 6 semantic components")
    print("  ✓ Generated 384-dimensional embeddings for each chunk")
    print(f"  ✓ Indexed {collection_info['points_count']} chunks in Qdrant vector database")
    print(f"  ✓ Created knowledge graph with {stats['total_chunks']} nodes")
    print(f"  ✓ Established {stats['dependency_count'] + stats['reference_count']} relationships")
    print("  ✓ Performed semantic search with relevance scoring")
    print("  ✓ Traversed graph to find dependencies and relationships")
    print("  ✓ Built AI-ready context packages for code generation")

    print("\nNext steps:")
    print("  - Explore Neo4j Browser at http://localhost:7474")
    print("  - Explore Qdrant Dashboard at http://localhost:6333/dashboard")
    print("  - Run custom queries using the services")

    # Cleanup
    graph_service.close()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nDemo interrupted by user")
    except Exception as e:
        print(f"\n\nError: {e}")
        import traceback

        traceback.print_exc()

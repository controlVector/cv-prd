#!/usr/bin/env python3
"""
Test script for PRD Optimization feature

This script tests the LLM-based PRD optimization workflow by:
1. Creating a sample PRD
2. Triggering the optimization
3. Displaying the results
"""

import asyncio
import httpx
import json
from datetime import datetime


BASE_URL = "http://localhost:8000/api/v1"


async def test_prd_optimizer():
    """Test the complete PRD optimization workflow"""

    print("=" * 80)
    print("CVprd PRD Optimizer Test")
    print("=" * 80)
    print()

    async with httpx.AsyncClient(timeout=120.0) as client:
        # Step 1: Create a test PRD
        print("Step 1: Creating a test PRD...")
        print("-" * 80)

        test_prd = {
            "name": "E-Commerce Platform",
            "description": "A modern e-commerce platform with real-time features",
            "sections": [
                {
                    "title": "User Management",
                    "content": """
                    Users should be able to register and login.
                    The system needs authentication.
                    Users can view their profile.
                    Profile should have email and name.
                    """,
                    "priority": "high",
                    "tags": ["authentication", "users"]
                },
                {
                    "title": "Product Catalog",
                    "content": """
                    Display products in a grid.
                    Products have images, prices, descriptions.
                    Search functionality needed.
                    Filter by category.
                    """,
                    "priority": "high",
                    "tags": ["products", "catalog"]
                },
                {
                    "title": "Shopping Cart",
                    "content": """
                    Users add products to cart.
                    Cart persists across sessions.
                    Update quantities.
                    Remove items from cart.
                    The cart depends on user authentication.
                    """,
                    "priority": "critical",
                    "tags": ["cart", "shopping"]
                }
            ]
        }

        try:
            response = await client.post(f"{BASE_URL}/prds", json=test_prd)
            response.raise_for_status()
            prd_data = response.json()

            prd_id = prd_data["prd_id"]
            prd_name = prd_data["prd_name"]

            print(f"✓ Created PRD: {prd_name}")
            print(f"  PRD ID: {prd_id}")
            print(f"  Chunks created: {prd_data['chunks_created']}")
            print(f"  Relationships detected: {prd_data['relationships_created']}")
            print()

        except httpx.HTTPStatusError as e:
            print(f"✗ Failed to create PRD: {e.response.status_code}")
            print(f"  Error: {e.response.text}")
            return

        # Step 2: Optimize the PRD
        print("Step 2: Optimizing the PRD with LLM...")
        print("-" * 80)
        print("Sending facts to OpenRouter for analysis...")
        print("(This may take 30-60 seconds depending on the LLM)")
        print()

        try:
            response = await client.post(
                f"{BASE_URL}/prds/{prd_id}/optimize",
                params={"optimization_goal": "vibe coding"}
            )
            response.raise_for_status()
            optimization_result = response.json()

            print("✓ Optimization complete!")
            print()

            # Display results
            print("=" * 80)
            print("OPTIMIZATION RESULTS")
            print("=" * 80)
            print()

            print(f"PRD: {optimization_result['prd_name']}")
            print(f"Goal: {optimization_result['optimization_goal']}")
            print()

            print("STATISTICS:")
            print("-" * 80)
            stats = optimization_result['statistics']
            print(f"  Facts Updated:           {stats['facts_updated']}")
            print(f"  New Facts Created:       {stats['facts_created']}")
            print(f"  Relationships Created:   {stats['relationships_created']}")
            print(f"  Facts Unchanged:         {stats['facts_unchanged']}")
            print()

            print("LLM ANALYSIS:")
            print("-" * 80)
            analysis = optimization_result['analysis']
            print(f"Overall Assessment:")
            print(f"  {analysis['overall_assessment']}")
            print()
            print(f"Structural Insights:")
            print(f"  {analysis['structural_insights']}")
            print()

            # Save detailed results to file
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"optimization_result_{timestamp}.json"
            with open(filename, 'w') as f:
                json.dump(optimization_result, f, indent=2)

            print(f"✓ Detailed results saved to: {filename}")
            print()

            # Display some sample optimizations
            if 'detailed_analysis' in optimization_result:
                detailed = optimization_result['detailed_analysis']

                if 'fact_optimizations' in detailed and detailed['fact_optimizations']:
                    print("SAMPLE FACT OPTIMIZATIONS:")
                    print("-" * 80)
                    for i, opt in enumerate(detailed['fact_optimizations'][:3]):
                        print(f"\nFact #{i+1}:")
                        print(f"  Quality Score: {opt.get('quality_score', 'N/A')}/10")
                        print(f"  Issues: {', '.join(opt.get('issues', []))}")
                        print(f"  Suggested Type: {opt.get('suggested_type', 'N/A')}")
                        print(f"  Suggested Priority: {opt.get('suggested_priority', 'N/A')}")
                    print()

                if 'new_facts' in detailed and detailed['new_facts']:
                    print("NEW FACTS RECOMMENDED:")
                    print("-" * 80)
                    for i, fact in enumerate(detailed['new_facts'][:3]):
                        print(f"\nNew Fact #{i+1}:")
                        print(f"  Type: {fact.get('type', 'N/A')}")
                        print(f"  Priority: {fact.get('priority', 'N/A')}")
                        print(f"  Text: {fact.get('text', 'N/A')[:100]}...")
                        print(f"  Rationale: {fact.get('rationale', 'N/A')}")
                    print()

            print("=" * 80)
            print("TEST COMPLETED SUCCESSFULLY")
            print("=" * 80)

        except httpx.HTTPStatusError as e:
            print(f"✗ Failed to optimize PRD: {e.response.status_code}")
            print(f"  Error: {e.response.text}")
            return
        except Exception as e:
            print(f"✗ Unexpected error: {str(e)}")
            import traceback
            traceback.print_exc()
            return


async def main():
    """Main entry point"""
    try:
        # First check if the backend is running
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(f"{BASE_URL}/health")
                print("✓ Backend is running")
                print()
            except httpx.ConnectError:
                print("✗ Backend is not running!")
                print("  Please start the backend first:")
                print("  cd /home/jwscho/cvPRD/backend")
                print("  uvicorn app.main:app --reload")
                return

        # Run the test
        await test_prd_optimizer()

    except KeyboardInterrupt:
        print("\n\nTest interrupted by user")
    except Exception as e:
        print(f"\n✗ Test failed: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(main())

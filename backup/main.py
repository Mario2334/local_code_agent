"""
Bootstraps an Agno agent and connects a Weaviate knowledge base.

Weaviate URL: http://100.66.227.18:8080/

Notes:
- This script is resilient: if `agno` or `weaviate-client` aren't installed, it will
  print actionable messages instead of crashing.
- If you plan to use LLMs/embedders with Agno, you may need to set environment
  variables such as OPENAI_API_KEY depending on your chosen provider.
"""
from typing import Optional

WEAVIATE_URL = "http://100.66.227.18:8080/"


def connect_weaviate(url: str):
    """Attempt to connect to Weaviate and return a client if successful.

    Tries both v3 and v4 client styles where possible; prints helpful messages.
    """
    try:
        import weaviate  # v3 style
        try:
            client = weaviate.Client(url)
            # v3 client exposes is_ready() and .schema operations
            ready = False
            try:
                ready = client.is_ready()
            except Exception:
                # If readiness check is unavailable, try a light schema call
                try:
                    _ = client.schema.get()
                    ready = True
                except Exception:
                    ready = False
            if ready:
                print(f"[weaviate] Connected (v3 client) to {url}")
                return client
            else:
                print(f"[weaviate] Unable to verify readiness at {url}. Proceeding anyway.")
                return client
        except AttributeError:
            # Possibly v4 installed under `weaviate` meta-package
            pass
    except ImportError:
        # Try v4 import shape
        pass

    # Try v4 style API
    try:
        # Newer clients (v4) may be split under `weaviate` with connect helpers
        import weaviate as wv
        try:
            # connect_to_custom is typical in v4
            client = wv.connect_to_custom(url)
        except Exception:
            # Fallback to an HTTP-based client if available
            try:
                client = wv.Client(url)  # some builds still expose this
            except Exception as e2:
                print("[weaviate] Failed to initialize client:", e2)
                return None
        print(f"[weaviate] Connected (v4 or fallback) to {url}")
        return client
    except Exception as e:
        print("[weaviate] Weaviate client not available. Install with: pip install weaviate-client")
        print("[weaviate] Error:", e)
        return None


def setup_agno_with_weaviate(weaviate_client) -> Optional[object]:
    """Attempt to create an Agno Agent and attach Weaviate knowledge if possible.

    Returns the agent instance when successful, else None.
    """
    if weaviate_client is None:
        print("[agno] Skipping Agno setup because Weaviate is not connected.")
        return None

    try:
        # The exact package layout may vary; we attempt the commonly used ones.
        try:
            from agno.agent import Agent  # common import
        except Exception:
            # Alternative older/newer paths can be tried if needed
            from agno import Agent  # fallback

        # Knowledge integration with Weaviate. Path may vary across versions of agno.
        knowledge = None
        try:
            # Preferred path (example):
            from agno.knowledge.weaviate import WeaviateKnowledge
            # Minimal config: pass client and a default index/class name
            knowledge = WeaviateKnowledge(client=weaviate_client, index_name="AgnoKnowledge")
        except Exception as e:
            print("[agno] WeaviateKnowledge not available in this agno version:", e)
            knowledge = None

        # Initialize the agent; if knowledge is unavailable, still create a basic agent
        if knowledge is not None:
            agent = Agent(knowledge=knowledge)
            print("[agno] Agent initialized with Weaviate knowledge base.")
        else:
            agent = Agent()
            print("[agno] Agent initialized without direct Weaviate knowledge integration.")

        return agent
    except ImportError as e:
        print("[agno] Agno not installed. Install with: pip install agno")
        print("[agno] Error:", e)
        return None
    except Exception as e:
        print("[agno] Failed to initialize Agno agent:", e)
        return None


def ensure_basic_schema(client) -> None:
    """Ensure a simple class exists for storing text snippets in Weaviate (v3 style).

    If using v4, this may need adjustments; we guard with try/except.
    """
    if client is None:
        return
    try:
        # v3 schema management
        schema = client.schema.get()
        class_names = {c.get("class") for c in schema.get("classes", [])}
        if "AgnoKnowledge" not in class_names:
            class_obj = {
                "class": "AgnoKnowledge",
                "description": "Simple knowledge container for Agno",
                "properties": [
                    {"name": "text", "dataType": ["text"], "description": "Raw text"},
                ],
                # Optional vectorizer/other configs can be added here if needed
            }
            client.schema.create_class(class_obj)
            print("[weaviate] Created class 'AgnoKnowledge'.")
        else:
            print("[weaviate] Class 'AgnoKnowledge' already exists.")
    except Exception as e:
        # On v4 or restricted permissions, just inform and continue
        print("[weaviate] Could not ensure schema (this may be normal on v4 or limited setup):", e)


from runner import run

def main():
    # Delegate to the new scalable runner which uses config, services, and agents packages
    run()


if __name__ == "__main__":
    main()

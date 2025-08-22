from __future__ import annotations

from pathlib import Path
from typing import List

from agno.document import Document


def collect_documents(code_path: str, framework: str = "springboot") -> List[Document]:
    """Collect documents from a Spring Boot project codebase.

    """
    root = Path(code_path)
    if not root.exists():
        raise FileNotFoundError(f"CODE_PATH not found: {code_path}")

    include_globs = [
        "**/*.java",
        "**/*.properties",
        "**/*.yml",
        "**/*.yaml",
        "**/pom.xml",
        "**/build.gradle",
        "**/build.gradle.kts",
        "**/settings.gradle",
        "**/settings.gradle.kts",
        "**/README.md",
        "**/README",
        "**/*.md",
    ]
    exclude_dirs = {".git", "target", "build", ".gradle", ".idea", ".vscode"}

    def should_skip(p: Path) -> bool:
        try:
            parts = set(p.parts)
        except Exception:
            return False
        return any(d in parts for d in exclude_dirs)

    docs: list[Document] = []
    max_size_bytes = 2 * 1024 * 1024  # 2MB per file

    for pattern in include_globs:
        for f in root.glob(pattern):
            if not f.is_file():
                continue
            if should_skip(f):
                continue
            try:
                if f.stat().st_size > max_size_bytes:
                    continue
                text = f.read_text(encoding="utf-8", errors="ignore")
            except Exception as e:
                print(f"[collect_documents] Error reading file {f}: {e}")
                continue
            meta = {
                "path": str(f.resolve()),
                "name": f.name,
                "framework": framework,
                "language": "java" if f.suffix == ".java" else "text",
            }
            docs.append(Document(content=text, name=f.name, meta_data=meta))

    return docs

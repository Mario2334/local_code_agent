from __future__ import annotations

import json
from typing import List, Optional

from pydantic import BaseModel, Field, ValidationError


class PlanStep(BaseModel):
    id: int = Field(description="Step number starting at 1")
    title: str = Field(description="Short action/title for the step")
    description: Optional[str] = Field(default="", description="Detailed explanation of the step")
    files: List[str] = Field(default_factory=list, description="Relevant files/paths to touch or review")
    commands: List[str] = Field(default_factory=list, description="CLI commands or scripts to run")
    validation: List[str] = Field(default_factory=list, description="Checks/tests to validate the step")
    notes: Optional[str] = Field(default=None, description="Extra notes or edge cases")


class PlanResponse(BaseModel):
    version: str = Field(default="1.0", description="Schema version")
    detail: Optional[str] = Field(default=None, description="brief|normal|detailed or other hint")
    steps: List[PlanStep] = Field(description="Ordered list of plan steps")


def extract_json(text: str) -> str:
    """Attempt to extract the first valid JSON object from a possibly noisy string.

    Strategy:
    - If fenced code blocks with json exist, prioritize the first.
    - Else, take substring from the first '{' to the last '}' and try to parse.
    - Raise ValueError if no JSON could be extracted.
    """
    if not text:
        raise ValueError("Empty text; cannot extract JSON")

    # Prefer fenced code blocks
    fences = ["```json", "```JSON", "```"]
    start_idx = -1
    for fence in fences:
        idx = text.find(fence)
        if idx != -1:
            start_idx = idx + len(fence)
            end_idx = text.find("```", start_idx)
            if end_idx != -1:
                candidate = text[start_idx:end_idx].strip()
                try:
                    json.loads(candidate)
                    return candidate
                except Exception:
                    pass
    # Fallback: braces scan
    first = text.find("{")
    last = text.rfind("}")
    if first != -1 and last != -1 and last > first:
        candidate = text[first : last + 1]
        # Attempt quick sanity parse
        try:
            json.loads(candidate)
            return candidate
        except Exception:
            pass

    raise ValueError("No JSON object found in text")


def parse_plan_response(raw: str) -> PlanResponse:
    """Parse raw LLM output into PlanResponse using Pydantic.

    This function extracts JSON if there is extra text, validates against the
    schema, and returns a typed PlanResponse.
    """
    try:
        data_str = extract_json(raw)
        data = json.loads(data_str)
        return PlanResponse.model_validate(data)
    except (ValidationError, ValueError, json.JSONDecodeError) as e:
        raise ValueError(f"Failed to parse plan response: {e}")

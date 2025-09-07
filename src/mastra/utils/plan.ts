import { z } from 'zod';

// TypeScript/Zod equivalents of the Python Pydantic models
export const PlanStepSchema = z.object({
  id: z.number().int().describe('Step number starting at 1'),
  title: z.string().describe('Short action/title for the step'),
  description: z.string().optional().default('').describe('Detailed explanation of the step'),
  files: z.array(z.string()).default([]).describe('Relevant files/paths to touch or review'),
  commands: z.array(z.string()).default([]).describe('CLI commands or scripts to run'),
  validation: z.array(z.string()).default([]).describe('Checks/tests to validate the step'),
  notes: z.string().nullable().optional().describe('Extra notes or edge cases'),
});

export type PlanStep = z.infer<typeof PlanStepSchema>;

export const PlanResponseSchema = z.object({
  version: z.string().default('1.0').describe('Schema version'),
  detail: z.string().nullable().optional().describe('brief|normal|detailed or other hint'),
  steps: z.array(PlanStepSchema).describe('Ordered list of plan steps'),
});

export type PlanResponse = z.infer<typeof PlanResponseSchema>;

/**
 * Build the planning prompt that instructs the LLM to return a strict JSON plan.
 * Mirrors the Python build_plan_prompt behavior from the issue description.
 */
export function buildPlanPrompt(userRequest: string, detail?: string): string {
  const effectiveDetail = (detail || process.env.PLAN_DETAIL || 'normal').toString().toLowerCase();
  const detailInstructions =
    effectiveDetail === 'brief'
      ? 'Keep the plan to 5-8 concise steps.'
      : effectiveDetail === 'detailed'
      ? 'Provide 10-20 steps; include file paths, function names, and validation checks.'
      : 'Aim for 7-12 steps with clear, short descriptions.';

  const schemaHint =
    'Return ONLY valid JSON with this shape:\n' +
    '{\n' +
    '  "version": "1.0",\n' +
    '  "detail": "brief|normal|detailed",\n' +
    '  "steps": [\n' +
    '    {\n' +
    '      "id": 1,\n' +
    '      "title": "Short title",\n' +
    '      "description": "What to do",\n' +
    '      "files": ["path/file.ext"],\n' +
    '      "commands": ["cli command"],\n' +
    '      "validation": ["how to verify"],\n' +
    '      "notes": "optional"\n' +
    '    }\n' +
    '  ]\n' +
    '}\n' +
    'Do not include any commentary before or after the JSON.';

  return (
    'You are a coding agent with access to a vector-backed knowledge base of the project code. ' +
    'Your task is to produce a step-by-step implementation plan that uses the existing codebase.\n\n' +
    'Requirements for the plan:\n' +
    '- Be specific and reference relevant files and directories by path when possible.\n' +
    '- Include minimal, safe changes first; note any config, env, or dependency updates.\n' +
    '- Anticipate edge cases and note validation or tests to run.\n' +
    '- Keep changes minimal to satisfy the user\'s request.\n' +
    `- ${detailInstructions}\n\n` +
    `Output detail level: ${effectiveDetail}.\n\n` +
    `User request:\n${userRequest}\n\n` +
    schemaHint
  );
}

/**
 * Attempt to extract the first valid JSON object from a possibly noisy string.
 * Strategy:
 * - If fenced code blocks with json exist, prioritize the first.
 * - Else, take substring from the first '{' to the last '}' and try to parse.
 * - Throw if no JSON could be extracted.
 */
export function extractJson(text: string): string {
  if (!text) throw new Error('Empty text; cannot extract JSON');

  const fences = ['```json', '```JSON', '```'];
  for (const fence of fences) {
    const idx = text.indexOf(fence);
    if (idx !== -1) {
      const startIdx = idx + fence.length;
      const endIdx = text.indexOf('```', startIdx);
      if (endIdx !== -1) {
        const candidate = text.slice(startIdx, endIdx).trim();
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          // try next option
        }
      }
    }
  }

  // Fallback: braces scan
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    const candidate = text.slice(first, last + 1);
    try {
      JSON.parse(candidate);
      return candidate;
    } catch {
      // fallthrough
    }
  }

  throw new Error('No JSON object found in text');
}

/**
 * Parse raw LLM output into PlanResponse using Zod.
 * This function extracts JSON if there is extra text, validates against the
 * schema, and returns a typed PlanResponse.
 */
export function parsePlanResponse(raw: string): PlanResponse {
  try {
    const dataStr = extractJson(raw);
    const data = JSON.parse(dataStr);

    // zod: apply defaults for version/description/arrays
    const parsed = PlanResponseSchema.parse(data);

    // Ensure arrays default even if undefined (zod .default handles when missing, but
    // within nested objects provided but missing fields should be set)
    const normalizedSteps = parsed.steps.map((s) => ({
      id: s.id,
      title: s.title,
      description: s.description ?? '',
      files: s.files ?? [],
      commands: s.commands ?? [],
      validation: s.validation ?? [],
      notes: s.notes ?? null,
    }));

    return {
      version: parsed.version ?? '1.0',
      detail: parsed.detail ?? null,
      steps: normalizedSteps,
    };
  } catch (e: any) {
    throw new Error(`Failed to parse plan response: ${e?.message || String(e)}`);
  }
}

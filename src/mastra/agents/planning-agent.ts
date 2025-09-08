import { Agent } from '@mastra/core/agent';
import { openai } from '@ai-sdk/openai';
import { buildPlanPrompt } from '../utils/plan';
import {createVectorQueryTool} from "@mastra/rag";
import {CHROMA_PROMPT} from "@mastra/chroma";

/**
 * PlanningAgent: dedicated to producing strict JSON plans only.
 * It accepts a user task string and must return ONLY JSON as per the schema.
 */

const chromaQueryTool = createVectorQueryTool({
  vectorStoreName: "chroma",
  indexName: "code_agent",
  model: openai.embedding("text-embedding-3-small"),
});

export const planningAgent = new Agent({
  name: 'Planning Agent',
  instructions: `
You are a planning-only assistant. Your sole job is to output a strict JSON plan with no extra commentary.
- Do not include explanations, greetings, or code fences.
- Return ONLY valid JSON following the provided schema.
- Before planning, query the saved codebase using the chromaQueryTool to locate relevant files, functions, configs, and tests.
- Use 1-3 targeted queries; prefer precise filenames/paths and snippets from results to ground your plan.
- Be specific and reference files/paths where possible based on the retrieved context.
${CHROMA_PROMPT}
`,
  model: openai('gpt-5'),
  tools: {
    chromaQueryTool
  }
});

export async function generatePlanFromAgent(userTask: string, detail?: string): Promise<string> {
  const prompt = buildPlanPrompt(userTask, detail);
  // Similar defensive calling as in runner.ts, but dedicated to planningAgent
  const maybe: any = (await (planningAgent as any).run?.(prompt))
    ?? (await (planningAgent as any).generate?.(prompt))
    ?? (await (planningAgent as any).generate?.({ messages: [{ role: 'user', content: prompt }] }))
    ?? '';

  if (typeof maybe === 'string') return maybe;
  if (maybe && typeof maybe.text === 'string') return maybe.text;
  if (maybe && typeof maybe.output === 'string') return maybe.output;
  if (maybe && typeof maybe === 'object') return JSON.stringify(maybe);
  return String(maybe);
}

import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { parsePlanResponse, PlanResponseSchema } from '../utils/plan';

// Step that parses raw LLM output into a structured plan
const parsePlanStep = createStep({
  id: 'parse-plan-step',
  description: 'Parse LLM output into a structured PlanResponse',
  inputSchema: z.object({
    raw: z.string().describe('Raw LLM output that may contain text around a JSON plan'),
  }),
  outputSchema: PlanResponseSchema,
  execute: async ({ inputData }) => {
    if (!inputData?.raw) throw new Error('Missing input.raw');
    const plan = parsePlanResponse(inputData.raw);
    return plan;
  },
});

export const planningWorkflow = createWorkflow({
  id: 'planning',
  inputSchema: z.object({ raw: z.string() }),
  outputSchema: PlanResponseSchema,
}).then(parsePlanStep);

planningWorkflow.commit();

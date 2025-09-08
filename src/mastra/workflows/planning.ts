import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { parsePlanResponse, PlanResponseSchema } from '../utils/plan';
import { generatePlanFromAgent } from '../agents/planning-agent';

// Step that uses the PlanningAgent to generate a raw plan string
const generatePlanStep = createStep({
  id: 'generate-plan-step',
  description: 'Generate a raw JSON plan using the PlanningAgent',
  inputSchema: z.object({
    userTask: z.string().describe('User task/prompt to plan'),
    detail: z.string().optional().describe('brief|normal|detailed'),
  }),
  outputSchema: z.object({ raw: z.string() }),
  execute: async ({ inputData }) => {
    if (!inputData?.userTask) throw new Error('Missing input.userTask');
    const raw = await generatePlanFromAgent(inputData.userTask, inputData.detail);
    return { raw };
  },
});

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
  inputSchema: z.object({ userTask: z.string(), detail: z.string().optional() }),
  outputSchema: PlanResponseSchema,
})
  .then(generatePlanStep)
  .then(parsePlanStep);

planningWorkflow.commit();

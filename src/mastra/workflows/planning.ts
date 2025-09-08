import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { parsePlanResponse, PlanResponseSchema } from '../utils/plan';
import { generatePlanFromAgent } from '../agents/planning-agent';
import { executePlanStepOnce } from '../agents/execution-agent';

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

// Step that executes exactly one plan step (default: step 1)
const executePlanStep = createStep({
  id: 'execute-plan-step',
  description: 'Execute exactly one step of the parsed plan: run commands if provided, otherwise determine and perform necessary actions, then return progress',
  inputSchema: PlanResponseSchema,
  outputSchema: z.object({
    stepId: z.number().int().positive(),
    success: z.boolean(),
    commandResults: z.array(
      z.object({
        command: z.string(),
        code: z.number().nullable(),
        stdout: z.string(),
        stderr: z.string(),
        error: z.string().optional(),
      })
    ),
    nextStepId: z.number().int().positive().nullable(),
    done: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    // Default to executing step 1 within the planning workflow extension
    const res = await executePlanStepOnce({ plan: inputData, stepId: 1 });
    return {
      stepId: res.stepId,
      success: res.success,
      commandResults: res.commandResults,
      nextStepId: res.nextStepId,
      done: res.done,
    };
  },
});

export const planningWorkflow = createWorkflow({
  id: 'planning',
  inputSchema: z.object({ userTask: z.string(), detail: z.string().optional() }),
  outputSchema: z.object({
    stepId: z.number().int().positive(),
    success: z.boolean(),
    commandResults: z.array(
      z.object({
        command: z.string(),
        code: z.number().nullable(),
        stdout: z.string(),
        stderr: z.string(),
        error: z.string().optional(),
      })
    ),
    nextStepId: z.number().int().positive().nullable(),
    done: z.boolean(),
  }),
})
  .then(generatePlanStep)
  .then(parsePlanStep)
  .then(executePlanStep);

planningWorkflow.commit();

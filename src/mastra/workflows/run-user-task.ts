import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { runUserTask } from '../agents/runner';

// Step that runs the user task using the existing runner
const runUserTaskStep = createStep({
  id: 'run-user-task-step',
  description: 'Run Code Agent with optional planning mode and return result',
  inputSchema: z.object({
    userTask: z.string().describe('User task/prompt to send to the agent'),
    planMode: z.boolean().default(false).optional(),
    detail: z.string().optional().describe('Optional PLAN_DETAIL override: brief|normal|detailed'),
  }),
  outputSchema: z.object({
    mode: z.enum(['plan', 'normal']),
    raw: z.string(),
    parsed: z.unknown().optional(),
  }),
  execute: async ({ inputData }) => {
    if (!inputData?.userTask) throw new Error('Missing input.userTask');

    // Optionally honor detail override by setting env for this run
    const prevDetail = process.env.PLAN_DETAIL;
    if (inputData.detail) process.env.PLAN_DETAIL = inputData.detail;

    try {
      const res = await runUserTask(inputData.userTask, Boolean(inputData.planMode));
      return res;
    } finally {
      // Restore previous env value to avoid side-effects across runs
      if (inputData.detail !== undefined) {
        if (prevDetail === undefined) delete process.env.PLAN_DETAIL;
        else process.env.PLAN_DETAIL = prevDetail;
      }
    }
  },
});

export const runUserTaskWorkflow = createWorkflow({
  id: 'run-user-task',
  inputSchema: z.object({
    userTask: z.string(),
    planMode: z.boolean().default(false).optional(),
    detail: z.string().optional(),
  }),
  outputSchema: z.object({
    mode: z.enum(['plan', 'normal']),
    raw: z.string(),
    parsed: z.unknown().optional(),
  }),
}).then(runUserTaskStep);

runUserTaskWorkflow.commit();

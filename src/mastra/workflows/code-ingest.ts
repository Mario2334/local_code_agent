import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { collectCodeTool } from '../tools/code-collector';

const runCollect = createStep({
  id: 'collect-code-step',
  description: 'Collect code files and build index',
  inputSchema: z.object({
    root: z.string().describe('Path to codebase root'),
    framework: z.string().default('springboot').optional(),
  }),
  outputSchema: z.object({ indexedCount: z.number(), outFile: z.string() }),
  execute: async ({ inputData }) => {
    if (!inputData) throw new Error('Missing input');
    const res = await collectCodeTool.execute({
      context: {
        root: inputData.root,
        framework: inputData.framework ?? 'springboot',
      },
    } as any);
    return res as { indexedCount: number; outFile: string };
  },
});

export const codeIngestWorkflow = createWorkflow({
  id: 'code-ingest',
  inputSchema: z.object({ root: z.string(), framework: z.string().default('springboot').optional() }),
  outputSchema: z.object({ indexedCount: z.number(), outFile: z.string() }),
}).then(runCollect);

codeIngestWorkflow.commit();

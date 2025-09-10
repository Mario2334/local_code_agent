import { Agent } from '@mastra/core/agent';
import { z } from 'zod';
import path from 'path';
import { openai } from '@ai-sdk/openai';
import {PlanStep, PlanResponseSchema, PlanStepSchema} from '../utils/plan';
import { MCPClient } from '@mastra/mcp';

export type CommandResult = {
  command: string;
  code: number | null; // 0 for success, non-zero/null for errors/unknown
  stdout: string; // textual result or JSON string from tool
  stderr: string; // error text if any
  error?: string;
};

export type StepExecutionResult = {
  step: PlanStep;
  stepId: number;
  commandResults: CommandResult[];
  success: boolean;
  nextStepId: number | null;
  done: boolean;
};

export const StepExecutionInputSchema = z.object({
  planStep: PlanStepSchema,
  cwd: z.string().optional().describe('Working directory for MCP filesystem root'),
  env: z.record(z.string()).optional().describe('Additional environment variables (reserved)'),
});

export type StepExecutionInput = z.infer<typeof StepExecutionInputSchema>;

async function createExecutionAgent(cwd: string) {
  // Create an MCP client rooted at the provided cwd
  const mcp = new MCPClient({
    id: `execution-agent:${cwd}:${typeof process !== 'undefined' ? process.pid : 'nopid'}:${Date.now()}:${Math.random().toString(36).slice(2)}`,
    servers: {
      "cli-mcp-server": {
        "command": "uvx",
        "args": [
          "cli-mcp-server"
        ],
        "env": {
          "ALLOWED_DIR": cwd,
          "ALLOWED_COMMANDS": "all",
          "ALLOWED_FLAGS": "all",
        }
      }
    },
  });

  const tools = await mcp.getTools();

  // Create a fresh agent instance bound to the tools for this cwd
  const agent = new Agent({
    name: 'Execution Agent (MCP)',
    instructions: `
You are an execution agent. Execute exactly one given plan step by using the MCP Command-Line tools only.
Rules:
- If the step provides commands, execute only those commands via the CLI MCP tool (never the local shell directly).
- If the step provides no commands, first determine what needs to be done in this step based on its description, relevant files, and validations, then perform the necessary actions using MCP tools. Prefer safe, minimal changes and explain briefly what you did.
- Before executing, validate paths and working directory; stay within the allowed directory.
- Prefer safe flags (e.g., --dry-run, --check) when applicable; avoid destructive operations unless explicitly required by the step.
- Make minimal, safe changes required by the step and confirm results where possible.
- Return a brief final summary of what commands were executed or actions performed and key outputs; avoid verbose explanations.
`,
    model: openai('gpt-5-mini'),
    tools,
  });

  return { agent, mcp };
}

/**
 * Execute one plan step by delegating to the Execution Agent LLM with MCP tools.
 * The LLM will decide which tools to call to apply the step's changes.
 */
export async function executePlanStepOnce(input: StepExecutionInput): Promise<StepExecutionResult> {
  const { planStep } = input;
  const cwd = "/Users/sanket/projects/pakama/pakama_be";

  const step = planStep;

  // Build a concise instruction for the agent
  const filesList = (step.files || []).map((f) => `- ${f}`).join('\n');
  const validations = (step.validation || []).map((v) => `- ${v}`).join('\n');
  const hasCommands = (step.commands || []).length > 0;
  const commandsHint = hasCommands
    ? `Commands to execute (run via MCP CLI tools only; do not use the local shell):\n${step.commands.map((c) => `- ${c}`).join('\n')}`
    : `No explicit commands provided for this step. Using MCP tools, first determine exactly what needs to be done based on the description and relevant files, then perform the minimal required actions safely. Prefer non-destructive options and summarize what you changed.`;

  const userMessage = `Execute plan step ${step.id}: ${step.title}\n\nDescription:\n${step.description || ''}\n\nRelevant files (may not exist yet):\n${filesList || '- (unspecified)'}\n\n${commandsHint}\n\nValidation goals (post-change checks you should consider):\n${validations || '- (none specified)'}\n\nUse only the MCP CLI tools to run commands within the allowed directory. Be safe and minimal. If changes are made, summarize them and the command outputs briefly.`;

  // Logging: commands being passed to MCP server
  if (hasCommands) {
    try {
      console.log(`[MCP][executePlanStep] Step ${step.id} commands ->`, step.commands);
    } catch {}
  } else {
    try {
      console.log(`[MCP][executePlanStep] Step ${step.id} has no explicit commands; agent will determine actions via MCP tools.`);
    } catch {}
  }

  let resultText = '';
  let success = true;
  let errorMsg: string | undefined = undefined;

  let mcp: MCPClient | undefined;
  try {
    const created = await createExecutionAgent(cwd);
    const { agent } = created;
    mcp = created.mcp;

    // Try common Mastra Agent call shapes defensively
    const maybe: any = (await (agent as any).run?.(userMessage))
      ?? (await (agent as any).generate?.(userMessage))
      ?? (await (agent as any).generate?.({ messages: [{ role: 'user', content: userMessage }] }))
      ?? '';

    if (typeof maybe === 'string') resultText = maybe;
    else if (maybe && typeof maybe.text === 'string') resultText = maybe.text;
    else if (maybe && typeof maybe.output === 'string') resultText = maybe.output;
    else if (maybe && typeof maybe === 'object') resultText = JSON.stringify(maybe);
    else resultText = String(maybe);
  } catch (e: any) {
    success = false;
    errorMsg = e?.message ? String(e.message) : 'Execution agent failed';
    resultText = '';
  } finally {
    try {
      if (mcp && typeof (mcp as any).disconnect === 'function') {
        await (mcp as any).disconnect();
      }
    } catch {
      // ignore disconnect errors
    }
  }

  // Logging: output returned by MCP/agent execution
  try {
    console.log(`[MCP][executePlanStep] Step ${step.id} output <-`, success ? resultText : (errorMsg || ''));
  } catch {}

  const commandResults: CommandResult[] = [
    {
      command: `llm-mcp-execute-step-${planStep.id}`,
      code: success ? 0 : null,
      stdout: resultText,
      stderr: success ? '' : (errorMsg || ''),
      error: errorMsg,
    },
  ];

  return {
    step,
    commandResults,
    success
  };
}

import { codeAgent } from './code-agent';
import { buildPlanPrompt, parsePlanResponse } from '../utils/plan';

/**
 * Run the Code Agent with an optional planning mode.
 * - When planMode is true, wraps the user's task in a planning prompt and
 *   expects strict JSON output that will be parsed and logged.
 * - When false, sends the raw task to the agent and logs the response.
 */
export async function runUserTask(userTask: string, planMode: boolean): Promise<{ mode: 'plan'|'normal'; raw: string; parsed?: unknown }> {
  const detail = (process.env.PLAN_DETAIL || 'normal').toString();
  const effectivePrompt = planMode ? buildPlanPrompt(userTask, detail) : userTask;

  let resultText = '';

  try {
    // Mastra Agent API: try common shapes defensively
    // Avoid passing an invalid shape like { prompt: ... } which can be misinterpreted
    const maybe = await (codeAgent as any).run?.(effectivePrompt)
      ?? await (codeAgent as any).generate?.(effectivePrompt)
      ?? await (codeAgent as any).generate?.({ messages: [{ role: 'user', content: effectivePrompt }] })
      ?? '';

    if (typeof maybe === 'string') {
      resultText = maybe;
    } else if (maybe && typeof maybe.text === 'string') {
      resultText = maybe.text;
    } else if (maybe && typeof maybe.output === 'string') {
      resultText = maybe.output;
    } else if (maybe && typeof maybe === 'object') {
      resultText = JSON.stringify(maybe);
    } else {
      resultText = String(maybe);
    }

    if (planMode) {
      try {
        const planObj = parsePlanResponse(resultText);
        // mirror the logging style shown in issue description
        console.log('[agent:plan:json]', JSON.stringify(planObj, null, 2));
        return { mode: 'plan', raw: resultText, parsed: planObj };
      } catch (parseErr: any) {
        console.log('[agent:plan:parse_error]', parseErr?.message || String(parseErr));
        console.log('[agent:raw]', resultText);
        return { mode: 'plan', raw: resultText };
      }
    } else {
      console.log('[agent:result]', resultText);
      return { mode: 'normal', raw: resultText };
    }
  } catch (e: any) {
    console.log('[agent:error]', e?.message || String(e));
    return { mode: planMode ? 'plan' : 'normal', raw: '' };
  }
}

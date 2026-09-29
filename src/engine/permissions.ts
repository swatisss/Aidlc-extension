import type { StageDef } from '../shared/types';
import type { StageHost } from './runner';

type PermissionResult =
  | { behavior: 'allow'; updatedInput?: Record<string, unknown> }
  | { behavior: 'deny'; message: string };

/**
 * Builds the SDK canUseTool callback. Tools in the stage's `tools` list are
 * auto-approved by the SDK before this is consulted, so anything reaching
 * here is outside the stage's allowance and goes to the human.
 */
export function makeCanUseTool(stage: StageDef, host: StageHost) {
  return async (toolName: string, input: Record<string, unknown>): Promise<PermissionResult> => {
    if (stage.deny?.includes(toolName)) {
      return { behavior: 'deny', message: `${toolName} is not permitted in the "${stage.name}" stage.` };
    }
    const ok = await host.requestPermission(toolName, input);
    return ok
      ? { behavior: 'allow', updatedInput: input }
      : { behavior: 'deny', message: `The user declined ${toolName}. Adjust your approach or ask via ask_user_question.` };
  };
}

import type { PromptModeManager } from '../prompt-mode/index.js';

function createInternalAgentTextPart(text: string) {
  return { type: 'text' as const, text };
}

export function createModeCommandHandler(modeManager: PromptModeManager) {
  const COMMAND_NAMES = ['ol-light', 'ol-heavy', 'ol-turbo'];

  async function handleCommandExecuteBefore(
    input: { command: string; sessionID: string; arguments: string },
    output: { parts: Array<{ type: string; text?: string }> },
  ): Promise<void> {
    if (!COMMAND_NAMES.includes(input.command)) {
      return;
    }

    // Clear template to bypass LLM (direct execution)
    output.parts.length = 0;

    const mode = input.command.replace('ol-', '') as 'light' | 'heavy' | 'turbo';
    const success = modeManager.setMode(mode, input.sessionID);

    if (!success) {
      output.parts.push(
        createInternalAgentTextPart(
          'Mode switching is disabled in configuration (promptMode.allowModeSwitch = false)',
        ),
      );
      return;
    }

    const modeDescriptions = {
      light: 'Light mode (OMOS 200-300 lines): Detailed delegation, parallel execution, session reuse',
      heavy: 'Heavy mode (Omo 542 lines): Phase 0-3 workflow, failure recovery, evidence-driven',
      turbo: 'Turbo mode (OLD-2 58 lines): "KEEP GOING" philosophy, fast execution',
    };

    output.parts.push(
      createInternalAgentTextPart(
        `✓ Switched to ${mode} mode\n\n${modeDescriptions[mode]}`,
      ),
    );
  }

  function registerCommand(opencodeConfig: Record<string, unknown>): void {
    if (!opencodeConfig.command) {
      opencodeConfig.command = {};
    }

    const commands = opencodeConfig.command as Record<string, unknown>;

    commands['ol-light'] = {
      template: 'Switch to light prompt mode',
      description: 'Switch to light mode (OMOS-based, 200-300 lines)',
    };

    commands['ol-heavy'] = {
      template: 'Switch to heavy prompt mode',
      description: 'Switch to heavy mode (Omo-based, 542 lines)',
    };

    commands['ol-turbo'] = {
      template: 'Switch to turbo prompt mode',
      description: 'Switch to turbo mode (OLD-2-based, 58 lines)',
    };
  }

  return { handleCommandExecuteBefore, registerCommand };
}

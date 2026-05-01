/**
 * Context handoff packet - structured work-memory transfer from main agent to sub-agents
 * 
 * Enables efficient sub-agent delegation by providing:
 * - Task summary and user intent
 * - Constraints and prior findings
 * - Read artifacts and relevant paths
 * - Open questions and what not to repeat
 */

export interface ContextHandoffPacket {
  /** Brief summary of the task being delegated */
  task_summary: string;
  
  /** Original user intent (what the user actually wants) */
  user_intent: string;
  
  /** Explicit constraints from user or context */
  constraints: string[];
  
  /** Key findings from prior exploration/research */
  prior_findings: string[];
  
  /** Files/artifacts already read by main agent */
  read_artifacts: Array<{
    path: string;
    lineCount?: number;
    summary?: string;
  }>;
  
  /** Relevant file paths or directories for this task */
  relevant_paths: string[];
  
  /** Open questions that need answering */
  open_questions: string[];
  
  /** Things the sub-agent should NOT repeat */
  do_not_repeat: string[];
  
  /** Optional: Session ID of parent for context continuity */
  parent_session_id?: string;
  
  /** Optional: Timestamp of handoff */
  created_at?: number;
}

/**
 * Format handoff packet as prompt text for injection into delegation
 */
export function formatHandoffPacket(packet: ContextHandoffPacket): string {
  const sections: string[] = [
    '<context-handoff>',
    '',
    '## Task Summary',
    packet.task_summary,
    '',
    '## User Intent',
    packet.user_intent,
  ];

  if (packet.constraints.length > 0) {
    sections.push('', '## Constraints');
    for (const constraint of packet.constraints) {
      sections.push(`- ${constraint}`);
    }
  }

  if (packet.prior_findings.length > 0) {
    sections.push('', '## Prior Findings');
    for (const finding of packet.prior_findings) {
      sections.push(`- ${finding}`);
    }
  }

  if (packet.read_artifacts.length > 0) {
    sections.push('', '## Already Read');
    for (const artifact of packet.read_artifacts) {
      const summary = artifact.summary ? ` - ${artifact.summary}` : '';
      const lines = artifact.lineCount ? ` (${artifact.lineCount} lines)` : '';
      sections.push(`- ${artifact.path}${lines}${summary}`);
    }
  }

  if (packet.relevant_paths.length > 0) {
    sections.push('', '## Relevant Paths');
    for (const path of packet.relevant_paths) {
      sections.push(`- ${path}`);
    }
  }

  if (packet.open_questions.length > 0) {
    sections.push('', '## Open Questions');
    for (const question of packet.open_questions) {
      sections.push(`- ${question}`);
    }
  }

  if (packet.do_not_repeat.length > 0) {
    sections.push('', '## Do Not Repeat');
    for (const item of packet.do_not_repeat) {
      sections.push(`- ${item}`);
    }
  }

  sections.push('', '</context-handoff>');

  return sections.join('\n');
}

/**
 * Create a minimal handoff packet from basic info
 */
export function createHandoffPacket(
  taskSummary: string,
  userIntent: string,
  options?: Partial<Omit<ContextHandoffPacket, 'task_summary' | 'user_intent'>>,
): ContextHandoffPacket {
  return {
    task_summary: taskSummary,
    user_intent: userIntent,
    constraints: options?.constraints ?? [],
    prior_findings: options?.prior_findings ?? [],
    read_artifacts: options?.read_artifacts ?? [],
    relevant_paths: options?.relevant_paths ?? [],
    open_questions: options?.open_questions ?? [],
    do_not_repeat: options?.do_not_repeat ?? [],
    parent_session_id: options?.parent_session_id,
    created_at: options?.created_at ?? Date.now(),
  };
}

/**
 * Persist handoff packet to project runtime directory
 */
export function persistHandoffPacket(
  packet: ContextHandoffPacket,
  runtimeDir: string,
): string {
  const fs = require('node:fs');
  const path = require('node:path');
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `handoff-${timestamp}.json`;
  const filepath = path.join(runtimeDir, 'handoffs', filename);
  
  fs.mkdirSync(path.dirname(filepath), { recursive: true });
  fs.writeFileSync(filepath, JSON.stringify(packet, null, 2), 'utf-8');
  
  return filepath;
}

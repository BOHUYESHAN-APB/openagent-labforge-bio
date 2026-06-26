// Team mailbox poll
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getTeamMailboxDir } from '../team-registry/paths';
import type { Message } from '../types';

export async function pollMessages(
  teamName: string,
  recipientName: string,
): Promise<Message[]> {
  try {
    const mailboxDir = getTeamMailboxDir(teamName);
    const recipientFile = join(mailboxDir, `${recipientName}.jsonl`);
    const content = await readFile(recipientFile, 'utf-8');
    const lines = content
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
    return lines.map((line) => JSON.parse(line) as Message);
  } catch {
    return [];
  }
}

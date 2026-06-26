// Team mailbox send
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { getTeamMailboxDir } from '../team-registry/paths';
import type { Message } from '../types';

export async function sendMessage(
  teamName: string,
  to: string,
  from: string,
  body: string,
  kind: Message['kind'] = 'message',
): Promise<Message> {
  const message: Message = {
    version: 1,
    messageId: crypto.randomUUID(),
    from,
    to,
    kind,
    body,
    timestamp: Date.now(),
  };

  const mailboxDir = getTeamMailboxDir(teamName);
  await mkdir(mailboxDir, { recursive: true });

  const recipientFile = join(mailboxDir, `${to}.jsonl`);
  await appendFile(recipientFile, JSON.stringify(message) + '\n');

  return message;
}

// Team tasklist
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { getTeamTasklistPath } from '../team-registry/paths';
import type { Task } from '../types';

export async function createTask(
  teamName: string,
  subject: string,
  description: string,
): Promise<Task> {
  const task: Task = {
    version: 1,
    id: crypto.randomUUID(),
    subject,
    description,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    blocks: [],
    blockedBy: [],
  };

  const tasklistPath = getTeamTasklistPath(teamName);
  const { dirname } = await import('node:path');
  await mkdir(dirname(tasklistPath), { recursive: true });
  await appendFile(tasklistPath, JSON.stringify(task) + '\n');

  return task;
}

export async function listTasks(teamName: string): Promise<Task[]> {
  try {
    const tasklistPath = getTeamTasklistPath(teamName);
    const content = await readFile(tasklistPath, 'utf-8');
    const lines = content
      .trim()
      .split('\n')
      .filter((line) => line.length > 0);
    return lines.map((line) => JSON.parse(line) as Task);
  } catch {
    return [];
  }
}

export async function updateTaskStatus(
  teamName: string,
  taskId: string,
  status: Task['status'],
  owner?: string,
): Promise<Task | null> {
  const tasks = await listTasks(teamName);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;

  task.status = status;
  task.updatedAt = Date.now();
  if (owner) task.owner = owner;
  if (status === 'claimed') task.claimedAt = Date.now();

  const tasklistPath = getTeamTasklistPath(teamName);
  await writeFile(
    tasklistPath,
    tasks.map((t) => JSON.stringify(t)).join('\n') + '\n',
  );

  return task;
}

export async function getTask(
  teamName: string,
  taskId: string,
): Promise<Task | null> {
  const tasks = await listTasks(teamName);
  return tasks.find((t) => t.id === taskId) ?? null;
}

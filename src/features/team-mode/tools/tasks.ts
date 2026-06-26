// Team tools tasks
import {
  createTask,
  getTask,
  listTasks,
  updateTaskStatus,
} from '../team-tasklist/index';
import type { Task } from '../types';

export async function teamTaskCreate(
  teamName: string,
  subject: string,
  description: string,
): Promise<Task> {
  return createTask(teamName, subject, description);
}

export async function teamTaskList(teamName: string): Promise<Task[]> {
  return listTasks(teamName);
}

export async function teamTaskUpdate(
  teamName: string,
  taskId: string,
  status: Task['status'],
  owner?: string,
): Promise<Task | null> {
  return updateTaskStatus(teamName, taskId, status, owner);
}

export async function teamTaskGet(
  teamName: string,
  taskId: string,
): Promise<Task | null> {
  return getTask(teamName, taskId);
}

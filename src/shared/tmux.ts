// Stub module - TODO: implement from upstream oh-my-openagent
export function isInsideTmux(): boolean {
  return false;
}
export function getTmuxPaneId(): string {
  return '';
}
export function sendTmuxCommand(command: string): Promise<void> {
  return Promise.resolve();
}

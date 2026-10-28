import * as vscode from 'vscode';

let channel: vscode.LogOutputChannel | undefined;

/** The "CloudWatch Logs" output channel: what each query did and how long each step took. */
export function output(): vscode.LogOutputChannel {
  channel ??= vscode.window.createOutputChannel('CloudWatch Logs', { log: true });
  return channel;
}

export function disposeOutput() {
  channel?.dispose();
  channel = undefined;
}

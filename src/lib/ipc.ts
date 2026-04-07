import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import { listen as tauriListen, emit as tauriEmit } from '@tauri-apps/api/event';

export async function invoke(cmd: string, args: Record<string, any> = {}): Promise<any> {
  return tauriInvoke(cmd, args);
}

export async function listen(event: string, handler: (payload: any) => void): Promise<() => void> {
  return tauriListen(event, (e) => handler(e.payload));
}

export async function emit(event: string, payload?: any): Promise<void> {
  return tauriEmit(event, payload);
}

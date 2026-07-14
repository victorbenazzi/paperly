import { usingMockIpc } from "./ipc";

export type AppEventHandler<T> = (payload: T) => void;
export type UnlistenFn = () => void;

const mockListeners = new Map<string, Set<AppEventHandler<unknown>>>();

/** Event transport shared by Tauri and the browser development runtime. */
export async function listenAppEvent<T>(
  eventName: string,
  handler: AppEventHandler<T>,
): Promise<UnlistenFn> {
  if (usingMockIpc) {
    const listeners = mockListeners.get(eventName) ?? new Set<AppEventHandler<unknown>>();
    listeners.add(handler as AppEventHandler<unknown>);
    mockListeners.set(eventName, listeners);
    return () => listeners.delete(handler as AppEventHandler<unknown>);
  }

  const { listen } = await import("@tauri-apps/api/event");
  return listen<T>(eventName, (event) => handler(event.payload));
}

export function emitMockAppEvent<T>(eventName: string, payload: T): void {
  if (!usingMockIpc) return;
  for (const listener of mockListeners.get(eventName) ?? []) listener(payload);
}

import type { ExtensionMessage, ExtensionResponse } from './messages.js';

export async function sendMessage<T extends ExtensionResponse = ExtensionResponse>(
  message: ExtensionMessage,
): Promise<T> {
  return (await chrome.runtime.sendMessage(message)) as T;
}

export async function sendTabMessage(
  tabId: number,
  message: ExtensionMessage,
): Promise<unknown> {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch {
    return undefined;
  }
}

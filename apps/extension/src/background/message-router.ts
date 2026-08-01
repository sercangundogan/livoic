import type { ExtensionMessage, ExtensionResponse } from '../shared/messages.js';
import type { SessionController } from './session-controller.js';

export function createMessageRouter(controller: SessionController) {
  return function handleMessage(
    message: ExtensionMessage,
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: ExtensionResponse) => void,
  ): boolean {
    void (async () => {
      try {
        switch (message.type) {
          case 'popup.getState':
          case 'popup.detectPage': {
            const snapshot = await controller.detectActiveTab();
            const settings = await controller.getSettings();
            sendResponse({ ok: true, snapshot, settings });
            break;
          }
          case 'popup.start': {
            const snapshot = await controller.start(message.targetLanguage);
            const settings = await controller.getSettings();
            sendResponse({ ok: true, snapshot, settings });
            break;
          }
          case 'popup.stop': {
            const snapshot = await controller.stop();
            const settings = await controller.getSettings();
            sendResponse({ ok: true, snapshot, settings });
            break;
          }
          case 'popup.updateSettings': {
            const settings = await controller.updateSettings(message.settings);
            sendResponse({ ok: true, snapshot: controller.getSnapshot(), settings });
            break;
          }
          case 'offscreen.status': {
            await controller.handleOffscreenStatus(message.status, message.message);
            sendResponse({ ok: true });
            break;
          }
          case 'offscreen.serverEvent': {
            await controller.handleServerEvent(message.event);
            sendResponse({ ok: true });
            break;
          }
          case 'offscreen.error': {
            await controller.handleOffscreenStatus('error', message.message);
            sendResponse({ ok: true });
            break;
          }
          case 'offscreen.start':
          case 'offscreen.stop':
          case 'offscreen.streamContext': {
            // Handled exclusively by the offscreen document
            break;
          }
          case 'content.streamContext': {
            await controller.handleStreamContextUpdate(message.streamContext);
            sendResponse({ ok: true });
            break;
          }
          case 'content.pageInfo': {
            sendResponse({ ok: true });
            break;
          }
          case 'dev.ping': {
            sendResponse({ ok: true });
            break;
          }
          default:
            sendResponse({ ok: true });
        }
      } catch (error) {
        sendResponse({
          ok: false,
          error: {
            code: 'UNKNOWN_ERROR',
            message: error instanceof Error ? error.message : 'Unknown error',
            recoverable: true,
          },
        });
      }
    })();
    return true;
  };
}

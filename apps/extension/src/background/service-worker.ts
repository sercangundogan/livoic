import { SessionController } from './session-controller.js';
import { createMessageRouter } from './message-router.js';

const controller = new SessionController();
const ready = controller.init();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void ready.then(() => {
    createMessageRouter(controller)(message, sender, sendResponse);
  });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void ready.then(() => controller.handleTabRemoved(tabId));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  void ready.then(() => controller.handleTabUpdated(tabId, changeInfo));
});

chrome.runtime.onInstalled.addListener(() => {
  console.info('[live-translator] installed');
});

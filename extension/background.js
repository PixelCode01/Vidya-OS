// background.js is kept minimal in MV3 - most logic lives in popup.js.
// This service worker exists so Chrome registers the extension correctly.

chrome.runtime.onInstalled.addListener(() => {
  console.log("Vidya-OS installed.");
});

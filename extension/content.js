// content.js runs inside the YouTube page context.
// The popup can't directly access the DOM of the active tab,
// so it sends a message here and we reply with the video data.

chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.type !== "GET_VIDEO_CONTEXT") return;

  const video = document.querySelector("video");
  const rawSeconds = video ? Math.floor(video.currentTime) : 0;

  const minutes = Math.floor(rawSeconds / 60);
  const seconds = rawSeconds % 60;
  const timestamp = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "00")}`;

  sendResponse({
    videoTitle: document.title.replace(" - YouTube", "").trim(),
    timestamp,
  });

  // Return true to keep the message channel open for async responses
  return true;
});

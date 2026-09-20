// content.js - runs inside the YouTube page.
// popup.js calls this via chrome.scripting.executeScript
// and gets back the current video title and timestamp.

function getVideoContext() {
  const video = document.querySelector("video");
  const rawSeconds = video ? Math.floor(video.currentTime) : 0;
  const minutes = Math.floor(rawSeconds / 60);
  const seconds = rawSeconds % 60;
  const timestamp = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

  return {
    videoTitle: document.title.replace(" - YouTube", "").trim(),
    timestamp,
  };
}

// executeScript runs this file and returns the last expression value.
getVideoContext();

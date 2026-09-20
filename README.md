# Vidya-OS

A Chrome extension that turns YouTube into an LMS for engineering students. It tracks your semester syllabus and lets you ask Gemini AI questions about whatever lecture you're watching — it screenshots the video frame automatically so you don't have to describe anything.

Built for the AWS Bharat Builds Hackathon.

---

## What it does

- Shows your syllabus progress as animated bars per subject
- Click any subject to expand all topics, mark them done or in progress
- Add new subjects and topics without touching any code
- Ask a question while watching a lecture — it captures the screen + timestamp and sends it to Gemini
- Everything runs locally, no cloud account needed to use it

---

## Tech stack

| Part | What |
|---|---|
| Backend | Python, FastAPI |
| AI | Google Gemini (`gemini-3.6-flash`) via `google-genai` SDK |
| AWS | **AWS SAM** + **Mangum** — backend is defined as a Serverless Function |
| Extension | Chrome Extension Manifest V3 |
| Storage | JSON file (no database) |

### AWS piece

The backend is not just a Flask app slapped on a server. It's wrapped with **Mangum**, which makes FastAPI speak the AWS Lambda event format. The `template.yaml` is a real **AWS SAM** template — `sam local start-api` runs it locally, and `sam deploy` puts it on Lambda + API Gateway with zero code changes. For the hackathon we run it locally, but the AWS wiring is real.

---

## Folder structure

```
vidya-os/
├── backend/
│   ├── main.py            # FastAPI app + Gemini + Mangum handler
│   ├── requirements.txt
│   ├── template.yaml      # AWS SAM template
│   └── mock_syllabus.json # Your syllabus data lives here
└── extension/
    ├── manifest.json
    ├── popup.html
    ├── popup.js
    ├── content.js
    ├── styles.css
    └── icons/
```

---

## Setup

### Requirements

- Python 3.11+
- Google Gemini API key — free at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- Chrome browser
- (Optional) AWS SAM CLI if you want to use `sam local start-api` instead of uvicorn directly

### 1. Clone the repo

```bash
git clone https://github.com/PixelCode01/Vidyaos.git
cd Vidyaos
```

### 2. Set up the backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 3. Start the server

```bash
GEMINI_API_KEY="your-key-here" uvicorn main:app --port 3000
```

If you have AWS SAM installed:

```bash
GEMINI_API_KEY="your-key-here" sam local start-api
```

Both run on port 3000. Keep this terminal open while using the extension.

### 4. Load the extension in Chrome

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select the `extension/` folder from this repo

The purple book icon will appear in your toolbar.

---

## Using it

**Progress tab** — shows all your subjects with completion bars. Click any card to expand and see individual topics. Hit ✓ to mark a topic done, ▶ to mark it in progress. The bar updates live.

**+ Add tab** — add a new subject with a name, total hours, and a list of topics (one per line). It appears immediately in the Progress tab and saves to `mock_syllabus.json`.

**Ask AI tab** — open a YouTube lecture, pause it at any slide, then type your question here. The extension takes a screenshot of your screen, grabs the video title and timestamp, and sends everything to Gemini. You get a 2-3 sentence answer that's specific to what's on screen.

---

## Editing your syllabus manually

If you want to pre-fill your subjects, edit `backend/mock_syllabus.json` directly. The format is straightforward — subjects have a name, total hours, and a list of topics each with a `status` of `completed`, `in_progress`, or `not_started`. Restart the server after editing.

---

## Deploying to AWS (production)

1. Add your Gemini key to AWS Secrets Manager or set it as a Lambda environment variable
2. Run `sam deploy --guided` from the `backend/` folder
3. Copy the API Gateway URL from the output
4. In `extension/popup.js`, change `API_BASE` from `http://127.0.0.1:3000` to your API Gateway URL
5. Reload the extension

That's it. The Mangum wrapper handles everything else.

---

## Known issues

- The Gemini API key in this repo's demo starts with `AQ.` which is not a standard API key format. Use a key from AI Studio that starts with `AIza` for best results.
- `sam local start-api` requires Docker to be installed and running.
- `captureVisibleTab` (the screenshot feature) needs the extension to have focus — if the popup closes before Gemini responds, reopen and ask again.

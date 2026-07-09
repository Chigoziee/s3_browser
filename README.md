# S3 Browser

A lightweight desktop app for browsing and downloading files from an S3 bucket. Built with Electron — runs on Windows and Mac with no server required.

## Features

- Browse folders and files in your S3 bucket
- Download individual files via a native save dialog
- Download entire folders as a zip archive with a progress indicator
- Credentials stored locally per machine — never bundled into the app

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) (v18 or later)
- AWS credentials with read access to your S3 bucket

### Install & Run

```bash
git clone https://github.com/Chigoziee/s3_browser.git
cd s3_browser
npm install
npm start
```

On first launch the app will ask for your AWS credentials. Enter them once and they're saved locally to your machine.

### AWS Credentials

You'll need:
- **Access Key ID** and **Secret Access Key** for an IAM user with `s3:GetObject` and `s3:ListBucket` on your bucket
- **Region** — e.g. `eu-west-1`
- **Bucket name**

Credentials are stored at `%APPDATA%\s3-browser\config.json` on Windows and `~/Library/Application Support/s3-browser/config.json` on Mac. They are never committed to this repo.

To update credentials later, click **Settings** in the app menu (or `Ctrl+,` / `Cmd+,`).

## Project Structure

```
s3_browser/
├── main.js               # Electron main process — IPC handlers, all AWS calls
├── preload.js            # contextBridge — secure bridge between main and renderer
├── start.js              # Cross-platform launcher (clears ELECTRON_RUN_AS_NODE)
├── renderer/
│   ├── index.html        # Main UI
│   ├── style.css
│   └── app.js            # Frontend logic (talks to main via window.api)
└── settings-window/
    ├── settings.html     # Credentials form
    └── settings.js
```

## Building Installers

```bash
npm run build:win   # produces dist/*.exe (Windows NSIS installer)
npm run build:mac   # produces dist/*.dmg (Mac installer)
```

Share the output installer directly with teammates — they just run it, no Node.js needed.

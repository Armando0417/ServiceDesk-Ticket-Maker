# ServiceDesk Ticket Maker

Local Ticket Generator tool and ManageEngine autofill extensions for the ServiceDesk workflow.

- Current release: `3.6.2026.731`
- UI display version: `3.6`
- Date: July 31st, 2026

> Author: Armando Cruz

## What is it?

This tool is intended to speed up the process of creating custom and good looking documentation for the tickets in
servicedesk.mmmhc.com

Originally it was just a way to streamline my template for making tickets but over time it evolved into the current structure.

## Layout

```text
server.ps1                 Local PowerShell HTTP server binded only to localhost (127.0.0.1:8080)
config.json                Runtime configuration and canonical version source
templates.json             Ticket presets and situation/process templates
web/
  index.html               Current Markdown and rich-text application shell
  index_legacy.html        Previous standard application shell
Edge_extension/            Standard focus-based autofill extension
Edge_extension_alt/        Optional automatic autofill extension
legacy/                    Archived pre-3.6 implementation and artifacts in case of rollbacks
```

Layout is pretty straight forward to use.

## Run the application

Requirements:

- Windows PowerShell 5.1 or newer
- Access to the corporate Active Directory environment
- The ActiveDirectory PowerShell module for AD lookups

> BEFORE RUNNING! Open the config.json in notepad and change the technician name to your name (and preferably your last name to better identify you)

To run the app, open a terminal window in the project directory:

```powershell
.\server.ps1
```

alternatively, right-click the server.ps1 file and click "run in powershell"

The server prints and opens the authenticated localhost URL. Use the complete URL containing the generated token. Run `.\server.ps1 -Verbose` to show full diagnostics in the console. Every diagnostic is also appended to `server.log`.

The current Markdown/rich-text shell opens automatically at `/`. The previous standard shell remains available at `/legacy`; its authenticated URL is printed in the server banner in case you may need to open it again.

## Install the Autofill extension

Choose only one extension at a time because both target the same ServiceDesk forms and WILL conflict:

- `Edge_extension` is the recommended focus-based extension. (RECOMMENDED)
- `Edge_extension_alt` is the optional automatic-fill alternative (nightly version).

Open `edge://extensions` or `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the desired extension folder.

## Runtime files

The following local files are intentionally excluded from source control:

- `block_template.txt` — created when the Template Editor saves a customized output block
- `server.log` — persistent diagnostics
- `current_user.json` — legacy/runtime user data (Deprecated)

Historical files are retained under `legacy/` for reference only.

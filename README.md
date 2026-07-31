# ServiceDesk Ticket Maker

Local Ticket Generator and ManageEngine autofill extensions for the ServiceDesk workflow.

Current release: `3.6.2026.731`

UI display version: `3.6`

## Release layout

```text
server.ps1                 Local PowerShell HTTP server
config.json                Runtime configuration and canonical version source
templates.json             Ticket presets and situation/process templates
web/
  index.html               Current Markdown and rich-text application shell
  index_legacy.html        Previous standard application shell
Edge_extension/            Standard focus-based autofill extension
Edge_extension_alt/        Optional automatic autofill extension
legacy/                    Archived pre-3.6 implementation and artifacts
```

## Run the application

Requirements:

- Windows PowerShell 5.1 or newer
- Access to the corporate Active Directory environment
- The ActiveDirectory PowerShell module for AD lookups

From the project directory:

```powershell
.\server.ps1
```

The server prints and opens the authenticated localhost URL. Use the complete URL containing the generated token. Run `.\server.ps1 -Verbose` to show full diagnostics in the console. Every diagnostic is also appended to `server.log`.

The current Markdown/rich-text shell opens automatically at `/`. The previous standard shell remains available at `/legacy`; its authenticated URL is printed in the server banner.

## Install an extension

Choose only one extension at a time because both target the same ServiceDesk forms:

- `Edge_extension` is the recommended focus-based extension.
- `Edge_extension_alt` is the optional automatic-fill alternative.

Open `edge://extensions` or `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select the desired extension folder.

## Runtime files

The following local files are intentionally excluded from source control:

- `block_template.txt` — created when the Template Editor saves a customized output block
- `server.log` — persistent diagnostics
- `response*.json` — downloaded ServiceDesk exports
- `current_user.json` — legacy/runtime user data

Historical files are retained under `legacy/` for reference only.

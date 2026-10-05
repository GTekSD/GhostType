# Firefox package

This directory contains the Firefox-specific Manifest V3 manifest and background script. The Firefox build uses Firefox's native sidebar; Chrome and Edge continue to use the root package and its Chromium side panel.

## Build

From PowerShell, run:

```powershell
.\firefox\build.ps1
```

The script creates `GhostType-GTekSD-v1.69-Firefox.zip` next to the project directory. It packages the shared panel, content script, styles, locales, and icons with the Firefox manifest and background script.

Before submitting, load the package's extracted directory temporarily in Firefox using `about:debugging` → **This Firefox** → **Load Temporary Add-on**, and test the toolbar action, sidebar, context-menu action, typing, stop control, and clipboard Paste.

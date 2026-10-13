# Microsoft Edge Add-ons package

The root extension targets Chromium browsers, including Microsoft Edge. Create the Edge Add-ons upload ZIP from PowerShell:

```powershell
.\edge\build.ps1
```

The script writes `GhostType-GTekSD-v3.69-Edge-Add-ons.zip` beside the project directory. It packages the shared extension files and removes Chrome-specific `key` and `update_url` manifest properties.

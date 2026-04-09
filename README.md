# Rewst Workflow Folders

A browser extension that adds folder organisation to the Rewst workflows list. Workflows are displayed as a flat list with no grouping by default — this fixes that by letting you create folders and assign workflows to them, with assignments stored locally in your browser.

Built for the Asia region (`app.rewst.asia`), but can be changed to any region. Vibecoded in a couple of hours, so treat it accordingly.

## Installing

You'll need to load it manually.

**Chrome or Edge:**

1. Open `chrome://extensions` or `edge://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `FolderExtension` folder
5. Navigate to your Rewst workflows page — the extension icon will become active

To update after pulling changes, click the refresh icon on the extension card and hard-refresh the Rewst tab (Ctrl+Shift+R).

If you are from another Rewst region that isn't asia, you must change the host permissions URL and the matches URL in the manifest.json file.

## Usage

Click the extension icon in your browser toolbar to open the folder manager. From there you can create folders, rename them, delete them, and switch between views (All, Unfoldered, or a specific folder).

Each workflow row gets a small folder icon button in the actions column. Click it to assign that workflow to a folder, or right-click any row for the same options. If you have multiple workflows checked, right-clicking will offer to assign them all at once.

Folder assignments are stored per organisation, so if you have access to multiple Rewst orgs they won't interfere with each other.

## Disclaimer

This project is not affiliated with, endorsed by, or supported by Rewst in any way. It is an independent tool built by a third party and has no official relationship with the Rewst platform or its developers.

Before installing any browser extension you should review the source code yourself. This extension requests access to `app.rewst.asia` (or whichever region you configure) and reads workflow data that is already rendered on the page. It does not make any API calls to Rewst, does not transmit any data externally, and stores everything locally in your browser. That said, you should verify this yourself rather than taking it on faith — the full source is in this repository.

This was a quick side project and comes with no warranty or guarantee of fitness for any purpose. It may break if Rewst updates their UI. Use it at your own risk.

## Backup & Sharing

The bottom of the folder manager has **Export** and **Import** buttons.

**Export** downloads a `.json` file containing your folder structure and workflow assignments for the current org. Do this before removing or reinstalling the extension, as local storage is wiped on uninstall.

**Import** loads a backup file. If the file was exported from the same org, folders and assignments are both restored. If it came from a different org (e.g. sharing a structure with a teammate), only the folders are imported — assignments are skipped since the workflow IDs won't match.

## Notes

- Assignments are stored in browser local storage — they aren't synced to Rewst or shared with other users
- Export your folders before uninstalling the extension — local storage is cleared on removal
- If Rewst updates their UI and the extension stops working, the most likely fix is reloading the extension
- The extension only runs on the workflows list page, nowhere else

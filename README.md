# Rewst Workflow Folders

A browser extension that adds folder organisation to the Rewst workflows list. Workflows are displayed as a flat list with no grouping by default — this fixes that by letting you create folders and assign workflows to them, with assignments stored locally in your browser.

Built for the Asia region (`app.rewst.asia`). Vibecoded in a couple of hours, so treat it accordingly.

## Installing

The extension isn't published to any store, so you'll need to load it manually.

**Chrome or Edge:**

1. Open `chrome://extensions` or `edge://extensions`
2. Enable **Developer mode** (toggle in the top right)
3. Click **Load unpacked**
4. Select the `FolderExtension` folder
5. Navigate to your Rewst workflows page — the extension icon will become active

To update after pulling changes, click the refresh icon on the extension card and hard-refresh the Rewst tab (Ctrl+Shift+R).

## Usage

Click the extension icon in your browser toolbar to open the folder manager. From there you can create folders, rename them, delete them, and switch between views (All, Unfoldered, or a specific folder).

Each workflow row gets a small folder icon button in the actions column. Click it to assign that workflow to a folder, or right-click any row for the same options. If you have multiple workflows checked, right-clicking will offer to assign them all at once.

Folder assignments are stored per organisation, so if you have access to multiple Rewst orgs they won't interfere with each other.

## Notes

- Assignments are stored in browser local storage — they aren't synced to Rewst or shared with other users
- If Rewst updates their UI and the extension stops working, the most likely fix is reloading the extension
- The extension only runs on the workflows list page, nowhere else

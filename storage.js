/**
 * storage.js — chrome.storage.local abstraction, org-scoped
 * All other modules call only these functions.
 *
 * Storage key: "rwf_data"
 * Shape:
 * {
 *   "[orgId]": {
 *     folders: { "[folderId]": { name, color, order } },
 *     assignments: { "[workflowId]": "[folderId]" }
 *   }
 * }
 */
const StorageModule = (() => {
  const STORAGE_KEY = 'rwf_data';

  const FOLDER_COLORS = [
    '#3b82f6', // blue
    '#10b981', // emerald
    '#f59e0b', // amber
    '#ef4444', // red
    '#8b5cf6', // violet
    '#ec4899', // pink
    '#06b6d4', // cyan
    '#84cc16', // lime
  ];

  let _colorIndex = 0;

  function nextColor() {
    const color = FOLDER_COLORS[_colorIndex % FOLDER_COLORS.length];
    _colorIndex++;
    return color;
  }

  function _readAll() {
    return new Promise((resolve) => {
      chrome.storage.local.get(STORAGE_KEY, (result) => {
        resolve(result[STORAGE_KEY] || {});
      });
    });
  }

  function _writeAll(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set({ [STORAGE_KEY]: data }, resolve);
    });
  }

  async function getOrgData(orgId) {
    const all = await _readAll();
    return all[orgId] || { folders: {}, assignments: {} };
  }

  async function saveOrgData(orgId, orgData) {
    const all = await _readAll();
    all[orgId] = orgData;
    await _writeAll(all);
  }

  async function createFolder(orgId, name, color) {
    const orgData = await getOrgData(orgId);
    const id = crypto.randomUUID();
    const order = Object.keys(orgData.folders).length;
    orgData.folders[id] = { name, color: color || nextColor(), order };
    await saveOrgData(orgId, orgData);
    return id;
  }

  async function renameFolder(orgId, folderId, newName) {
    const orgData = await getOrgData(orgId);
    if (!orgData.folders[folderId]) return;
    orgData.folders[folderId].name = newName;
    await saveOrgData(orgId, orgData);
  }

  async function deleteFolder(orgId, folderId) {
    const orgData = await getOrgData(orgId);
    delete orgData.folders[folderId];
    // Remove all assignments pointing to this folder
    for (const wfId of Object.keys(orgData.assignments)) {
      if (orgData.assignments[wfId] === folderId) {
        delete orgData.assignments[wfId];
      }
    }
    await saveOrgData(orgId, orgData);
  }

  async function assignWorkflow(orgId, workflowId, folderId) {
    const orgData = await getOrgData(orgId);
    if (folderId === null) {
      delete orgData.assignments[workflowId];
    } else {
      orgData.assignments[workflowId] = folderId;
    }
    await saveOrgData(orgId, orgData);
  }

  async function batchAssign(orgId, workflowIds, folderId) {
    const orgData = await getOrgData(orgId);
    for (const wfId of workflowIds) {
      if (folderId === null) {
        delete orgData.assignments[wfId];
      } else {
        orgData.assignments[wfId] = folderId;
      }
    }
    await saveOrgData(orgId, orgData);
  }

  /**
   * Register a callback for storage changes.
   * Callback receives (orgId, newOrgData) for any org whose data changed.
   */
  function onChange(callback) {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local' || !changes[STORAGE_KEY]) return;
      const newAll = changes[STORAGE_KEY].newValue || {};
      const oldAll = changes[STORAGE_KEY].oldValue || {};
      // Fire for each org that actually changed
      const orgIds = new Set([...Object.keys(newAll), ...Object.keys(oldAll)]);
      for (const orgId of orgIds) {
        const newData = newAll[orgId] || { folders: {}, assignments: {} };
        callback(orgId, newData);
      }
    });
  }

  return {
    getOrgData,
    saveOrgData,
    createFolder,
    renameFolder,
    deleteFolder,
    assignWorkflow,
    batchAssign,
    onChange,
    nextColor,
  };
})();

/**
 * storage.js — chrome.storage.local abstraction, org-scoped
 * All other modules call only these functions.
 *
 * Storage key: "rwf_data"
 * Shape:
 * {
 *   "[orgId]": {
 *     folders: { "[folderId]": { name, color, order, parentId } },
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

  /**
   * Returns a Set of folderId + all descendant folder IDs (recursive).
   */
  function getDescendantFolderIds(folderId, folders) {
    const result = new Set([folderId]);
    for (const [id, f] of Object.entries(folders)) {
      if (f.parentId === folderId) {
        for (const did of getDescendantFolderIds(id, folders)) {
          result.add(did);
        }
      }
    }
    return result;
  }

  async function createFolder(orgId, name, color, parentId = null) {
    const orgData = await getOrgData(orgId);
    const id = crypto.randomUUID();
    const siblings = Object.values(orgData.folders).filter(
      (f) => (f.parentId || null) === parentId
    );
    const order = siblings.length;
    orgData.folders[id] = { name, color: color || nextColor(), order, parentId };
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
    const toDelete = getDescendantFolderIds(folderId, orgData.folders);
    for (const id of toDelete) {
      delete orgData.folders[id];
    }
    for (const wfId of Object.keys(orgData.assignments)) {
      if (toDelete.has(orgData.assignments[wfId])) {
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
    getDescendantFolderIds,
  };
})();

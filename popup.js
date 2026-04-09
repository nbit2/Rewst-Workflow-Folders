/**
 * popup.js — Extension popup logic
 *
 * Runs in the popup context (separate from the content script).
 * Reads/writes chrome.storage.local directly for folder CRUD.
 * Messages the content script to apply row filtering.
 */

const STORAGE_KEY = 'rwf_data';

const FOLDER_COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16',
];

let orgId = null;
let tabId = null;
let orgData = { folders: {}, assignments: {} };
let activeView = 'all';
let activeFolderId = null;
let colorIndex = 0;

// expandedFolders tracks which folder IDs are open in the tree (all open by default)
const expandedFolders = new Set();

// pendingNewFolderParent: undefined = not creating, null = root, string = parent folderId
let pendingNewFolderParent = undefined;

// ── Storage helpers ────────────────────────────────────────────────────────

async function loadOrgData() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const all = result[STORAGE_KEY] || {};
  return all[orgId] || { folders: {}, assignments: {} };
}

async function saveOrgData(data) {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const all = result[STORAGE_KEY] || {};
  all[orgId] = data;
  await chrome.storage.local.set({ [STORAGE_KEY]: all });
}

function nextColor() {
  const usedColors = new Set(Object.values(orgData.folders).map((f) => f.color));
  const unused = FOLDER_COLORS.filter((c) => !usedColors.has(c));
  if (unused.length > 0) return unused[0];
  return FOLDER_COLORS[colorIndex++ % FOLDER_COLORS.length];
}

// ── Folder hierarchy helpers ───────────────────────────────────────────────

function getDescendantFolderIds(folderId) {
  const result = new Set([folderId]);
  for (const [id, f] of Object.entries(orgData.folders)) {
    if (f.parentId === folderId) {
      for (const did of getDescendantFolderIds(id)) {
        result.add(did);
      }
    }
  }
  return result;
}

/** Count workflows assigned to folderId or any of its descendants. */
function getWorkflowCount(folderId) {
  const descendants = getDescendantFolderIds(folderId);
  let count = 0;
  for (const fid of Object.values(orgData.assignments)) {
    if (descendants.has(fid)) count++;
  }
  return count;
}

/** Build a map of parentId → sorted children [[id, folder], ...]. */
function buildChildrenMap() {
  const map = {};
  for (const [id, f] of Object.entries(orgData.folders)) {
    const p = f.parentId || null;
    if (!map[p]) map[p] = [];
    map[p].push([id, f]);
  }
  for (const key of Object.keys(map)) {
    map[key].sort(([, a], [, b]) => a.order - b.order);
  }
  return map;
}

// ── Messaging ──────────────────────────────────────────────────────────────

async function sendFilter(view, folderId) {
  try {
    await chrome.tabs.sendMessage(tabId, {
      type: 'rwf:applyFilter',
      view,
      folderId: folderId || null,
    });
  } catch {
    // Content script not ready — ignore
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderFolderList() {
  const list = document.getElementById('folder-list');
  list.innerHTML = '';

  const folders = orgData.folders;
  const hasAnyFolders = Object.keys(folders).length > 0;
  const isCreatingRoot = pendingNewFolderParent === null;

  if (!hasAnyFolders && !isCreatingRoot) {
    const empty = document.createElement('li');
    empty.className = 'empty-folders';
    empty.textContent = 'No folders yet — create one below';
    list.appendChild(empty);
    return;
  }

  const childrenMap = buildChildrenMap();
  let focusPendingInput = null;

  function renderNewFolderInput(parentId, depth) {
    const li = document.createElement('li');
    li.className = 'folder-item';
    li.style.paddingLeft = (10 + depth * 16) + 'px';

    const input = document.createElement('input');
    input.className = 'inline-input';
    input.placeholder = 'Folder name\u2026';
    li.appendChild(input);
    list.appendChild(li);
    focusPendingInput = input;

    async function submit() {
      const name = input.value.trim();
      pendingNewFolderParent = undefined;
      if (!name) { renderFolderList(); return; }
      const id = crypto.randomUUID();
      const color = nextColor();
      const siblings = Object.values(orgData.folders).filter(
        (f) => (f.parentId || null) === parentId
      );
      orgData.folders[id] = { name, color, order: siblings.length, parentId };
      await saveOrgData(orgData);
      renderFolderList();
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') { pendingNewFolderParent = undefined; renderFolderList(); }
    });
    input.addEventListener('blur', () =>
      setTimeout(() => { if (document.contains(input)) submit(); }, 150)
    );
  }

  function renderFolderItem(fid, folder, depth) {
    const children = childrenMap[fid] || [];
    const willShowChildren = children.length > 0 || pendingNewFolderParent === fid;
    const isExpanded = expandedFolders.has(fid) || pendingNewFolderParent === fid;
    const count = getWorkflowCount(fid);
    const isActive = activeView === 'folder' && activeFolderId === fid;

    const li = document.createElement('li');
    li.className = 'folder-item' + (isActive ? ' active' : '');
    li.dataset.folderId = fid;
    li.style.paddingLeft = (10 + depth * 16) + 'px';

    li.innerHTML = `
      <span class="folder-toggle${willShowChildren ? '' : ' folder-toggle--leaf'}">${willShowChildren ? (isExpanded ? '▾' : '▸') : ''}</span>
      <span class="folder-dot" style="background:${folder.color}"></span>
      <span class="folder-name">${esc(folder.name)}</span>
      <span class="folder-count">${count}</span>
      <div class="folder-actions">
        <button class="icon-btn subfolder" title="New subfolder">&#x2B;</button>
        <button class="icon-btn rename" title="Rename">&#x270F;</button>
        <button class="icon-btn delete" title="Delete">&#x2715;</button>
      </div>
    `;

    li.querySelector('.folder-toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      if (!willShowChildren && !(childrenMap[fid] && childrenMap[fid].length)) return;
      if (isExpanded) expandedFolders.delete(fid);
      else expandedFolders.add(fid);
      renderFolderList();
    });

    li.addEventListener('click', (e) => {
      if (e.target.closest('.folder-actions') || e.target.classList.contains('folder-toggle')) return;
      setActiveView('folder', fid);
    });

    li.querySelector('.subfolder').addEventListener('click', (e) => {
      e.stopPropagation();
      expandedFolders.add(fid);
      pendingNewFolderParent = fid;
      renderFolderList();
    });

    li.querySelector('.rename').addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(li, fid, folder.name);
    });

    li.querySelector('.delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      const descendants = getDescendantFolderIds(fid);
      const hasDesc = descendants.size > 1;
      const msg = hasDesc
        ? `Delete "${folder.name}" and all its subfolders?\nAll workflow assignments will be removed.`
        : `Delete folder "${folder.name}"?\nAll assignments in this folder will be removed.`;
      if (!confirm(msg)) return;
      for (const id of descendants) delete orgData.folders[id];
      for (const wfId of Object.keys(orgData.assignments)) {
        if (descendants.has(orgData.assignments[wfId])) delete orgData.assignments[wfId];
      }
      if (descendants.has(activeFolderId)) setActiveView('all', null);
      await saveOrgData(orgData);
      renderFolderList();
    });

    list.appendChild(li);

    // Render children if expanded
    if (isExpanded) {
      renderChildren(fid, depth + 1);
    }
  }

  function renderChildren(parentId, depth) {
    for (const [fid, folder] of (childrenMap[parentId] || [])) {
      renderFolderItem(fid, folder, depth);
    }
    if (pendingNewFolderParent === parentId) {
      renderNewFolderInput(parentId, depth);
    }
  }

  renderChildren(null, 0);

  if (focusPendingInput) {
    setTimeout(() => focusPendingInput.focus(), 0);
  }
}

function updateViewButtons() {
  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === activeView);
  });
  document.querySelectorAll('.folder-item').forEach((li) => {
    li.classList.toggle('active', activeView === 'folder' && li.dataset.folderId === activeFolderId);
  });
}

function setActiveView(view, folderId) {
  activeView = view;
  activeFolderId = folderId || null;
  updateViewButtons();
  sendFilter(view, folderId);
}

// ── Rename ─────────────────────────────────────────────────────────────────

function startRename(li, fid, currentName) {
  const nameSpan = li.querySelector('.folder-name');
  const input = document.createElement('input');
  input.className = 'inline-input';
  input.value = currentName;
  nameSpan.replaceWith(input);
  input.focus();
  input.select();

  async function save() {
    const trimmed = input.value.trim();
    if (trimmed && trimmed !== currentName) {
      orgData.folders[fid].name = trimmed;
      await saveOrgData(orgData);
      renderFolderList();
    } else {
      input.replaceWith(nameSpan);
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') input.replaceWith(nameSpan);
  });
  input.addEventListener('blur', () => setTimeout(() => { if (document.contains(input)) save(); }, 150));
}

// ── Create folder ──────────────────────────────────────────────────────────

function startCreateFolder() {
  // If already showing a root-level input, focus it
  if (pendingNewFolderParent === null) {
    const input = document.querySelector('#folder-list .inline-input');
    if (input) { input.focus(); return; }
  }
  pendingNewFolderParent = null;
  renderFolderList();
}

// ── Backup / Restore ───────────────────────────────────────────────────────

function exportFolders() {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    orgId,
    folders: orgData.folders,
    assignments: orgData.assignments,
  };
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `rewst-folders-${orgId.slice(0, 8)}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importFolders() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      alert('Could not read file — make sure it is a valid JSON backup.');
      return;
    }

    if (!data.folders || typeof data.folders !== 'object') {
      alert('Invalid backup file: missing folders data.');
      return;
    }

    const folderCount = Object.keys(data.folders).length;
    const sameOrg = data.orgId === orgId;

    const msg = sameOrg
      ? `Import ${folderCount} folder(s) and restore workflow assignments?\n\nThis will replace your current folder structure.`
      : `Import ${folderCount} folder(s) from a different organisation?\n\nFolders will be imported but workflow assignments will be skipped (they belong to a different org). This will replace your current folders.`;

    if (!confirm(msg)) return;

    orgData.folders = data.folders;
    orgData.assignments = sameOrg && data.assignments ? data.assignments : {};

    await saveOrgData(orgData);

    expandedFolders.clear();
    for (const [id, f] of Object.entries(orgData.folders)) {
      if (!f.parentId) expandedFolders.add(id);
    }

    renderFolderList();
  });
  input.click();
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab.id;

  const match = (tab.url || '').match(
    /\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/workflows/i
  );

  if (!match) {
    document.getElementById('not-on-page').style.display = '';
    return;
  }

  orgId = match[1];

  document.getElementById('org-label').textContent = orgId.slice(0, 8) + '\u2026';
  document.getElementById('main').style.display = '';

  orgData = await loadOrgData();

  // Expand all existing root folders by default
  for (const [id, f] of Object.entries(orgData.folders)) {
    if (!f.parentId) expandedFolders.add(id);
  }

  // Restore active filter state from content script
  try {
    const state = await chrome.tabs.sendMessage(tabId, { type: 'rwf:getState' });
    if (state) {
      activeView = state.view || 'all';
      activeFolderId = state.folderId || null;
    }
  } catch { /* content script not ready */ }

  renderFolderList();
  updateViewButtons();

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveView(btn.dataset.view, null));
  });

  document.getElementById('create-btn').addEventListener('click', startCreateFolder);
  document.getElementById('export-btn').addEventListener('click', exportFolders);
  document.getElementById('import-btn').addEventListener('click', importFolders);

  // Live-update if storage changes while popup is open
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local' || !changes[STORAGE_KEY]) return;
    const newAll = changes[STORAGE_KEY].newValue || {};
    orgData = newAll[orgId] || { folders: {}, assignments: {} };
    renderFolderList();
    updateViewButtons();
  });
}

init();

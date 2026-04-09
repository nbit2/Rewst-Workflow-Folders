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
  // Pick a color not already in use, or cycle if all used
  const usedColors = new Set(Object.values(orgData.folders).map((f) => f.color));
  const unused = FOLDER_COLORS.filter((c) => !usedColors.has(c));
  if (unused.length > 0) return unused[0];
  return FOLDER_COLORS[colorIndex++ % FOLDER_COLORS.length];
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
    // Content script not ready (page not loaded yet) — ignore
  }
}

// ── Rendering ──────────────────────────────────────────────────────────────

function renderFolderList() {
  const list = document.getElementById('folder-list');
  const counts = {};
  for (const fid of Object.values(orgData.assignments)) {
    counts[fid] = (counts[fid] || 0) + 1;
  }

  const sorted = Object.entries(orgData.folders)
    .sort(([, a], [, b]) => a.order - b.order);

  list.innerHTML = '';

  if (sorted.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'empty-folders';
    empty.textContent = 'No folders yet — create one below';
    list.appendChild(empty);
    return;
  }

  for (const [fid, folder] of sorted) {
    const count = counts[fid] || 0;
    const li = document.createElement('li');
    li.className = 'folder-item' + (activeView === 'folder' && activeFolderId === fid ? ' active' : '');
    li.dataset.folderId = fid;
    li.innerHTML = `
      <span class="folder-dot" style="background:${folder.color}"></span>
      <span class="folder-name">${esc(folder.name)}</span>
      <span class="folder-count">${count}</span>
      <div class="folder-actions">
        <button class="icon-btn rename" title="Rename">&#x270F;</button>
        <button class="icon-btn delete" title="Delete">&#x2715;</button>
      </div>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.closest('.folder-actions')) return;
      setActiveView('folder', fid);
    });

    li.querySelector('.rename').addEventListener('click', (e) => {
      e.stopPropagation();
      startRename(li, fid, folder.name);
    });

    li.querySelector('.delete').addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete folder "${folder.name}"?\nAll assignments in this folder will be removed.`)) return;
      delete orgData.folders[fid];
      for (const wfId of Object.keys(orgData.assignments)) {
        if (orgData.assignments[wfId] === fid) delete orgData.assignments[wfId];
      }
      if (activeFolderId === fid) setActiveView('all', null);
      await saveOrgData(orgData);
      renderFolderList();
    });

    list.appendChild(li);
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
  const createSection = document.querySelector('.create-section');
  if (document.querySelector('.create-section .inline-input')) {
    document.querySelector('.create-section .inline-input').focus();
    return;
  }

  const input = document.createElement('input');
  input.className = 'inline-input';
  input.placeholder = 'Folder name\u2026';
  createSection.insertBefore(input, createSection.firstChild);
  input.focus();

  async function submit() {
    const name = input.value.trim();
    input.remove();
    if (!name) return;
    const id = crypto.randomUUID();
    const color = nextColor();
    orgData.folders[id] = { name, color, order: Object.keys(orgData.folders).length };
    await saveOrgData(orgData);
    renderFolderList();
  }

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
    if (e.key === 'Escape') input.remove();
  });
  input.addEventListener('blur', () => setTimeout(() => { if (document.contains(input)) submit(); }, 150));
}

// ── Bootstrap ──────────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function init() {
  // Find the active tab
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

  // Show short org ID in header
  document.getElementById('org-label').textContent = orgId.slice(0, 8) + '\u2026';
  document.getElementById('main').style.display = '';

  // Load data
  orgData = await loadOrgData();

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

  // View buttons
  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => setActiveView(btn.dataset.view, null));
  });

  // Create button
  document.getElementById('create-btn').addEventListener('click', startCreateFolder);

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

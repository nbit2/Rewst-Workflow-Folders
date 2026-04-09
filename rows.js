/**
 * rows.js — Row decoration, filtering, and MutationObserver
 *
 * Responsibilities:
 *  - Scan the table for workflow rows and extract IDs/names
 *  - Inject coloured dot badges onto rows that have a folder assignment
 *  - Show/hide rows based on the active folder filter
 *  - Keep everything up to date as React re-renders the table
 */
const RowsModule = (() => {
  let _orgData = null;
  let _activeView = 'all';   // 'all' | 'unfoldered' | 'folder'
  let _activeFolderId = null;

  let _tbody = null;
  let _phase1Observer = null;
  let _phase2Observer = null;
  let _debounceTimer = null;

  // ── Selectors ──────────────────────────────────────────────────────────────

  const ROW_SELECTOR = '.MuiTableRow-root.MuiTableRow-hover';
  const TBODY_SELECTOR = '.MuiTableBody-root';

  // ── Data extraction ────────────────────────────────────────────────────────

  function getWorkflowId(row) {
    // Primary: checkbox value attribute
    const checkbox = row.querySelector('input[type="checkbox"]');
    if (checkbox && checkbox.value && checkbox.value.length === 36) {
      return checkbox.value;
    }
    // Fallback: parse from the name link href
    const link = row.querySelector('a[data-automation-id$="-name-link"]');
    if (link) {
      const match = link.getAttribute('href').match(/\/workflows\/([0-9a-f-]{36})/i);
      if (match) return match[1];
    }
    return null;
  }

  function getWorkflowName(row) {
    const p = row.querySelector('a[data-automation-id$="-name-link"] p');
    return p ? p.textContent.trim() : '';
  }

  function getWorkflowRows() {
    const tbody = document.querySelector(TBODY_SELECTOR);
    if (!tbody) return [];
    return Array.from(tbody.querySelectorAll(ROW_SELECTOR));
  }

  // ── Badge injection ────────────────────────────────────────────────────────

  /**
   * For every visible workflow row, add/update/remove a coloured dot badge
   * and inject a folder assignment button, based on current orgData.
   */
  function decorateRows(orgData) {
    if (orgData) _orgData = orgData;
    if (!_orgData) return;

    const rows = getWorkflowRows();
    for (const row of rows) {
      const wfId = getWorkflowId(row);
      if (!wfId) continue;

      // ── Folder button ──────────────────────────────────────────────────────
      _ensureFolderButton(row, wfId);

      // ── Coloured badge ─────────────────────────────────────────────────────
      const folderId = _orgData.assignments[wfId];
      const existingBadge = row.querySelector('.rwf-badge');

      if (!folderId) {
        if (existingBadge) existingBadge.remove();
        row.removeAttribute('data-rwf-folder');
        _updateFolderButton(row, null);
        continue;
      }

      const folder = _orgData.folders[folderId];
      if (!folder) {
        if (existingBadge) existingBadge.remove();
        row.removeAttribute('data-rwf-folder');
        _updateFolderButton(row, null);
        continue;
      }

      // Dirty check — skip DOM write if nothing changed
      if (row.getAttribute('data-rwf-folder') === folderId && existingBadge) {
        continue;
      }

      row.setAttribute('data-rwf-folder', folderId);
      _updateFolderButton(row, folder);

      if (existingBadge) {
        existingBadge.style.background = folder.color;
        existingBadge.title = folder.name;
      } else {
        const nameCell = row.querySelector('td:nth-child(2)');
        if (!nameCell) continue;
        const badge = document.createElement('span');
        badge.className = 'rwf-badge';
        badge.style.background = folder.color;
        badge.title = folder.name;
        nameCell.insertBefore(badge, nameCell.firstChild);
      }
    }
  }

  /**
   * Inject the folder button into the row's actions cell if not already present.
   */
  function _ensureFolderButton(row, wfId) {
    if (row.querySelector('.rwf-folder-btn')) return;

    // Inject into the last cell (actions column)
    const actionsCell = row.querySelector('td:last-child');
    if (!actionsCell) return;

    // Insert into the inner wrapper div (where the other action icons live),
    // falling back to the td itself if no wrapper is found.
    const actionsContainer = actionsCell.querySelector('div') || actionsCell;

    const btn = document.createElement('button');
    btn.className = 'rwf-folder-btn';
    btn.title = 'Assign to folder';
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width="18" height="18">
      <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>`;

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
      const rect = btn.getBoundingClientRect();
      ContextMenuModule.showMenu([wfId], rect.left, rect.bottom + 4);
    });

    actionsContainer.insertBefore(btn, actionsContainer.firstChild);
  }

  /**
   * Update the folder button's visual state to reflect current assignment.
   */
  function _updateFolderButton(row, folder) {
    const btn = row.querySelector('.rwf-folder-btn');
    if (!btn) return;
    if (folder) {
      btn.style.color = folder.color;
      btn.title = `Folder: ${folder.name} (click to change)`;
      btn.classList.add('rwf-folder-btn--assigned');
    } else {
      btn.style.color = '';
      btn.title = 'Assign to folder';
      btn.classList.remove('rwf-folder-btn--assigned');
    }
  }

  // ── Filtering ──────────────────────────────────────────────────────────────

  function _getDescendantFolderIds(folderId, folders) {
    const result = new Set([folderId]);
    for (const [id, f] of Object.entries(folders)) {
      if (f.parentId === folderId) {
        for (const did of _getDescendantFolderIds(id, folders)) {
          result.add(did);
        }
      }
    }
    return result;
  }

  function applyFilter(view, folderId) {
    _activeView = view || 'all';
    _activeFolderId = folderId || null;

    if (!_orgData) return;

    let folderIdSet = null;
    if (_activeView === 'folder' && _activeFolderId) {
      folderIdSet = _getDescendantFolderIds(_activeFolderId, _orgData.folders);
    }

    const rows = getWorkflowRows();
    for (const row of rows) {
      const wfId = getWorkflowId(row);
      let show = true;

      if (_activeView === 'all') {
        show = true;
      } else if (_activeView === 'unfoldered') {
        show = !wfId || !_orgData.assignments[wfId];
      } else if (_activeView === 'folder') {
        show = !!wfId && folderIdSet.has(_orgData.assignments[wfId]);
      }

      row.style.display = show ? '' : 'none';
    }
  }

  // ── MutationObserver ───────────────────────────────────────────────────────

  function _onTableMutation() {
    clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
      decorateRows(null);       // re-use cached _orgData
      applyFilter(_activeView, _activeFolderId);
    }, 80);
  }

  function _startPhase2(tbody) {
    _tbody = tbody;
    _phase2Observer = new MutationObserver((mutations) => {
      // Check if the tbody itself was removed
      if (!document.contains(_tbody)) {
        _phase2Observer.disconnect();
        _phase2Observer = null;
        _tbody = null;
        _startPhase1();
        return;
      }
      _onTableMutation();
    });
    _phase2Observer.observe(tbody, { childList: true });

    // Decorate immediately
    decorateRows(null);
    applyFilter(_activeView, _activeFolderId);
  }

  function _startPhase1() {
    if (_phase1Observer) return; // Already running

    _phase1Observer = new MutationObserver(() => {
      const tbody = document.querySelector(TBODY_SELECTOR);
      if (tbody) {
        _phase1Observer.disconnect();
        _phase1Observer = null;
        _startPhase2(tbody);
      }
    });
    _phase1Observer.observe(document.body, { childList: true, subtree: true });

    // Check immediately in case it's already there
    const tbody = document.querySelector(TBODY_SELECTOR);
    if (tbody) {
      _phase1Observer.disconnect();
      _phase1Observer = null;
      _startPhase2(tbody);
    }
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function init(orgId, orgData) {
    _orgData = orgData;
    _startPhase1();
  }

  function teardown() {
    if (_phase1Observer) { _phase1Observer.disconnect(); _phase1Observer = null; }
    if (_phase2Observer) { _phase2Observer.disconnect(); _phase2Observer = null; }
    clearTimeout(_debounceTimer);
    // Remove all badges and restore hidden rows
    const rows = getWorkflowRows();
    for (const row of rows) {
      row.style.display = '';
      const badge = row.querySelector('.rwf-badge');
      if (badge) badge.remove();
      row.removeAttribute('data-rwf-folder');
    }
    _orgData = null;
    _tbody = null;
    _activeView = 'all';
    _activeFolderId = null;
  }

  function resetFilter() {
    applyFilter('all', null);
  }

  return { init, teardown, decorateRows, applyFilter, resetFilter, getWorkflowRows, getWorkflowId };
})();

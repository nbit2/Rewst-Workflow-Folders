/**
 * contextmenu.js — Right-click context menu for folder assignment
 *
 * Intercepts right-click on workflow rows and shows a custom menu
 * for assigning workflows to folders. Supports batch assignment when
 * multiple rows are checked.
 */
const ContextMenuModule = (() => {
  let _orgId = null;
  let _orgData = null;

  const MENU_ID = 'rwf-context-menu';

  // ── Menu rendering ─────────────────────────────────────────────────────────

  function _removeMenu() {
    const existing = document.getElementById(MENU_ID);
    if (existing) existing.remove();
  }

  function _buildMenu(workflowIds, x, y) {
    _removeMenu();

    const menu = document.createElement('div');
    menu.id = MENU_ID;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    const isBatch = workflowIds.length > 1;
    const label = isBatch
      ? `Assign ${workflowIds.length} workflows to folder`
      : 'Move to folder';

    menu.innerHTML = `<div class="rwf-cm-header">${_escapeHtml(label)}</div>`;

    // Current assignment (only shown for single workflow)
    if (!isBatch) {
      const currentFolderId = _orgData.assignments[workflowIds[0]];
      if (currentFolderId) {
        const removeItem = document.createElement('div');
        removeItem.className = 'rwf-cm-item rwf-cm-item--remove';
        removeItem.textContent = 'Remove from folder';
        removeItem.addEventListener('click', () => {
          StorageModule.batchAssign(_orgId, workflowIds, null);
          _removeMenu();
        });
        menu.appendChild(removeItem);
        menu.appendChild(_separator());
      }
    } else {
      const removeItem = document.createElement('div');
      removeItem.className = 'rwf-cm-item rwf-cm-item--remove';
      removeItem.textContent = 'Remove from all folders';
      removeItem.addEventListener('click', () => {
        StorageModule.batchAssign(_orgId, workflowIds, null);
        _removeMenu();
      });
      menu.appendChild(removeItem);
      menu.appendChild(_separator());
    }

    // Folder items
    const folders = _orgData.folders;
    const sorted = Object.entries(folders).sort(([, a], [, b]) => a.order - b.order);

    if (sorted.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.className = 'rwf-cm-empty';
      emptyMsg.textContent = 'No folders yet';
      menu.appendChild(emptyMsg);
    } else {
      for (const [folderId, folder] of sorted) {
        const item = document.createElement('div');
        item.className = 'rwf-cm-item';

        // Checkmark if all selected workflows are already in this folder
        const allInFolder = workflowIds.every(
          (wfId) => _orgData.assignments[wfId] === folderId
        );
        item.innerHTML = `
          <span class="rwf-cm-dot" style="background:${folder.color}"></span>
          <span>${_escapeHtml(folder.name)}</span>
          ${allInFolder ? '<span class="rwf-cm-check">&#x2713;</span>' : ''}
        `;

        item.addEventListener('click', () => {
          StorageModule.batchAssign(_orgId, workflowIds, folderId);
          _removeMenu();
        });

        menu.appendChild(item);
      }
    }

    menu.appendChild(_separator());

    // New folder shortcut
    const newFolderItem = document.createElement('div');
    newFolderItem.className = 'rwf-cm-item rwf-cm-item--new';
    newFolderItem.textContent = '+ New folder\u2026';
    newFolderItem.addEventListener('click', () => {
      _removeMenu();
      PanelModule.startCreateFolder();
    });
    menu.appendChild(newFolderItem);

    document.body.appendChild(menu);

    // Reposition if menu overflows viewport
    const rect = menu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menu.style.left = (x - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menu.style.top = (y - rect.height) + 'px';
    }

    // Dismiss on next interaction
    setTimeout(() => {
      document.addEventListener('click', _removeMenu, { once: true });
      document.addEventListener('contextmenu', _removeMenu, { once: true });
      document.addEventListener('scroll', _removeMenu, { once: true, passive: true });
    }, 0);
  }

  function _separator() {
    const sep = document.createElement('div');
    sep.className = 'rwf-cm-separator';
    return sep;
  }

  // ── Checked workflow collection ────────────────────────────────────────────

  function _getCheckedWorkflowIds() {
    const tbody = document.querySelector('.MuiTableBody-root');
    if (!tbody) return [];
    const checked = tbody.querySelectorAll(
      'input[type="checkbox"]:checked'
    );
    const ids = [];
    for (const cb of checked) {
      if (cb.value && cb.value.length === 36) {
        ids.push(cb.value);
      }
    }
    return ids;
  }

  // ── Event handling ─────────────────────────────────────────────────────────

  function _onContextMenu(e) {
    const row = e.target.closest('.MuiTableRow-root.MuiTableRow-hover');
    if (!row) return;

    e.preventDefault();

    const rowWorkflowId = RowsModule.getWorkflowId(row);
    if (!rowWorkflowId) return;

    // Determine target set: if multiple are checked, batch — otherwise just this row
    let workflowIds = _getCheckedWorkflowIds();

    // If the right-clicked row isn't in the checked set, use only that row
    if (workflowIds.length === 0 || !workflowIds.includes(rowWorkflowId)) {
      workflowIds = [rowWorkflowId];
    }

    _buildMenu(workflowIds, e.clientX, e.clientY);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  function init(orgId, orgData) {
    _orgId = orgId;
    _orgData = orgData;
    document.addEventListener('contextmenu', _onContextMenu);
  }

  function update(orgData) {
    _orgData = orgData;
  }

  function teardown() {
    document.removeEventListener('contextmenu', _onContextMenu);
    _removeMenu();
    _orgId = null;
    _orgData = null;
  }

  function _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showMenu(workflowIds, x, y) {
    _buildMenu(workflowIds, x, y);
  }

  return { init, update, teardown, showMenu };
})();

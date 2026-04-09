/**
 * content.js — Main orchestrator
 *
 * Responsibilities:
 *  - Extract org ID from the URL
 *  - Load storage data and initialise rows + context menu modules
 *  - Listen for filter/state messages from the popup
 *  - Handle SPA navigation (React router pushState / popstate)
 *  - Relay storage changes to row decoration
 */
(() => {
  // ── Org ID detection ───────────────────────────────────────────────────────

  function getOrgId() {
    const match = location.pathname.match(
      /\/organizations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/workflows/i
    );
    return match ? match[1] : null;
  }

  function isOnWorkflowsPage() {
    return /\/organizations\/[0-9a-f-]{36}\/workflows/i.test(location.pathname);
  }

  // ── Filter state (owned here so it survives popup open/close) ─────────────

  let _activeView = 'all';
  let _activeFolderId = null;

  // ── Message listener (from popup) ──────────────────────────────────────────

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'rwf:applyFilter') {
      _activeView = msg.view;
      _activeFolderId = msg.folderId || null;
      RowsModule.applyFilter(_activeView, _activeFolderId);
      sendResponse({ ok: true });
    }
    if (msg.type === 'rwf:getState') {
      sendResponse({ view: _activeView, folderId: _activeFolderId, orgId: getOrgId() });
    }
    return true; // keep channel open for async sendResponse
  });

  // ── Initialisation ─────────────────────────────────────────────────────────

  let _initialised = false;
  let _currentOrgId = null;

  async function initialise() {
    const orgId = getOrgId();
    if (!orgId) return;

    _currentOrgId = orgId;
    _initialised = true;

    const orgData = await StorageModule.getOrgData(orgId);

    RowsModule.init(orgId, orgData);
    ContextMenuModule.init(orgId, orgData);

    // When storage changes (from popup CRUD), re-decorate rows
    StorageModule.onChange((changedOrgId, newData) => {
      if (changedOrgId !== _currentOrgId) return;
      RowsModule.decorateRows(newData);
      RowsModule.applyFilter(_activeView, _activeFolderId);
      ContextMenuModule.update(newData);
    });
  }

  function teardown() {
    RowsModule.teardown();
    ContextMenuModule.teardown();
    _initialised = false;
    _currentOrgId = null;
    _activeView = 'all';
    _activeFolderId = null;
  }

  // ── SPA navigation handling ────────────────────────────────────────────────

  const _origPushState = history.pushState.bind(history);
  history.pushState = function (...args) {
    _origPushState(...args);
    window.dispatchEvent(new Event('rwf:navigate'));
  };

  window.addEventListener('popstate', () => {
    window.dispatchEvent(new Event('rwf:navigate'));
  });

  window.addEventListener('rwf:navigate', () => {
    if (!isOnWorkflowsPage()) {
      if (_initialised) teardown();
      return;
    }

    const newOrgId = getOrgId();
    if (_initialised && newOrgId === _currentOrgId) return;

    if (_initialised) teardown();
    setTimeout(initialise, 350);
  });

  // ── Start ──────────────────────────────────────────────────────────────────

  initialise();
})();

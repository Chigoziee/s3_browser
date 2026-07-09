let currentPrefix = '';
let allFolders = [];
let allFiles = [];

// ── DOM refs ──────────────────────────────────────────────────────────────────
const breadcrumbEl = document.getElementById('breadcrumb');
const fileListEl = document.getElementById('file-list');
const loadingEl = document.getElementById('loading');
const errorStateEl = document.getElementById('error-state');
const errorMsgEl = document.getElementById('error-msg-text');
const noCredsEl = document.getElementById('no-creds');
const searchBox = document.getElementById('search-box');
const progressOverlay = document.getElementById('progress-overlay');
const progressLabel = document.getElementById('progress-label');
const progressFill = document.getElementById('progress-bar-fill');

// ── Utilities ─────────────────────────────────────────────────────────────────
function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${sizes[i]}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function setState(state) {
  loadingEl.style.display = state === 'loading' ? 'flex' : 'none';
  errorStateEl.style.display = state === 'error' ? 'flex' : 'none';
  noCredsEl.style.display = state === 'no-creds' ? 'flex' : 'none';
  fileListEl.style.display = (state === 'loaded' || state === 'empty') ? 'flex' : 'none';
}

// ── Breadcrumb ────────────────────────────────────────────────────────────────
function renderBreadcrumb(prefix) {
  breadcrumbEl.innerHTML = '';

  const root = document.createElement('span');
  root.className = 'breadcrumb-item';
  root.textContent = 'Root';
  root.addEventListener('click', () => navigate(''));
  breadcrumbEl.appendChild(root);

  if (!prefix) {
    root.className = 'breadcrumb-item current';
    return;
  }

  const parts = prefix.replace(/\/$/, '').split('/');
  parts.forEach((part, i) => {
    const sep = document.createElement('span');
    sep.className = 'breadcrumb-sep';
    sep.textContent = ' / ';
    breadcrumbEl.appendChild(sep);

    const item = document.createElement('span');
    const isLast = i === parts.length - 1;
    item.className = `breadcrumb-item${isLast ? ' current' : ''}`;
    item.textContent = part;
    if (!isLast) {
      const targetPrefix = parts.slice(0, i + 1).join('/') + '/';
      item.addEventListener('click', () => navigate(targetPrefix));
    }
    breadcrumbEl.appendChild(item);
  });
}

// ── Render list ───────────────────────────────────────────────────────────────
function renderList(folders, files, filterText = '') {
  fileListEl.innerHTML = '';
  const q = filterText.toLowerCase();

  const visibleFolders = folders.filter(f => {
    const name = f.replace(/\/$/, '').split('/').pop();
    return !q || name.toLowerCase().includes(q);
  });
  const visibleFiles = files.filter(f => !q || f.name.toLowerCase().includes(q));

  if (visibleFolders.length === 0 && visibleFiles.length === 0) {
    fileListEl.innerHTML = '<div style="padding: 40px; color: var(--muted); text-align: center;">No items found.</div>';
    return;
  }

  if (visibleFolders.length > 0) {
    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'Folders';
    fileListEl.appendChild(label);

    for (const folderPrefix of visibleFolders) {
      const name = folderPrefix.replace(/\/$/, '').split('/').pop();
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = `
        <span class="file-icon">📁</span>
        <span class="file-name folder-name" data-prefix="${folderPrefix}">${name}</span>
        <div class="file-actions">
          <button class="btn-secondary btn-dl-folder" data-prefix="${folderPrefix}">Download as zip</button>
        </div>
      `;
      row.querySelector('.folder-name').addEventListener('click', () => navigate(folderPrefix));
      row.querySelector('.btn-dl-folder').addEventListener('click', (e) => {
        e.stopPropagation();
        downloadFolder(folderPrefix);
      });
      fileListEl.appendChild(row);
    }
  }

  if (visibleFiles.length > 0) {
    const label = document.createElement('div');
    label.className = 'section-label';
    label.textContent = 'Files';
    fileListEl.appendChild(label);

    for (const file of visibleFiles) {
      const row = document.createElement('div');
      row.className = 'file-row';
      row.innerHTML = `
        <span class="file-icon">📄</span>
        <span class="file-name" title="${file.key}">${file.name}</span>
        <span class="file-meta">${formatBytes(file.size)} · ${formatDate(file.lastModified)}</span>
        <div class="file-actions">
          <button class="btn-primary btn-dl-file" data-key="${file.key}">Download</button>
        </div>
      `;
      row.querySelector('.btn-dl-file').addEventListener('click', (e) => {
        e.stopPropagation();
        downloadFile(file.key, e.target);
      });
      fileListEl.appendChild(row);
    }
  }
}

// ── Navigation ────────────────────────────────────────────────────────────────
async function navigate(prefix) {
  currentPrefix = prefix;
  renderBreadcrumb(prefix);
  searchBox.value = '';
  await loadFolder(prefix);
}

async function loadFolder(prefix) {
  setState('loading');
  try {
    const hasCreds = await window.api.hasCredentials();
    if (!hasCreds) {
      setState('no-creds');
      return;
    }
    const result = await window.api.listFolder(prefix);
    allFolders = result.folders;
    allFiles = result.files;
    setState('loaded');
    renderList(allFolders, allFiles);
  } catch (err) {
    errorMsgEl.textContent = err.message || 'Failed to load folder.';
    setState('error');
  }
}

// ── Downloads ─────────────────────────────────────────────────────────────────
async function downloadFile(key, btn) {
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Saving…';
  try {
    const result = await window.api.downloadFile(key);
    if (result && result.ok) {
      btn.textContent = 'Saved!';
      setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2000);
    } else {
      btn.textContent = orig;
      btn.disabled = false;
    }
  } catch (err) {
    btn.textContent = 'Error';
    btn.disabled = false;
    setTimeout(() => { btn.textContent = orig; }, 2000);
    console.error(err);
  }
}

async function downloadFolder(prefix) {
  progressOverlay.classList.add('visible');
  progressLabel.textContent = 'Preparing download…';
  progressFill.style.width = '0%';

  try {
    const result = await window.api.downloadFolder(prefix);
    if (result && result.ok) {
      progressLabel.textContent = `Done! ${result.count} file(s) zipped.`;
      progressFill.style.width = '100%';
      setTimeout(() => progressOverlay.classList.remove('visible'), 3000);
    } else {
      progressOverlay.classList.remove('visible');
    }
  } catch (err) {
    progressLabel.textContent = 'Download failed: ' + (err.message || '');
    setTimeout(() => progressOverlay.classList.remove('visible'), 4000);
    console.error(err);
  }
}

// ── Search/filter ─────────────────────────────────────────────────────────────
searchBox.addEventListener('input', () => {
  renderList(allFolders, allFiles, searchBox.value);
});

// ── Events ────────────────────────────────────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', () => loadFolder(currentPrefix));
document.getElementById('btn-settings').addEventListener('click', () => window.api.openSettings());
document.getElementById('btn-open-settings-creds').addEventListener('click', () => window.api.openSettings());

window.api.onDownloadProgress(({ pct, done, total }) => {
  progressLabel.textContent = `Downloading files… ${pct}% (${done}/${total})`;
  progressFill.style.width = `${pct}%`;
});

window.api.onCredentialsUpdated(() => {
  navigate('');
});

// ── Init ─────────────────────────────────────────────────────────────────────
navigate('');

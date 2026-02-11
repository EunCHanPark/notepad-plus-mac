// 에러 표시 (디버그용)
window.onerror = function(msg, url, line, col, error) {
  const el = document.getElementById('editor-container');
  if (el) {
    el.style.cssText = 'padding:20px;color:#ff4444;white-space:pre-wrap;font-family:monospace;font-size:13px;overflow:auto;';
    el.textContent = `Error: ${msg}\nFile: ${url}\nLine: ${line}:${col}\n\n${error ? error.stack : ''}`;
  }
};

const { ipcRenderer } = require('electron');
const path = require('path');

// marked & ace loaded via <script> tags in index.html
marked.setOptions({ breaks: true, gfm: true });
ace.config.set('basePath', '../node_modules/ace-builds/src-min-noconflict');
ace.config.set('modePath', '../node_modules/ace-builds/src-min-noconflict');
ace.config.set('themePath', '../node_modules/ace-builds/src-min-noconflict');

// 전역 상태
let editor = null;
let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let currentTheme = 'monokai';
let currentFontSize = 14;
let markdownPreviewVisible = false;
let markdownUpdateTimer = null;
let lastRenderedMarkdown = null;
let draggedTabId = null;
let sessionSaveTimer = null;

// 확장자 → Ace 모드 매핑
const EXT_MODE_MAP = {
  '.js': 'javascript', '.jsx': 'jsx',
  '.ts': 'typescript', '.tsx': 'tsx',
  '.py': 'python',
  '.c': 'c_cpp', '.h': 'c_cpp',
  '.cpp': 'c_cpp', '.cc': 'c_cpp', '.cxx': 'c_cpp', '.hpp': 'c_cpp',
  '.cs': 'csharp',
  '.java': 'java',
  '.go': 'golang',
  '.rs': 'rust',
  '.rb': 'ruby',
  '.php': 'php',
  '.swift': 'swift',
  '.kt': 'kotlin', '.kts': 'kotlin',
  '.html': 'html', '.htm': 'html',
  '.css': 'css', '.scss': 'scss', '.less': 'less',
  '.json': 'json',
  '.xml': 'xml', '.svg': 'xml', '.plist': 'xml',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'sh', '.bash': 'sh', '.zsh': 'sh',
  '.bat': 'batchfile', '.cmd': 'batchfile',
  '.ps1': 'powershell',
  '.lua': 'lua',
  '.perl': 'perl', '.pl': 'perl',
  '.dockerfile': 'dockerfile',
  '.ini': 'ini', '.toml': 'toml',
  '.r': 'r',
  '.txt': 'text', '.log': 'text', '.cfg': 'text', '.conf': 'text', '.csv': 'text',
};

const MODE_DISPLAY = {
  'text': 'Plain Text', 'javascript': 'JavaScript', 'typescript': 'TypeScript',
  'python': 'Python', 'c_cpp': 'C/C++', 'csharp': 'C#', 'java': 'Java',
  'golang': 'Go', 'rust': 'Rust', 'ruby': 'Ruby', 'php': 'PHP', 'swift': 'Swift',
  'kotlin': 'Kotlin', 'html': 'HTML', 'css': 'CSS', 'scss': 'SCSS', 'less': 'LESS',
  'json': 'JSON', 'xml': 'XML', 'yaml': 'YAML', 'markdown': 'Markdown',
  'sql': 'SQL', 'sh': 'Shell', 'batchfile': 'Batch', 'powershell': 'PowerShell',
  'r': 'R', 'lua': 'Lua', 'perl': 'Perl', 'dockerfile': 'Dockerfile',
  'ini': 'INI', 'toml': 'TOML', 'jsx': 'JSX', 'tsx': 'TSX',
};

function getModeFromPath(filePath) {
  if (!filePath) return 'text';
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile') return 'makefile';
  return EXT_MODE_MAP[ext] || 'text';
}

// 에디터 초기화
async function initEditor() {
  editor = ace.edit('editor-container');
  editor.setTheme('ace/theme/' + currentTheme);
  editor.setFontSize(currentFontSize);
  editor.session.setUseWorker(false);
  editor.setOptions({
    enableBasicAutocompletion: true,
    enableSnippets: false,
    showPrintMargin: false,
    tabSize: 4,
    useSoftTabs: true,
    wrap: false,
    showGutter: true,
    highlightActiveLine: true,
    highlightSelectedWord: true,
    animatedScroll: true,
    scrollPastEnd: 0.5,
    displayIndentGuides: true,
    fadeFoldWidgets: true,
  });

  editor.on('change', () => {
    const tab = tabs.find(t => t.id === activeTabId);
    if (!tab) return;
    tab.content = editor.getValue();
    tab.modified = tab.content !== tab.originalContent;
    updateTabUI(tab);
    updateStatusBar();
    scheduleMarkdownUpdate();
    scheduleSessionSave();
  });

  editor.selection.on('changeCursor', () => updateCursorPosition());
  editor.selection.on('changeSelection', () => updateSelectionInfo());

  const restored = await loadSession();
  if (!restored) {
    createNewTab();
  }
}

// 탭 생성
function createNewTab(filePath = null, content = '') {
  const id = ++tabIdCounter;
  const fileName = filePath ? path.basename(filePath) : `새 파일 ${id}`;
  const mode = getModeFromPath(filePath);

  const tab = {
    id, filePath, fileName, mode, content,
    originalContent: content,
    modified: false,
    pinned: false,
    cursorPos: { row: 0, column: 0 },
    scrollTop: 0,
    encoding: 'UTF-8',
    eol: 'LF',
  };

  tabs.push(tab);
  renderTabs();
  switchToTab(id);
  return tab;
}

function switchToTab(tabId) {
  if (activeTabId && editor) {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab) {
      currentTab.content = editor.getValue();
      currentTab.cursorPos = editor.getCursorPosition();
      currentTab.scrollTop = editor.session.getScrollTop();
    }
  }

  activeTabId = tabId;
  const tab = tabs.find(t => t.id === tabId);
  if (!tab || !editor) return;

  editor.setValue(tab.content, -1);
  editor.session.setMode('ace/mode/' + tab.mode);
  editor.session.setUseWorker(false);
  editor.moveCursorToPosition(tab.cursorPos);
  editor.session.setScrollTop(tab.scrollTop);
  editor.focus();

  renderTabs();
  updateStatusBar();
  updateMarkdownPreview();
}

function closeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  if (tab.modified) {
    handleUnsavedTab(tab).then((action) => {
      if (action === 0) saveTab(tab).then(() => removeTab(tabId));
      else if (action === 1) removeTab(tabId);
    });
  } else {
    removeTab(tabId);
  }
}

function removeTab(tabId) {
  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;
  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    tabIdCounter = 0;
    createNewTab();
  } else if (activeTabId === tabId) {
    switchToTab(tabs[Math.min(idx, tabs.length - 1)].id);
  } else {
    renderTabs();
  }
  scheduleSessionSave();
}

async function handleUnsavedTab(tab) {
  return await ipcRenderer.invoke('show-unsaved-dialog', tab.fileName);
}

async function saveTab(tab) {
  if (!tab) tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  if (!tab.filePath) return saveTabAs(tab);

  const content = (tab.id === activeTabId && editor) ? editor.getValue() : tab.content;
  const result = await ipcRenderer.invoke('write-file', tab.filePath, content);
  if (result.success) {
    tab.originalContent = content;
    tab.content = content;
    tab.modified = false;
    updateTabUI(tab);
    updateStatusBar();
    scheduleSessionSave();
  }
}

async function saveTabAs(tab) {
  if (!tab) tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;

  const result = await ipcRenderer.invoke('save-file-dialog', tab.filePath || tab.fileName);
  if (result.canceled) return;

  tab.filePath = result.filePath;
  tab.fileName = path.basename(result.filePath);
  const newMode = getModeFromPath(tab.filePath);
  if (newMode !== tab.mode) {
    tab.mode = newMode;
    if (tab.id === activeTabId && editor) {
      editor.session.setMode('ace/mode/' + newMode);
      editor.session.setUseWorker(false);
    }
  }
  await saveTab(tab);
  renderTabs();
  updateStatusBar();
}

// 탭 고정
function togglePinTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  tab.pinned = !tab.pinned;

  const idx = tabs.indexOf(tab);
  tabs.splice(idx, 1);

  const lastPinnedIdx = tabs.reduce((last, t, i) => t.pinned ? i : last, -1);
  tabs.splice(lastPinnedIdx + 1, 0, tab);

  renderTabs();
  scheduleSessionSave();
}

// 탭 드래그 & 드롭
function handleTabDragStart(e) {
  draggedTabId = parseInt(e.currentTarget.dataset.tabId);
  e.currentTarget.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', '');
}

function handleTabDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';

  const tabEl = e.currentTarget;
  document.querySelectorAll('.tab.drag-before, .tab.drag-after').forEach(el => {
    el.classList.remove('drag-before', 'drag-after');
  });

  const rect = tabEl.getBoundingClientRect();
  if (e.clientX < rect.left + rect.width / 2) {
    tabEl.classList.add('drag-before');
  } else {
    tabEl.classList.add('drag-after');
  }
}

function handleTabDragLeave(e) {
  e.currentTarget.classList.remove('drag-before', 'drag-after');
}

function handleTabDrop(e) {
  e.preventDefault();
  const targetTabId = parseInt(e.currentTarget.dataset.tabId);
  if (draggedTabId === null || draggedTabId === targetTabId) return;

  const dragTab = tabs.find(t => t.id === draggedTabId);
  const targetTab = tabs.find(t => t.id === targetTabId);
  if (!dragTab || !targetTab) return;

  // 같은 zone에서만 이동 허용 (pinned끼리, unpinned끼리)
  if (dragTab.pinned !== targetTab.pinned) return;

  const dragIdx = tabs.findIndex(t => t.id === draggedTabId);
  const [movedTab] = tabs.splice(dragIdx, 1);

  let insertIdx = tabs.findIndex(t => t.id === targetTabId);
  const rect = e.currentTarget.getBoundingClientRect();
  if (e.clientX >= rect.left + rect.width / 2) insertIdx++;

  tabs.splice(insertIdx, 0, movedTab);
  renderTabs();
  scheduleSessionSave();
}

function handleTabDragEnd() {
  draggedTabId = null;
  document.querySelectorAll('.tab.dragging, .tab.drag-before, .tab.drag-after').forEach(el => {
    el.classList.remove('dragging', 'drag-before', 'drag-after');
  });
}

// 세션 저장/복원
function scheduleSessionSave() {
  if (sessionSaveTimer) clearTimeout(sessionSaveTimer);
  sessionSaveTimer = setTimeout(saveSession, 2000);
}

async function saveSession() {
  if (activeTabId && editor) {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab) {
      currentTab.content = editor.getValue();
      currentTab.cursorPos = editor.getCursorPosition();
      currentTab.scrollTop = editor.session.getScrollTop();
    }
  }

  const sessionData = {
    tabs: tabs.map(tab => ({
      filePath: tab.filePath,
      fileName: tab.fileName,
      content: tab.content,
      originalContent: tab.originalContent,
      modified: tab.modified,
      pinned: tab.pinned,
      cursorPos: tab.cursorPos,
      scrollTop: tab.scrollTop,
      mode: tab.mode,
      encoding: tab.encoding,
      eol: tab.eol,
    })),
    activeIndex: tabs.findIndex(t => t.id === activeTabId),
    theme: currentTheme,
    fontSize: currentFontSize,
  };

  await ipcRenderer.invoke('save-session', sessionData);
}

async function loadSession() {
  const result = await ipcRenderer.invoke('load-session');
  if (!result.success || !result.data || !result.data.tabs || result.data.tabs.length === 0) {
    return false;
  }

  const session = result.data;

  if (session.theme) {
    currentTheme = session.theme;
    editor.setTheme('ace/theme/' + currentTheme);
    document.body.className = currentTheme === 'monokai' ? 'theme-dark' : 'theme-light';
  }
  if (session.fontSize) {
    currentFontSize = session.fontSize;
    editor.setFontSize(currentFontSize);
  }

  for (const tabData of session.tabs) {
    const id = ++tabIdCounter;
    tabs.push({
      id,
      filePath: tabData.filePath || null,
      fileName: tabData.fileName || `새 파일 ${id}`,
      content: tabData.content || '',
      originalContent: tabData.originalContent || '',
      modified: tabData.modified || false,
      pinned: tabData.pinned || false,
      cursorPos: tabData.cursorPos || { row: 0, column: 0 },
      scrollTop: tabData.scrollTop || 0,
      mode: tabData.mode || 'text',
      encoding: tabData.encoding || 'UTF-8',
      eol: tabData.eol || 'LF',
    });
  }

  renderTabs();

  const activeIndex = (session.activeIndex >= 0 && session.activeIndex < tabs.length)
    ? session.activeIndex : 0;
  switchToTab(tabs[activeIndex].id);

  return true;
}

// UI 렌더링
function renderTabs() {
  const container = document.getElementById('tabs-container');
  container.innerHTML = '';

  tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab${tab.id === activeTabId ? ' active' : ''}${tab.modified ? ' modified' : ''}${tab.pinned ? ' pinned' : ''}`;
    tabEl.dataset.tabId = tab.id;
    tabEl.draggable = true;

    tabEl.innerHTML = `
      <span class="tab-pin" title="${tab.pinned ? '고정 해제' : '탭 고정'}">📌</span>
      <span class="tab-title" title="${tab.filePath || tab.fileName}">${tab.fileName}</span>
      <span class="tab-modified">&bull;</span>
      <span class="tab-close" title="닫기">&times;</span>
    `;

    tabEl.querySelector('.tab-pin').addEventListener('click', (e) => {
      e.stopPropagation();
      togglePinTab(tab.id);
    });

    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close') && !e.target.classList.contains('tab-pin')) {
        switchToTab(tab.id);
      }
    });

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    tabEl.addEventListener('mousedown', (e) => {
      if (e.button === 1) { e.preventDefault(); closeTab(tab.id); }
    });

    tabEl.addEventListener('dragstart', handleTabDragStart);
    tabEl.addEventListener('dragover', handleTabDragOver);
    tabEl.addEventListener('dragleave', handleTabDragLeave);
    tabEl.addEventListener('drop', handleTabDrop);
    tabEl.addEventListener('dragend', handleTabDragEnd);

    container.appendChild(tabEl);
  });
}

function updateTabUI(tab) {
  const tabEl = document.querySelector(`.tab[data-tab-id="${tab.id}"]`);
  if (tabEl) tabEl.classList.toggle('modified', tab.modified);
  document.getElementById('status-modified').classList.toggle('hidden', !tab.modified);
}

function updateStatusBar() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  document.getElementById('status-file-info').textContent = tab.filePath || tab.fileName;
  document.getElementById('status-modified').classList.toggle('hidden', !tab.modified);
  document.getElementById('status-language').textContent = MODE_DISPLAY[tab.mode] || tab.mode;
  document.getElementById('status-encoding').textContent = tab.encoding;
  document.getElementById('status-eol').textContent = tab.eol;
}

function updateCursorPosition() {
  if (!editor) return;
  const pos = editor.getCursorPosition();
  document.getElementById('status-position').textContent = `줄 ${pos.row + 1}, 열 ${pos.column + 1}`;
}

function updateSelectionInfo() {
  if (!editor) return;
  const selEl = document.getElementById('status-selection');
  const range = editor.getSelectionRange();
  if (range.isEmpty()) {
    selEl.textContent = '';
  } else {
    const text = editor.getSelectedText();
    const lines = text.split('\n').length;
    selEl.textContent = `선택: ${text.length}자 (${lines}줄)`;
  }
}

// Markdown 미리보기
function toggleMarkdownPreview(forceState) {
  const previewEl = document.getElementById('markdown-preview');
  markdownPreviewVisible = forceState !== undefined ? forceState : !markdownPreviewVisible;
  previewEl.classList.toggle('hidden', !markdownPreviewVisible);
  if (markdownPreviewVisible) updateMarkdownPreview();
  setTimeout(() => { if (editor) editor.resize(); }, 50);
}

function updateMarkdownPreview() {
  if (!markdownPreviewVisible) return;
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;
  const content = (tab.id === activeTabId && editor) ? editor.getValue() : tab.content;
  if (content === lastRenderedMarkdown) return;
  lastRenderedMarkdown = content;
  const previewEl = document.getElementById('markdown-preview-content');
  const scrollTop = previewEl.scrollTop;
  previewEl.innerHTML = marked.parse(content);
  previewEl.scrollTop = scrollTop;
}

function scheduleMarkdownUpdate() {
  if (!markdownPreviewVisible) return;
  if (markdownUpdateTimer) clearTimeout(markdownUpdateTimer);
  markdownUpdateTimer = setTimeout(updateMarkdownPreview, 150);
}

// IPC 핸들러
ipcRenderer.on('new-file', () => createNewTab());

ipcRenderer.on('file-opened', (event, { filePath, content }) => {
  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) { switchToTab(existing.id); return; }

  const currentTab = tabs.find(t => t.id === activeTabId);
  if (currentTab && !currentTab.filePath && !currentTab.modified && currentTab.content === '') {
    currentTab.filePath = filePath;
    currentTab.fileName = path.basename(filePath);
    currentTab.content = content;
    currentTab.originalContent = content;
    currentTab.mode = getModeFromPath(filePath);
    if (editor) {
      editor.setValue(content, -1);
      editor.session.setMode('ace/mode/' + currentTab.mode);
      editor.session.setUseWorker(false);
    }
    renderTabs();
    updateStatusBar();
  } else {
    createNewTab(filePath, content);
  }
  scheduleSessionSave();
});

ipcRenderer.on('save-file', () => saveTab());
ipcRenderer.on('save-file-as', () => saveTabAs());
ipcRenderer.on('save-all', () => tabs.filter(t => t.modified).forEach(t => saveTab(t)));

ipcRenderer.on('close-tab', () => { if (activeTabId) closeTab(activeTabId); });
ipcRenderer.on('close-all-tabs', async () => {
  for (const tab of [...tabs]) {
    if (tab.modified) {
      const action = await handleUnsavedTab(tab);
      if (action === 0) await saveTab(tab);
      else if (action === 2) return;
    }
    removeTab(tab.id);
  }
});

ipcRenderer.on('find', () => { if (editor) editor.execCommand('find'); });
ipcRenderer.on('replace', () => { if (editor) editor.execCommand('replace'); });
ipcRenderer.on('goto-line', () => { if (editor) editor.execCommand('gotoline'); });

ipcRenderer.on('toggle-line-numbers', (e, enabled) => {
  if (editor) editor.setOption('showGutter', enabled);
});
ipcRenderer.on('toggle-minimap', () => {});
ipcRenderer.on('toggle-word-wrap', (e, enabled) => {
  if (editor) editor.setOption('wrap', enabled);
});

ipcRenderer.on('zoom-in', () => {
  currentFontSize = Math.min(currentFontSize + 2, 40);
  if (editor) editor.setFontSize(currentFontSize);
  scheduleSessionSave();
});
ipcRenderer.on('zoom-out', () => {
  currentFontSize = Math.max(currentFontSize - 2, 8);
  if (editor) editor.setFontSize(currentFontSize);
  scheduleSessionSave();
});
ipcRenderer.on('zoom-reset', () => {
  currentFontSize = 14;
  if (editor) editor.setFontSize(currentFontSize);
  scheduleSessionSave();
});

ipcRenderer.on('toggle-theme', () => {
  if (currentTheme === 'monokai') {
    currentTheme = 'chrome';
    document.body.className = 'theme-light';
  } else {
    currentTheme = 'monokai';
    document.body.className = 'theme-dark';
  }
  if (editor) editor.setTheme('ace/theme/' + currentTheme);
  scheduleSessionSave();
});

ipcRenderer.on('toggle-markdown-preview', () => toggleMarkdownPreview());

ipcRenderer.on('set-language', (e, langId) => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) {
    tab.mode = langId;
    if (editor) {
      editor.session.setMode('ace/mode/' + langId);
      editor.session.setUseWorker(false);
    }
    updateStatusBar();
    scheduleSessionSave();
  }
});

ipcRenderer.on('set-encoding', (e, encoding) => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) { tab.encoding = encoding; updateStatusBar(); scheduleSessionSave(); }
});

ipcRenderer.on('app-closing', async () => {
  await saveSession();
  const unsaved = tabs.filter(t => t.modified && t.filePath);
  if (unsaved.length === 0) { ipcRenderer.send('confirm-close'); return; }
  for (const tab of unsaved) {
    switchToTab(tab.id);
    const action = await handleUnsavedTab(tab);
    if (action === 0) await saveTab(tab);
    else if (action === 2) { ipcRenderer.send('cancel-close'); return; }
  }
  ipcRenderer.send('confirm-close');
});

// 드래그 & 드롭 (파일)
document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
document.addEventListener('drop', (e) => {
  e.preventDefault(); e.stopPropagation();
  for (const file of e.dataTransfer.files) {
    ipcRenderer.send('open-dropped-file', file.path);
  }
});

// 버튼 이벤트
document.getElementById('new-tab-btn').addEventListener('click', () => createNewTab());
document.getElementById('close-preview-btn').addEventListener('click', () => toggleMarkdownPreview(false));

// 윈도우 리사이즈
window.addEventListener('resize', () => { if (editor) editor.resize(); });

// 앱 시작
initEditor();

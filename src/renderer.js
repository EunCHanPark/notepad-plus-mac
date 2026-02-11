const { ipcRenderer } = require('electron');
const path = require('path');
const { marked } = require('marked');

// marked 설정
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Monaco Editor 로더
const monacoPath = path.join(__dirname, '..', 'node_modules', 'monaco-editor', 'min');
const amdLoader = require(path.join(monacoPath, 'vs', 'loader.js'));
const amdRequire = amdLoader.require;

amdRequire.config({
  baseUrl: monacoPath
});

// 전역 상태
let monaco;
let tabs = [];
let activeTabId = null;
let tabIdCounter = 0;
let currentTheme = 'vs-dark';
let currentFontSize = 14;
let currentWordWrap = 'off';
let showLineNumbers = true;
let showMinimap = true;
let markdownPreviewVisible = false;
let markdownUpdateTimer = null;

// 확장자 → 언어 매핑
const EXT_LANG_MAP = {
  '.js': 'javascript', '.jsx': 'javascript',
  '.ts': 'typescript', '.tsx': 'typescript',
  '.py': 'python',
  '.c': 'c', '.h': 'c',
  '.cpp': 'cpp', '.cc': 'cpp', '.cxx': 'cpp', '.hpp': 'cpp',
  '.cs': 'csharp',
  '.java': 'java',
  '.go': 'go',
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
  '.sh': 'shell', '.bash': 'shell', '.zsh': 'shell',
  '.bat': 'bat', '.cmd': 'bat',
  '.ps1': 'powershell',
  '.r': 'r',
  '.lua': 'lua',
  '.perl': 'perl', '.pl': 'perl',
  '.dockerfile': 'dockerfile',
  '.ini': 'ini',
  '.toml': 'ini',
  '.log': 'plaintext',
  '.txt': 'plaintext',
  '.cfg': 'ini',
  '.conf': 'ini',
  '.csv': 'plaintext',
};

function getLanguageFromPath(filePath) {
  if (!filePath) return 'plaintext';
  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();

  if (basename === 'dockerfile') return 'dockerfile';
  if (basename === 'makefile' || basename === 'gnumakefile') return 'plaintext';
  if (basename === '.gitignore' || basename === '.dockerignore') return 'plaintext';

  return EXT_LANG_MAP[ext] || 'plaintext';
}

function getLanguageDisplayName(langId) {
  const names = {
    'plaintext': 'Plain Text', 'javascript': 'JavaScript', 'typescript': 'TypeScript',
    'python': 'Python', 'c': 'C', 'cpp': 'C++', 'csharp': 'C#', 'java': 'Java',
    'go': 'Go', 'rust': 'Rust', 'ruby': 'Ruby', 'php': 'PHP', 'swift': 'Swift',
    'kotlin': 'Kotlin', 'html': 'HTML', 'css': 'CSS', 'scss': 'SCSS', 'less': 'LESS',
    'json': 'JSON', 'xml': 'XML', 'yaml': 'YAML', 'markdown': 'Markdown',
    'sql': 'SQL', 'shell': 'Shell', 'bat': 'Batch', 'powershell': 'PowerShell',
    'r': 'R', 'lua': 'Lua', 'perl': 'Perl', 'dockerfile': 'Dockerfile', 'ini': 'INI',
  };
  return names[langId] || langId;
}

// Monaco 에디터 초기화
amdRequire(['vs/editor/editor.main'], function (_monaco) {
  monaco = _monaco;

  // 커스텀 Notepad++ 스타일 테마 정의
  monaco.editor.defineTheme('notepadpp-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '608b4e', fontStyle: 'italic' },
      { token: 'keyword', foreground: '569cd6', fontStyle: 'bold' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'type', foreground: '4ec9b0' },
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#2a2d2e',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editor.selectionBackground': '#264f78',
      'editor.inactiveSelectionBackground': '#3a3d41',
      'editorCursor.foreground': '#aeafad',
    }
  });

  monaco.editor.defineTheme('notepadpp-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '008000', fontStyle: 'italic' },
      { token: 'keyword', foreground: '0000ff', fontStyle: 'bold' },
      { token: 'string', foreground: 'a31515' },
      { token: 'number', foreground: '098658' },
      { token: 'type', foreground: '267f99' },
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#000000',
      'editor.lineHighlightBackground': '#f0f0f0',
      'editorLineNumber.foreground': '#237893',
      'editor.selectionBackground': '#add6ff',
    }
  });

  currentTheme = 'notepadpp-dark';

  // 첫 번째 빈 탭 생성
  createNewTab();
});

// 탭 관련 함수
function createNewTab(filePath = null, content = '') {
  const id = ++tabIdCounter;
  const fileName = filePath ? path.basename(filePath) : `새 파일 ${id}`;
  const language = getLanguageFromPath(filePath);

  const tab = {
    id,
    filePath,
    fileName,
    language,
    content,
    originalContent: content,
    modified: false,
    model: null,
    viewState: null,
    encoding: 'utf8',
    eol: 'LF',
  };

  // Monaco 모델 생성
  const uri = monaco.Uri.parse(`file:///${id}-${fileName}`);
  tab.model = monaco.editor.createModel(content, language, uri);

  tab.model.onDidChangeContent(() => {
    const currentContent = tab.model.getValue();
    tab.modified = currentContent !== tab.originalContent;
    updateTabUI(tab);
    updateStatusBar();
    scheduleMarkdownUpdate();
  });

  tabs.push(tab);
  renderTabs();
  switchToTab(id);

  return tab;
}

function switchToTab(tabId) {
  // 현재 탭의 뷰 상태 저장
  if (activeTabId) {
    const currentTab = tabs.find(t => t.id === activeTabId);
    if (currentTab && window._editor) {
      currentTab.viewState = window._editor.saveViewState();
    }
  }

  activeTabId = tabId;
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  // 에디터가 아직 없으면 생성
  if (!window._editor) {
    const container = document.getElementById('editor-container');
    window._editor = monaco.editor.create(container, {
      model: tab.model,
      theme: currentTheme,
      fontSize: currentFontSize,
      fontFamily: "'Menlo', 'Monaco', 'Courier New', monospace",
      lineNumbers: showLineNumbers ? 'on' : 'off',
      minimap: { enabled: showMinimap },
      wordWrap: currentWordWrap,
      scrollBeyondLastLine: false,
      automaticLayout: true,
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      smoothScrolling: true,
      cursorSmoothCaretAnimation: 'on',
      cursorBlinking: 'smooth',
      tabSize: 4,
      insertSpaces: true,
      renderLineHighlight: 'all',
      occurrencesHighlight: 'singleFile',
      folding: true,
      foldingStrategy: 'auto',
      suggest: { showWords: true },
      dragAndDrop: true,
      links: true,
      colorDecorators: true,
      guides: {
        indentation: true,
        bracketPairs: true,
      },
    });

    // 커서 위치 변경 시 상태바 업데이트
    window._editor.onDidChangeCursorPosition((e) => {
      updateCursorPosition(e.position);
    });

    window._editor.onDidChangeCursorSelection((e) => {
      updateSelectionInfo(e.selection);
    });
  } else {
    window._editor.setModel(tab.model);
  }

  // 뷰 상태 복원
  if (tab.viewState) {
    window._editor.restoreViewState(tab.viewState);
  }

  window._editor.focus();
  renderTabs();
  updateStatusBar();
  updateMarkdownPreview();
}

function closeTab(tabId) {
  const tab = tabs.find(t => t.id === tabId);
  if (!tab) return;

  if (tab.modified) {
    handleUnsavedTab(tab).then((action) => {
      if (action === 0) {
        // 저장
        saveTab(tab).then(() => removeTab(tabId));
      } else if (action === 1) {
        // 저장하지 않음
        removeTab(tabId);
      }
      // action === 2: 취소
    });
  } else {
    removeTab(tabId);
  }
}

function removeTab(tabId) {
  const idx = tabs.findIndex(t => t.id === tabId);
  if (idx === -1) return;

  const tab = tabs[idx];
  if (tab.model) {
    tab.model.dispose();
  }

  tabs.splice(idx, 1);

  if (tabs.length === 0) {
    createNewTab();
  } else if (activeTabId === tabId) {
    const newIdx = Math.min(idx, tabs.length - 1);
    switchToTab(tabs[newIdx].id);
  } else {
    renderTabs();
  }
}

async function handleUnsavedTab(tab) {
  return await ipcRenderer.invoke('show-unsaved-dialog', tab.fileName);
}

async function saveTab(tab) {
  if (!tab) tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;

  if (!tab.filePath) {
    return saveTabAs(tab);
  }

  const content = tab.model.getValue();
  const result = await ipcRenderer.invoke('write-file', tab.filePath, content);

  if (result.success) {
    tab.originalContent = content;
    tab.modified = false;
    updateTabUI(tab);
    updateStatusBar();
  }
}

async function saveTabAs(tab) {
  if (!tab) tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;

  const result = await ipcRenderer.invoke('save-file-dialog', tab.filePath || tab.fileName);
  if (result.canceled) return;

  tab.filePath = result.filePath;
  tab.fileName = path.basename(result.filePath);

  // 언어 자동 감지
  const newLang = getLanguageFromPath(tab.filePath);
  if (newLang !== tab.language) {
    tab.language = newLang;
    monaco.editor.setModelLanguage(tab.model, newLang);
  }

  await saveTab(tab);
  renderTabs();
  updateStatusBar();
}

// 탭 UI 렌더링
function renderTabs() {
  const container = document.getElementById('tabs-container');
  container.innerHTML = '';

  tabs.forEach(tab => {
    const tabEl = document.createElement('div');
    tabEl.className = `tab${tab.id === activeTabId ? ' active' : ''}${tab.modified ? ' modified' : ''}`;
    tabEl.dataset.tabId = tab.id;

    tabEl.innerHTML = `
      <span class="tab-title" title="${tab.filePath || tab.fileName}">${tab.fileName}</span>
      <span class="tab-modified">●</span>
      <span class="tab-close" title="닫기">×</span>
    `;

    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        switchToTab(tab.id);
      }
    });

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tab.id);
    });

    // 중간 클릭으로 탭 닫기
    tabEl.addEventListener('mousedown', (e) => {
      if (e.button === 1) {
        e.preventDefault();
        closeTab(tab.id);
      }
    });

    container.appendChild(tabEl);
  });
}

function updateTabUI(tab) {
  const tabEl = document.querySelector(`.tab[data-tab-id="${tab.id}"]`);
  if (tabEl) {
    tabEl.classList.toggle('modified', tab.modified);
  }
  document.getElementById('status-modified').classList.toggle('hidden', !tab.modified);
}

// 상태 바 업데이트
function updateStatusBar() {
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return;

  document.getElementById('status-file-info').textContent = tab.filePath || tab.fileName;
  document.getElementById('status-modified').classList.toggle('hidden', !tab.modified);
  document.getElementById('status-language').textContent = getLanguageDisplayName(tab.language);
  document.getElementById('status-encoding').textContent = tab.encoding.toUpperCase();
  document.getElementById('status-eol').textContent = tab.eol;
}

function updateCursorPosition(position) {
  document.getElementById('status-position').textContent =
    `줄 ${position.lineNumber}, 열 ${position.column}`;
}

function updateSelectionInfo(selection) {
  const selEl = document.getElementById('status-selection');
  if (selection.isEmpty()) {
    selEl.textContent = '';
  } else {
    const tab = tabs.find(t => t.id === activeTabId);
    if (tab && tab.model) {
      const selectedText = tab.model.getValueInRange(selection);
      const lines = selectedText.split('\n').length;
      const chars = selectedText.length;
      selEl.textContent = `선택: ${chars}자 (${lines}줄)`;
    }
  }
}

// IPC 이벤트 핸들러
ipcRenderer.on('new-file', () => createNewTab());

ipcRenderer.on('file-opened', (event, { filePath, content }) => {
  // 이미 열린 파일인지 확인
  const existing = tabs.find(t => t.filePath === filePath);
  if (existing) {
    switchToTab(existing.id);
    return;
  }

  // 현재 탭이 빈 새 파일이면 대체
  const currentTab = tabs.find(t => t.id === activeTabId);
  if (currentTab && !currentTab.filePath && !currentTab.modified && currentTab.model.getValue() === '') {
    currentTab.filePath = filePath;
    currentTab.fileName = path.basename(filePath);
    currentTab.content = content;
    currentTab.originalContent = content;
    currentTab.language = getLanguageFromPath(filePath);
    currentTab.model.setValue(content);
    monaco.editor.setModelLanguage(currentTab.model, currentTab.language);
    renderTabs();
    updateStatusBar();
  } else {
    createNewTab(filePath, content);
  }
});

ipcRenderer.on('save-file', () => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) saveTab(tab);
});

ipcRenderer.on('save-file-as', () => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) saveTabAs(tab);
});

ipcRenderer.on('save-all', () => {
  tabs.filter(t => t.modified).forEach(tab => saveTab(tab));
});

ipcRenderer.on('close-tab', () => {
  if (activeTabId) closeTab(activeTabId);
});

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

ipcRenderer.on('find', () => {
  if (window._editor) {
    window._editor.getAction('actions.find').run();
  }
});

ipcRenderer.on('replace', () => {
  if (window._editor) {
    window._editor.getAction('editor.action.startFindReplaceAction').run();
  }
});

ipcRenderer.on('goto-line', () => {
  if (window._editor) {
    window._editor.getAction('editor.action.gotoLine').run();
  }
});

ipcRenderer.on('toggle-line-numbers', (event, enabled) => {
  showLineNumbers = enabled;
  if (window._editor) {
    window._editor.updateOptions({ lineNumbers: enabled ? 'on' : 'off' });
  }
});

ipcRenderer.on('toggle-minimap', (event, enabled) => {
  showMinimap = enabled;
  if (window._editor) {
    window._editor.updateOptions({ minimap: { enabled } });
  }
});

ipcRenderer.on('toggle-word-wrap', (event, enabled) => {
  currentWordWrap = enabled ? 'on' : 'off';
  if (window._editor) {
    window._editor.updateOptions({ wordWrap: currentWordWrap });
  }
});

ipcRenderer.on('zoom-in', () => {
  currentFontSize = Math.min(currentFontSize + 2, 40);
  if (window._editor) window._editor.updateOptions({ fontSize: currentFontSize });
});

ipcRenderer.on('zoom-out', () => {
  currentFontSize = Math.max(currentFontSize - 2, 8);
  if (window._editor) window._editor.updateOptions({ fontSize: currentFontSize });
});

ipcRenderer.on('zoom-reset', () => {
  currentFontSize = 14;
  if (window._editor) window._editor.updateOptions({ fontSize: currentFontSize });
});

ipcRenderer.on('toggle-theme', () => {
  if (currentTheme === 'notepadpp-dark') {
    currentTheme = 'notepadpp-light';
    document.body.className = 'theme-light';
  } else {
    currentTheme = 'notepadpp-dark';
    document.body.className = 'theme-dark';
  }
  if (window._editor) {
    monaco.editor.setTheme(currentTheme);
  }
});

// Markdown 미리보기
ipcRenderer.on('toggle-markdown-preview', () => {
  toggleMarkdownPreview();
});

function toggleMarkdownPreview(forceState) {
  const previewEl = document.getElementById('markdown-preview');
  if (forceState !== undefined) {
    markdownPreviewVisible = forceState;
  } else {
    markdownPreviewVisible = !markdownPreviewVisible;
  }

  previewEl.classList.toggle('hidden', !markdownPreviewVisible);

  if (markdownPreviewVisible) {
    updateMarkdownPreview();
  }

  // 에디터 레이아웃 재조정
  setTimeout(() => {
    if (window._editor) window._editor.layout();
  }, 50);
}

function updateMarkdownPreview() {
  if (!markdownPreviewVisible) return;
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab || !tab.model) return;

  const content = tab.model.getValue();
  const previewContent = document.getElementById('markdown-preview-content');
  previewContent.innerHTML = marked.parse(content);
}

function scheduleMarkdownUpdate() {
  if (!markdownPreviewVisible) return;
  if (markdownUpdateTimer) clearTimeout(markdownUpdateTimer);
  markdownUpdateTimer = setTimeout(updateMarkdownPreview, 300);
}

ipcRenderer.on('set-language', (event, langId) => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab && tab.model) {
    tab.language = langId;
    monaco.editor.setModelLanguage(tab.model, langId);
    updateStatusBar();
  }
});

ipcRenderer.on('set-encoding', (event, encoding) => {
  const tab = tabs.find(t => t.id === activeTabId);
  if (tab) {
    tab.encoding = encoding;
    updateStatusBar();
  }
});

// 앱 종료 처리
ipcRenderer.on('app-closing', async () => {
  const unsavedTabs = tabs.filter(t => t.modified);

  if (unsavedTabs.length === 0) {
    ipcRenderer.send('confirm-close');
    return;
  }

  for (const tab of unsavedTabs) {
    switchToTab(tab.id);
    const action = await handleUnsavedTab(tab);
    if (action === 0) {
      await saveTab(tab);
    } else if (action === 2) {
      ipcRenderer.send('cancel-close');
      return;
    }
  }

  ipcRenderer.send('confirm-close');
});

// 파일 드래그 & 드롭
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener('drop', (e) => {
  e.preventDefault();
  e.stopPropagation();

  if (e.dataTransfer.files.length > 0) {
    for (const file of e.dataTransfer.files) {
      ipcRenderer.send('open-dropped-file', file.path);
    }
  }
});

// 새 탭 버튼
document.getElementById('new-tab-btn').addEventListener('click', () => createNewTab());

// Markdown 미리보기 닫기 버튼
document.getElementById('close-preview-btn').addEventListener('click', () => {
  toggleMarkdownPreview(false);
});

// 윈도우 리사이즈
window.addEventListener('resize', () => {
  if (window._editor) {
    window._editor.layout();
  }
});

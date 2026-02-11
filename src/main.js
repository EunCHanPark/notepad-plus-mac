const { app, BrowserWindow, Menu, dialog, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

// 최근 파일 목록
let recentFiles = [];
const RECENT_FILES_PATH = path.join(app.getPath('userData'), 'recent-files.json');

function loadRecentFiles() {
  try {
    if (fs.existsSync(RECENT_FILES_PATH)) {
      recentFiles = JSON.parse(fs.readFileSync(RECENT_FILES_PATH, 'utf8'));
    }
  } catch {
    recentFiles = [];
  }
}

function saveRecentFiles() {
  try {
    fs.writeFileSync(RECENT_FILES_PATH, JSON.stringify(recentFiles.slice(0, 20)));
  } catch { /* ignore */ }
}

function addRecentFile(filePath) {
  recentFiles = recentFiles.filter(f => f !== filePath);
  recentFiles.unshift(filePath);
  recentFiles = recentFiles.slice(0, 20);
  saveRecentFiles();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 600,
    minHeight: 400,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      sandbox: false,
    },
    show: false,
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', (e) => {
    e.preventDefault();
    mainWindow.webContents.send('app-closing');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  buildMenu();
}

function buildMenu() {
  const isMac = process.platform === 'darwin';

  const template = [
    ...(isMac ? [{
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { label: '환경설정...', accelerator: 'Cmd+,', click: () => mainWindow.webContents.send('open-settings') },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: '파일',
      submenu: [
        { label: '새 파일', accelerator: 'CmdOrCtrl+N', click: () => mainWindow.webContents.send('new-file') },
        { label: '열기...', accelerator: 'CmdOrCtrl+O', click: () => openFile() },
        {
          label: '최근 파일',
          submenu: recentFiles.length > 0
            ? [
                ...recentFiles.slice(0, 10).map(f => ({
                  label: path.basename(f),
                  sublabel: f,
                  click: () => openFilePath(f)
                })),
                { type: 'separator' },
                { label: '목록 지우기', click: () => { recentFiles = []; saveRecentFiles(); buildMenu(); } }
              ]
            : [{ label: '(없음)', enabled: false }]
        },
        { type: 'separator' },
        { label: '저장', accelerator: 'CmdOrCtrl+S', click: () => mainWindow.webContents.send('save-file') },
        { label: '다른 이름으로 저장...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow.webContents.send('save-file-as') },
        { label: '모두 저장', accelerator: 'CmdOrCtrl+Alt+S', click: () => mainWindow.webContents.send('save-all') },
        { type: 'separator' },
        { label: '탭 닫기', accelerator: 'CmdOrCtrl+W', click: () => mainWindow.webContents.send('close-tab') },
        { label: '모든 탭 닫기', click: () => mainWindow.webContents.send('close-all-tabs') },
        ...(isMac ? [] : [
          { type: 'separator' },
          { role: 'quit', label: '종료' }
        ])
      ]
    },
    {
      label: '편집',
      submenu: [
        { role: 'undo', label: '실행 취소' },
        { role: 'redo', label: '다시 실행' },
        { type: 'separator' },
        { role: 'cut', label: '잘라내기' },
        { role: 'copy', label: '복사' },
        { role: 'paste', label: '붙여넣기' },
        { role: 'selectAll', label: '모두 선택' },
        { type: 'separator' },
        { label: '찾기...', accelerator: 'CmdOrCtrl+F', click: () => mainWindow.webContents.send('find') },
        { label: '바꾸기...', accelerator: 'CmdOrCtrl+H', click: () => mainWindow.webContents.send('replace') },
        { label: '줄 이동...', accelerator: 'CmdOrCtrl+G', click: () => mainWindow.webContents.send('goto-line') },
      ]
    },
    {
      label: '보기',
      submenu: [
        { label: '줄 번호', type: 'checkbox', checked: true, click: (item) => mainWindow.webContents.send('toggle-line-numbers', item.checked) },
        { label: '미니맵', type: 'checkbox', checked: true, click: (item) => mainWindow.webContents.send('toggle-minimap', item.checked) },
        { label: '자동 줄바꿈', type: 'checkbox', checked: false, click: (item) => mainWindow.webContents.send('toggle-word-wrap', item.checked) },
        { type: 'separator' },
        { label: '확대', accelerator: 'CmdOrCtrl+=', click: () => mainWindow.webContents.send('zoom-in') },
        { label: '축소', accelerator: 'CmdOrCtrl+-', click: () => mainWindow.webContents.send('zoom-out') },
        { label: '기본 크기', accelerator: 'CmdOrCtrl+0', click: () => mainWindow.webContents.send('zoom-reset') },
        { type: 'separator' },
        { label: '테마 전환', accelerator: 'CmdOrCtrl+T', click: () => mainWindow.webContents.send('toggle-theme') },
        { type: 'separator' },
        { label: 'Markdown 미리보기', accelerator: 'CmdOrCtrl+Shift+M', click: () => mainWindow.webContents.send('toggle-markdown-preview') },
        { type: 'separator' },
        { label: '항상 위에', type: 'checkbox', checked: false, accelerator: 'CmdOrCtrl+Shift+T', click: (item) => { mainWindow.setAlwaysOnTop(item.checked); } },
        { role: 'togglefullscreen', label: '전체 화면' },
        { role: 'toggleDevTools', label: '개발자 도구' },
      ]
    },
    {
      label: '언어',
      submenu: [
        { label: 'Plain Text', click: () => mainWindow.webContents.send('set-language', 'text') },
        { type: 'separator' },
        { label: 'C/C++', click: () => mainWindow.webContents.send('set-language', 'c_cpp') },
        { label: 'C#', click: () => mainWindow.webContents.send('set-language', 'csharp') },
        { label: 'CSS', click: () => mainWindow.webContents.send('set-language', 'css') },
        { label: 'Go', click: () => mainWindow.webContents.send('set-language', 'golang') },
        { label: 'HTML', click: () => mainWindow.webContents.send('set-language', 'html') },
        { label: 'Java', click: () => mainWindow.webContents.send('set-language', 'java') },
        { label: 'JavaScript', click: () => mainWindow.webContents.send('set-language', 'javascript') },
        { label: 'JSON', click: () => mainWindow.webContents.send('set-language', 'json') },
        { label: 'Kotlin', click: () => mainWindow.webContents.send('set-language', 'kotlin') },
        { label: 'Markdown', click: () => mainWindow.webContents.send('set-language', 'markdown') },
        { label: 'PHP', click: () => mainWindow.webContents.send('set-language', 'php') },
        { label: 'Python', click: () => mainWindow.webContents.send('set-language', 'python') },
        { label: 'Ruby', click: () => mainWindow.webContents.send('set-language', 'ruby') },
        { label: 'Rust', click: () => mainWindow.webContents.send('set-language', 'rust') },
        { label: 'Shell Script', click: () => mainWindow.webContents.send('set-language', 'sh') },
        { label: 'SQL', click: () => mainWindow.webContents.send('set-language', 'sql') },
        { label: 'Swift', click: () => mainWindow.webContents.send('set-language', 'swift') },
        { label: 'TypeScript', click: () => mainWindow.webContents.send('set-language', 'typescript') },
        { label: 'XML', click: () => mainWindow.webContents.send('set-language', 'xml') },
        { label: 'YAML', click: () => mainWindow.webContents.send('set-language', 'yaml') },
      ]
    },
    {
      label: '인코딩',
      submenu: [
        { label: 'UTF-8', click: () => mainWindow.webContents.send('set-encoding', 'utf8') },
        { label: 'UTF-8 BOM', click: () => mainWindow.webContents.send('set-encoding', 'utf8bom') },
        { label: 'UTF-16 LE', click: () => mainWindow.webContents.send('set-encoding', 'utf16le') },
        { label: 'UTF-16 BE', click: () => mainWindow.webContents.send('set-encoding', 'utf16be') },
        { label: 'EUC-KR', click: () => mainWindow.webContents.send('set-encoding', 'euc-kr') },
        { label: 'Shift-JIS', click: () => mainWindow.webContents.send('set-encoding', 'shift-jis') },
        { label: 'ISO-8859-1', click: () => mainWindow.webContents.send('set-encoding', 'iso-8859-1') },
      ]
    },
    {
      label: '도움말',
      submenu: [
        { label: 'Notepad+ Mac 정보', click: () => showAbout() },
        { type: 'separator' },
        { label: 'Notepad++ 공식 사이트', click: () => shell.openExternal('https://notepad-plus-plus.org/') },
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

async function openFile() {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: '모든 파일', extensions: ['*'] },
      { name: '텍스트 파일', extensions: ['txt', 'md', 'log'] },
      { name: '소스 코드', extensions: ['js', 'ts', 'py', 'c', 'cpp', 'h', 'java', 'rb', 'go', 'rs', 'swift', 'kt'] },
      { name: '웹 파일', extensions: ['html', 'css', 'json', 'xml', 'yaml', 'yml'] },
      { name: '스크립트', extensions: ['sh', 'bat', 'ps1', 'php', 'sql'] },
    ]
  });

  if (!result.canceled && result.filePaths.length > 0) {
    for (const filePath of result.filePaths) {
      openFilePath(filePath);
    }
  }
}

function openFilePath(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    addRecentFile(filePath);
    buildMenu();
    mainWindow.webContents.send('file-opened', { filePath, content });
  } catch (err) {
    dialog.showErrorBox('파일 열기 오류', `파일을 열 수 없습니다:\n${filePath}\n\n${err.message}`);
  }
}

function showAbout() {
  dialog.showMessageBox(mainWindow, {
    type: 'info',
    title: 'Notepad+ Mac 정보',
    message: 'Notepad+ Mac',
    detail: 'Version 1.0.6\n\nNotepad++ 스타일의 macOS 텍스트 에디터\nAce Editor 기반\n\nInspired by Notepad++ by Don Ho',
    buttons: ['확인']
  });
}

// IPC 핸들러
ipcMain.handle('save-file-dialog', async (event, defaultPath) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: defaultPath || 'untitled.txt',
    filters: [
      { name: '모든 파일', extensions: ['*'] },
      { name: '텍스트 파일', extensions: ['txt'] },
    ]
  });
  return result;
});

ipcMain.handle('write-file', async (event, filePath, content) => {
  try {
    fs.writeFileSync(filePath, content, 'utf8');
    addRecentFile(filePath);
    buildMenu();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    addRecentFile(filePath);
    buildMenu();
    return { success: true, content };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.on('confirm-close', () => {
  mainWindow.destroy();
  app.quit();
});

ipcMain.on('cancel-close', () => {
  // 닫기 취소
});

ipcMain.handle('show-unsaved-dialog', async (event, fileName) => {
  const result = await dialog.showMessageBox(mainWindow, {
    type: 'warning',
    title: '저장하지 않은 변경사항',
    message: `"${fileName}"의 변경사항을 저장하시겠습니까?`,
    buttons: ['저장', '저장하지 않음', '취소'],
    defaultId: 0,
    cancelId: 2,
  });
  return result.response;
});

// 파일 드래그 & 드롭
ipcMain.on('open-dropped-file', (event, filePath) => {
  openFilePath(filePath);
});

// 앱 이벤트
app.whenReady().then(() => {
  loadRecentFiles();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// macOS에서 파일 열기 이벤트
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    openFilePath(filePath);
  }
});

// import { app, shell, BrowserWindow, protocol, session, ipcMain } from 'electron';
// import * as path from 'path';
// import { electronApp } from '@electron-toolkit/utils';

const { app, shell, BrowserWindow, protocol, session, ipcMain } = require('electron');
const path = require('path');
const { electronApp } = require('@electron-toolkit/utils');

const remote = require('@electron/remote/main');

remote.initialize(); // 主进程初始化

app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors'); // 允许跨域
app.commandLine.appendSwitch('disable-site-isolation-trials');
app.commandLine.appendSwitch('--ignore-certificate-errors', 'true'); // 忽略证书相关错误
protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { secure: true, standard: true } }]);

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
const { NODE_ENV } = process.env;
console.log(NODE_ENV);

let mainWindow; // 主窗口
let playWindow; // 播放窗口

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 840,
    minWidth: 840,
    height: 650,
    minHeight: 650,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux'
      ? {
          icon: path.join(__dirname, '../../build/icon.png'),
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, './preload.ts'),
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // 允许跨域
      allowRunningInsecureContent: false,
    },
  });

  remote.enable(mainWindow.webContents); // 启用remote

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  // if (is.dev && process.env.ELECTRON_RENDERER_URL) {
  //   mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  // } else {
  //   mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  // }
  mainWindow.loadURL(
    NODE_ENV === 'development' ? 'http://localhost:3000' : `file://${path.join(__dirname, '../dist/index.html')}`,
  );

  // 去掉默认菜单栏
  // Menu.setApplicationMenu(null);

  // 修改request headers
  // Sec-Fetch下禁止修改，浏览器自动加上请求头 https://www.cnblogs.com/fulu/p/13879080.html 暂时先用index.html的meta referer policy替代
  const filter = {
    urls: ['http://*/*', 'http://*/*'],
  };

  mainWindow.webContents.session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const url = new URL(details.url);
    details.requestHeaders.Origin = url.origin;
    console.log(details.requestHeaders.Origin);
    if (
      !details.url.includes('//localhost') &&
      details.requestHeaders.Referer &&
      details.requestHeaders.Referer.includes('//localhost')
    ) {
      details.requestHeaders.Referer = url.origin;
      console.log(details.requestHeaders.Origin);
    }
    callback({
      // https://github.com/electron/electron/issues/23988 回调似乎无法修改headers，暂时先用index.html的meta referer policy替代
      cancel: false,
      requestHeaders: details.requestHeaders,
    });
  });
}

// 这段程序将会在 Electron 结束初始化和创建浏览器窗口的时候调用
// 部分 API 在 ready 事件触发后才能使用。
app.whenReady().then(() => {
  // 为 Windows 设置应用程序用户模型 ID
  electronApp.setAppUserModelId('com.electron');

  // CSP
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ["connect-src * ws: http: https: 'self'"],
      },
    });
  });

  // 开发中默认按F12打开或关闭Dev Tools
  // 并在生产中忽略 Command 或 Control + R。
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  // app.on('browser-window-created', (_, window) => {
  //   optimizer.watchWindowShortcuts(window);
  // });

  createWindow();

  app.on('activate', () => {
    // 通常在 macOS 上，当点击 dock 中的应用程序图标时，如果没有其他
    // 打开的窗口，那么程序会重新创建一个窗口。
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

// 除了 macOS 外，当所有窗口都被关闭的时候退出程序。 因此，通常对程序和它们在
// 任务栏上的图标来说，应当保持活跃状态，直到用户使用 Cmd + Q 退出。
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
// 创建子窗口启用remote
app.on('browser-window-created', (_, window) => {
  remote.enable(window.webContents);
});

ipcMain.on('openPlayWindow', () => {
  const url = require('url');
  if (playWindow) playWindow.destroy();
  playWindow = new BrowserWindow({
    width: 850,
    minWidth: 850,
    height: 550,
    minHeight: 550,
    titleBarStyle: process.platform === 'darwin' ? 'hidden' : 'default',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      sandbox: false,
      nodeIntegration: true,
      contextIsolation: false,
      webSecurity: false, // 允许跨域
      allowRunningInsecureContent: false,
    },
  });
  playWindow.loadURL(
    NODE_ENV === 'development'
      ? 'http://localhost:3000/#/play'
      : url.format({
          pathname: path.join(__dirname, '../dist/index.html'),
          protocol: 'file:',
          slashes: true,
          hash: 'play',
        }),
  );
  playWindow.on('ready-to-show', () => {
    playWindow.show();
  });
  playWindow.on('closed', () => {
    if (mainWindow.isDestroyed()) {
      createWindow();
    } else {
      mainWindow.show();
    }
  });
});

ipcMain.on('showMainWin', async () => {
  console.log('显示主窗口');
  mainWindow.show();
});

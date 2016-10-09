const electron = require('electron');
const express = require('./express-app/app'); // the express app

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;


function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    autoHideMenuBar: true,
    useContentSize: true,
    resizable: false,
  });
  mainWindow.loadURL('http://localhost:8888/');
  mainWindow.focus();

  mainWindow.on('closed', function () {
    mainWindow = null
  })
}

app.on('ready', createWindow)

app.on('window-all-closed', function () {

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', function () {

  if (mainWindow === null) {
    createWindow()
  }
})

const electron = require('electron');
const express = require('./express-app/app'); // the express app

const app = electron.app;
const BrowserWindow = electron.BrowserWindow;
const mainAddr = 'http://localhost:8888/';

let mainWindow;



function createWindow () {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 800,
    autoHideMenuBar: true,
    useContentSize: true,
    resizable: false,
  });

  mainWindow.loadURL(mainAddr);
  mainWindow.focus();

  mainWindow.on('closed', function () {
    mainWindow = null
    //subpy.kill('SIGINT');
  })
};

//app.on('ready', createWindow)

app.on('ready', () => {

  createWindow();
  //
  // subpy = require('child_process').spawn('python', [__dirname + '/app.py']);
  //
  // var startUp = function(){
  //   rq(mainAddr)
  //     .then(function(htmlString){
  //       console.log('server started!');
  //       createWindow();
  //     })
  //     .catch(function(err){
  //       //console.log('waiting for the server start...');
  //       startUp();
  //     });
  // };
  //
  // // fire!
  // startUp();
});


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

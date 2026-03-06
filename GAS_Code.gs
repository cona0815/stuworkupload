/**
 * Google Apps Script 後端程式碼
 * 請將此程式碼複製到您的 GAS 專案中的 Code.gs 檔案
 */

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('學生個人專屬空間')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * 處理 API 請求 (用於 GitHub Pages 等外部託管)
 * 使用 POST 方法來避免複雜的 CORS 預檢請求
 */
function doPost(e) {
  try {
    // 解析請求參數
    const action = e.parameter.action;
    
    // 解析 POST Body (JSON)
    let payload = {};
    if (e.postData && e.postData.contents) {
      try {
        payload = JSON.parse(e.postData.contents);
      } catch (err) {
        // 忽略解析錯誤
      }
    }

    let result = {};

    // 只有寫入操作 (上傳檔案) 需要鎖定，避免並發寫入衝突
    if (action === 'uploadBase64File') {
      const lock = LockService.getScriptLock();
      // 嘗試獲取鎖，最多等待 10 秒
      if (lock.tryLock(10000)) {
        try {
          result = uploadBase64File(payload.fileInfo, payload.selectedFolder, payload.className, payload.seat);
        } finally {
          lock.releaseLock();
        }
      } else {
        return ContentService.createTextOutput(JSON.stringify({ success: false, message: '系統忙碌中，請稍後再試' }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    } 
    // 讀取操作 (登入、獲取列表) 不需要鎖定，可並發執行，提高多人同時使用的速度
    else if (action === 'getInitialData') {
      result = getInitialData();
    } else if (action === 'login') {
      result = login(payload.account, payload.password);
    } else if (action === 'getUploadedFiles') {
      result = getUploadedFiles();
    } else {
      result = { success: false, message: '未知的請求動作: ' + action };
    }

    // 回傳 JSON 結果
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 獲取初始化資料 (資料夾選項)
 */
function getInitialData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const folderSheet = ss.getSheetByName('資料夾設定');
    
    if (!folderSheet) {
      return { success: false, message: '找不到「資料夾設定」分頁' };
    }
    
    const rows = folderSheet.getDataRange().getValues();
    // 假設第一列是標題，從第二列開始讀取
    // A欄: 顯示名稱, B欄: 資料夾ID
    const folders = [];
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) {
        folders.push(rows[i][0]);
      }
    }
    
    return { success: true, folders: folders };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 學生登入驗證
 */
function login(account, password) {
  try {
    // 簡單驗證：帳號必須等於密碼
    if (account !== password) {
      return { success: false, message: '帳號與密碼不符' };
    }
    
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const studentSheet = ss.getSheetByName('學生名單');
    
    if (!studentSheet) {
      return { success: false, message: '找不到「學生名單」分頁' };
    }
    
    const rows = studentSheet.getDataRange().getValues();
    // 假設第一列是標題
    // A欄: 班級, B欄: 座號
    
    for (let i = 1; i < rows.length; i++) {
      const className = rows[i][0].toString();
      const seat = rows[i][1].toString();
      
      // 組合帳號 ID: 班級 + 座號
      const id = className + seat;
      
      if (id === account) {
        return {
          success: true,
          user: {
            className: className,
            seat: seat
          }
        };
      }
    }
    
    return { success: false, message: '找不到此學生帳號' };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

/**
 * 上傳檔案
 */
function uploadBase64File(fileInfo, selectedFolder, className, seat) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. 取得資料夾 ID
    const configSheet = ss.getSheetByName('資料夾設定');
    const configRows = configSheet.getDataRange().getValues();
    let folderId = '';
    
    for (let i = 1; i < configRows.length; i++) {
      if (configRows[i][0] === selectedFolder) {
        folderId = configRows[i][1];
        break;
      }
    }
    
    if (!folderId) {
      return { success: false, message: '找不到對應的 Google Drive 資料夾 ID' };
    }
    
    // 2. 上傳至 Drive
    const folder = DriveApp.getFolderById(folderId);
    const blob = Utilities.newBlob(
      Utilities.base64Decode(fileInfo.base64Data), 
      fileInfo.mimeType, 
      fileInfo.fileName
    );
    
    // 重新命名檔案: 班級-座號_原始檔名
    const newFileName = `${className}-${seat}_${fileInfo.fileName}`;
    const file = folder.createFile(blob);
    file.setName(newFileName);
    
    // 設定檔案權限 (視需求開啟)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    const fileUrl = file.getUrl();
    
    // 3. 寫入試算表紀錄
    let logSheet = ss.getSheetByName('檔案紀錄');
    if (!logSheet) {
      logSheet = ss.insertSheet('檔案紀錄');
      logSheet.appendRow(['時間', '班級', '座號', '作業項目', '檔案名稱', '連結']);
    }
    
    const time = new Date();
    logSheet.appendRow([time, className, seat, selectedFolder, newFileName, fileUrl]);
    
    return {
      success: true,
      fileName: newFileName,
      url: fileUrl
    };
    
  } catch (e) {
    return { success: false, message: '上傳失敗: ' + e.toString() };
  }
}

/**
 * 獲取已上傳檔案列表
 */
function getUploadedFiles() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const logSheet = ss.getSheetByName('檔案紀錄');
    
    if (!logSheet) {
      return { success: true, files: [] };
    }
    
    const rows = logSheet.getDataRange().getValues();
    const files = [];
    
    // 跳過標題列
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      // 假設欄位順序: 時間(0), 班級(1), 座號(2), 作業項目(3), 檔案名稱(4), 連結(5)
      if (row[0]) {
        files.push({
          time: row[0],
          className: row[1].toString(),
          seat: row[2].toString(),
          folder: row[3],
          fileName: row[4],
          url: row[5]
        });
      }
    }
    
    return { success: true, files: files };
  } catch (e) {
    return { success: false, message: e.toString() };
  }
}

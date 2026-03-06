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
 * 自動化功能：如果發現有「名稱」但沒有「ID」的列，會自動建立資料夾並回填 ID
 */
function getInitialData() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const folderSheet = ss.getSheetByName('資料夾設定');
    
    if (!folderSheet) {
      return { success: false, message: '找不到「資料夾設定」分頁' };
    }
    
    // 取得目前試算表所在的資料夾 (新資料夾會建在這裡)
    let parentFolder;
    try {
      const parents = DriveApp.getFileById(ss.getId()).getParents();
      if (parents.hasNext()) {
        parentFolder = parents.next();
      } else {
        parentFolder = DriveApp.getRootFolder();
      }
    } catch (e) {
      parentFolder = DriveApp.getRootFolder();
    }
    
    const range = folderSheet.getDataRange();
    const rows = range.getValues();
    const folders = [];
    
    // 遍歷每一列檢查是否需要建立資料夾
    for (let i = 0; i < rows.length; i++) {
      const name = rows[i][0]; // A欄: 名稱
      let id = rows[i][1];     // B欄: ID
      
      // 跳過空名稱或標題列
      if (!name || name === '顯示名稱' || name === '資料夾名稱') continue;
      
      // 如果沒有 ID，自動建立資料夾
      if (!id) {
        try {
          const newFolder = parentFolder.createFolder(name);
          id = newFolder.getId();
          
          // 將 ID 寫回試算表 B 欄 (i+1 是列號, 2 是 B 欄)
          folderSheet.getRange(i + 1, 2).setValue(id);
        } catch (err) {
          Logger.log('建立資料夾失敗: ' + err.toString());
        }
      }
      
      if (name) {
        folders.push(name);
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
 * 自動建立班級子資料夾 (例如：作業一 > 401 > 檔案)
 * 容錯機制：如果發現資料夾 ID 空白，會自動補建主資料夾
 */
function uploadBase64File(fileInfo, selectedFolder, className, seat) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 1. 取得資料夾 ID
    const configSheet = ss.getSheetByName('資料夾設定');
    const configRows = configSheet.getDataRange().getValues();
    let folderId = '';
    let rowIndex = -1;
    
    // 修改：從 i = 0 開始搜尋，以免使用者將資料填在第一列 (A1)
    for (let i = 0; i < configRows.length; i++) {
      // 使用 trim() 去除前後空白，並轉為字串比較，增加容錯率
      const rowName = configRows[i][0] ? configRows[i][0].toString().trim() : '';
      const targetName = selectedFolder ? selectedFolder.toString().trim() : '';

      // 跳過標題列 (如果剛好選到的名字跟標題一樣，雖然機率很低)
      if (rowName === '顯示名稱' || rowName === '資料夾名稱') continue;

      if (rowName === targetName) {
        folderId = configRows[i][1];
        rowIndex = i;
        break;
      }
    }
    
    // 如果找不到該選項名稱
    if (rowIndex === -1) {
      return { success: false, message: '找不到此作業項目: ' + selectedFolder };
    }

    // 如果有名稱但沒有 ID (自動修復機制)
    if (!folderId) {
      try {
        // 取得試算表所在的父資料夾
        const parents = DriveApp.getFileById(ss.getId()).getParents();
        const parentFolder = parents.hasNext() ? parents.next() : DriveApp.getRootFolder();
        
        // 建立新資料夾
        const newFolder = parentFolder.createFolder(selectedFolder);
        folderId = newFolder.getId();
        
        // 補填回試算表 (列號是 i+1, B欄是 2)
        configSheet.getRange(rowIndex + 1, 2).setValue(folderId);
      } catch (err) {
        return { success: false, message: '自動建立資料夾失敗: ' + err.toString() };
      }
    }
    
    if (!folderId) {
      return { success: false, message: '無法取得有效的資料夾 ID' };
    }
    
    // 2. 上傳至 Drive
    const mainFolder = DriveApp.getFolderById(folderId);
    
    // 檢查或建立班級子資料夾 (例如：401)
    let classFolder;
    const folders = mainFolder.getFoldersByName(className);
    if (folders.hasNext()) {
      classFolder = folders.next();
    } else {
      classFolder = mainFolder.createFolder(className);
    }

    // 解碼 Base64 並建立 Blob
    let base64String = fileInfo.base64Data;
    if (base64String.indexOf('base64,') > -1) {
      base64String = base64String.split('base64,')[1];
    }

    const blob = Utilities.newBlob(
      Utilities.base64Decode(base64String), 
      fileInfo.mimeType, 
      fileInfo.fileName
    );
    
    // 重新命名檔案: 班級-座號_原始檔名
    const newFileName = `${className}-${seat}_${fileInfo.fileName}`;
    const file = classFolder.createFile(blob);
    file.setName(newFileName);
    
    // 設定檔案權限 (視需求開啟)
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    
    // 修改：產生直接下載連結 (Direct Download Link)
    // 讓使用者點擊後直接下載，而不是進入 Google Drive 預覽頁面
    const fileUrl = "https://drive.google.com/uc?export=download&id=" + file.getId();
    
    // 3. 寫入試算表紀錄
    let logSheet = ss.getSheetByName('檔案紀錄');
    if (!logSheet) {
      logSheet = ss.insertSheet('檔案紀錄');
      logSheet.appendRow(['時間', '班級', '座號', '作業項目', '檔案名稱', '連結']);
    }
    
    const time = new Date();
    // 格式化時間為字串，避免時區問題
    const formattedTime = Utilities.formatDate(time, Session.getScriptTimeZone(), "yyyy/MM/dd HH:mm:ss");
    
    // 修改：座號前加上單引號 "'" 強制轉為文字格式，避免 Google Sheet 自動將 "07" 轉為數字 7
    logSheet.appendRow([formattedTime, className, "'" + seat, selectedFolder, newFileName, fileUrl]);
    
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
          // 修改：讀取座號時，自動補 0 (例如 7 -> 07)，確保跟登入資訊一致
          seat: row[2].toString().padStart(2, '0'),
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

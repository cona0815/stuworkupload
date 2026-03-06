import { UserSession, FileRecord } from './mock-backend';

// 從環境變數獲取 GAS Web App URL
const GAS_API_URL = import.meta.env.VITE_GAS_API_URL || '';

/**
 * 透過 HTTP Fetch 呼叫 GAS API
 * 適用於 GitHub Pages 等外部託管環境
 */
export const gasHeadlessBackend = {
  
  async request(action: string, payload: any = {}) {
    if (!GAS_API_URL) {
      throw new Error('未設定 VITE_GAS_API_URL 環境變數，無法連線到 Google Apps Script。');
    }

    // 使用 POST 方法，並設定 Content-Type 為 text/plain 以避免 CORS Preflight (OPTIONS) 請求
    // GAS 會自動處理 302 Redirect，Fetch API 會自動跟隨
    const response = await fetch(`${GAS_API_URL}?action=${action}`, {
      method: 'POST',
      mode: 'cors',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
    });

    if (!response.ok) {
      throw new Error(`API 請求失敗: ${response.statusText}`);
    }

    return await response.json();
  },

  async getInitialData() {
    return this.request('getInitialData');
  },

  async login(account: string, password: string) {
    return this.request('login', { account, password });
  },

  async uploadBase64File(fileInfo: { fileName: string, mimeType: string, base64Data: string }, selectedFolder: string, className: string, studentInfo: string) {
    // studentInfo 在這裡是 seat
    return this.request('uploadBase64File', { 
      fileInfo, 
      selectedFolder, 
      className, 
      seat: studentInfo 
    });
  },

  async getUploadedFiles() {
    return this.request('getUploadedFiles');
  }
};

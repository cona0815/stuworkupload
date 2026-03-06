import { FileRecord, UserSession } from './mock-backend';

// Declare google global for GAS environment
declare global {
  interface Window {
    google: {
      script: {
        run: {
          withSuccessHandler: (callback: (response: any) => void) => {
            withFailureHandler: (callback: (error: any) => void) => any;
          };
          withFailureHandler: (callback: (error: any) => void) => {
            withSuccessHandler: (callback: (response: any) => void) => any;
          };
          [key: string]: any;
        };
      };
    };
  }
}

// Helper to wrap google.script.run in a Promise
const runGasFunction = (name: string, ...args: any[]): Promise<any> => {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.google || !window.google.script) {
      reject(new Error('Google Apps Script environment not found'));
      return;
    }

    window.google.script.run
      .withSuccessHandler((response: any) => {
        resolve(response);
      })
      .withFailureHandler((error: any) => {
        reject(error);
      })
      [name](...args);
  });
};

export const gasBackend = {
  async getInitialData() {
    return runGasFunction('getInitialData');
  },

  async login(account: string, password: string): Promise<{ success: boolean; user?: UserSession; message?: string }> {
    return runGasFunction('login', account, password);
  },

  async uploadBase64File(fileInfo: { fileName: string, mimeType: string, base64Data: string }, selectedFolder: string, className: string, studentInfo: string) {
    // studentInfo is just seat now, but keeping signature compatible
    return runGasFunction('uploadBase64File', fileInfo, selectedFolder, className, studentInfo);
  },

  async getUploadedFiles() {
    return runGasFunction('getUploadedFiles');
  }
};


export interface Student {
  seat: string;
  // name removed for privacy
}

export interface StudentList {
  [className: string]: Student[];
}

export interface FileRecord {
  time: string;
  className: string;
  seat: string;
  // name removed for privacy
  folder: string;
  fileName: string;
  url: string;
}

// Initial Mock Data
const INITIAL_FOLDERS = ["國文作業", "數學報告", "專題簡報", "美術作品"];
const INITIAL_STUDENTS: StudentList = {
  "701": [
    { seat: "01" },
    { seat: "02" },
  ],
  "702": [
    { seat: "01" },
  ],
  "401": [
    { seat: "30" }
  ]
};

export interface UserSession {
  className: string;
  seat: string;
  // name removed for privacy
}

class MockBackend {
  private folders: string[] = INITIAL_FOLDERS;
  private students: StudentList = INITIAL_STUDENTS;
  private uploads: FileRecord[] = [];

  constructor() {
    // Load from localStorage if available to persist across reloads
    if (typeof window !== 'undefined') {
      const savedUploads = localStorage.getItem('mock_uploads');
      if (savedUploads) {
        this.uploads = JSON.parse(savedUploads);
      }
    }
  }

  async login(account: string, password: string): Promise<{ success: boolean; user?: UserSession; message?: string }> {
    await this.delay(800);

    if (account !== password) {
      return { success: false, message: "帳號與密碼不符" };
    }

    // Try to find the student matching the account string
    // Strategy: Iterate through all classes and students, construct the ID, and compare.
    // Assuming ID = Class + Seat (e.g. 701 + 01 = 70101, 401 + 30 = 40130)
    
    for (const [className, students] of Object.entries(this.students)) {
      for (const student of students) {
        const id = `${className}${student.seat}`;
        if (id === account) {
          return {
            success: true,
            user: {
              className,
              seat: student.seat
            }
          };
        }
      }
    }

    return { success: false, message: "找不到此學生帳號" };
  }

  async getInitialData() {
    await this.delay(500);
    return {
      success: true,
      folders: this.folders,
      students: this.students
    };
  }

  async getMissingSubmissions(folderName: string, className: string) {
    await this.delay(500);
    
    if (!this.students[className]) {
      return { success: true, missing: [`在'學生名單'中找不到班級 '${className}' 的學生。`] };
    }

    const classStudents = this.students[className].map(s => `${className}-${s.seat}`);
    
    const submittedStudents = new Set(
      this.uploads
        .filter(u => u.folder === folderName && u.className === className)
        .map(u => `${u.className}-${u.seat}`)
    );

    const missing = classStudents.filter(s => !submittedStudents.has(s)).sort();
    
    return { success: true, missing };
  }

  async uploadBase64File(fileInfo: { fileName: string, mimeType: string, base64Data: string }, selectedFolder: string, className: string, studentInfo: string) {
    await this.delay(1500); // Simulate upload time

    const [seat] = studentInfo.split('-');
    
    const newFile: FileRecord = {
      time: new Date().toISOString(),
      className,
      seat,
      folder: selectedFolder,
      fileName: `${className}-${seat}_${fileInfo.fileName}`,
      url: `data:${fileInfo.mimeType};base64,${fileInfo.base64Data}`
    };

    this.uploads.push(newFile);
    localStorage.setItem('mock_uploads', JSON.stringify(this.uploads));

    return { 
      success: true, 
      message: "檔案上傳成功！", 
      fileName: newFile.fileName, 
      folder: selectedFolder, 
      url: newFile.url 
    };
  }

  async getUploadedFiles() {
    await this.delay(500);
    // Sort by time desc
    const sorted = [...this.uploads].sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
    return { success: true, files: sorted };
  }

  private delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const mockBackend = new MockBackend();

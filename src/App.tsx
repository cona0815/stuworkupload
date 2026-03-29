/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, 
  FolderOpen, 
  RefreshCw, 
  FileText, 
  CheckCircle, 
  AlertCircle, 
  Loader2, 
  Folder, 
  File,
  LogOut,
  User,
  X
} from 'lucide-react';
import { backend, FileRecord, UserSession } from './lib/api';

// --- Types ---
type Tab = 'upload' | 'download';
type StatusType = 'loading' | 'success' | 'error' | 'idle';

export default function App() {
  // --- Auth State ---
  const [user, setUser] = useState<UserSession | null>(null);
  const [loginAccount, setLoginAccount] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // --- App State ---
  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<{ type: StatusType; message: string }>({ type: 'idle', message: '' });
  
  // Data State
  const [folders, setFolders] = useState<string[]>([]);
  
  // Upload Form State
  const [selectedFolder, setSelectedFolder] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  
  // File Explorer State
  const [uploadedFiles, setUploadedFiles] = useState<FileRecord[]>([]);
  const [fileFilter, setFileFilter] = useState('all');
  const [sortOrder, setSortOrder] = useState<'newest' | 'oldest'>('newest');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const step3Ref = useRef<HTMLDivElement>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // --- Effects ---
  useEffect(() => {
    if (user) {
      loadInitialData();
    }
  }, [user]);

  useEffect(() => {
    if (user && activeTab === 'download') {
      loadUploadedFiles();
    }
  }, [user, activeTab]);

  // --- Actions ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginAccount || !loginPassword) {
      showStatus('error', '請輸入帳號與密碼');
      return;
    }

    setIsLoading(true);
    try {
      const res = await backend.login(loginAccount, loginPassword);
      if (res.success && res.user) {
        setUser(res.user);
        // 移除登入成功的提示訊息
      } else {
        showStatus('error', res.message || '登入失敗');
      }
    } catch (error: any) {
      showStatus('error', error.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    setUser(null);
    setLoginAccount('');
    setLoginPassword('');
    setSelectedFolder('');
    setSelectedFile(null);
    setActiveTab('upload');
  };

  const loadInitialData = async () => {
    // Only need folders now, student list is not needed for selection
    try {
      const res = await backend.getInitialData();
      if (res.success) {
        setFolders(res.folders);
      }
    } catch (error: any) {
      showStatus('error', error.message);
    }
  };

  const loadUploadedFiles = async () => {
    if (!user) return;
    setIsLoadingFiles(true);
    try {
      const res = await backend.getUploadedFiles();
      if (res.success) {
        // Filter for current user only
        const myFiles = res.files.filter(f => 
          f.className === user.className && 
          f.seat === user.seat
        );
        setUploadedFiles(myFiles);
      } else {
        showStatus('error', res.message || '載入檔案失敗');
      }
    } catch (error: any) {
      showStatus('error', error.message);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  // --- Constants ---
  const FORBIDDEN_EXTENSIONS = [
    '.exe', '.bat', '.cmd', '.sh', '.msi', '.com', 
    '.js', '.vbs', '.ps1', '.php', '.jar', '.scr', 
    '.reg', '.dll', '.py', '.pl', '.cgi'
  ];

  const validateFile = (file: File): boolean => {
    // Check size
    if (file.size > 50 * 1024 * 1024) {
      showStatus('error', '錯誤：檔案大小超過 50MB 限制。');
      return false;
    }

    // Check extension
    const fileName = file.name.toLowerCase();
    const isForbidden = FORBIDDEN_EXTENSIONS.some(ext => fileName.endsWith(ext));
    
    if (isForbidden) {
      showStatus('error', '錯誤：禁止上傳執行檔或腳本檔案 (如 .exe, .bat, .js 等)，以防病毒。');
      return false;
    }

    return true;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      
      if (!validateFile(file)) {
        if (fileInputRef.current) fileInputRef.current.value = '';
        return;
      }

      setSelectedFile(file);
      
      // Scroll to submit button
      setTimeout(() => {
        step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      
      if (!validateFile(file)) {
        return;
      }

      setSelectedFile(file);
      setTimeout(() => {
        step3Ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!selectedFolder) return showStatus('error', '請選擇作業。');
    if (!selectedFile) return showStatus('error', '請選擇要上傳的檔案。');

    setIsLoading(true);
    showStatus('loading', '檔案上傳中，請稍候...');

    try {
      // Convert file to base64
      const reader = new FileReader();
      reader.readAsDataURL(selectedFile);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(',')[1];
        const fileInfo = {
          fileName: selectedFile.name,
          mimeType: selectedFile.type || 'application/octet-stream',
          base64Data
        };

        // Use logged-in user info
        const studentInfo = `${user.seat}`;
        const res = await backend.uploadBase64File(fileInfo, selectedFolder, user.className, studentInfo);
        
        if (res.success) {
          showStatus('success', `成功！檔案 "${res.fileName}" 已上傳。`);
          // Reset form
          setSelectedFile(null);
          if (fileInputRef.current) fileInputRef.current.value = '';
        } else {
          showStatus('error', res.message || '上傳失敗');
        }
        setIsLoading(false);
      };
    } catch (error: any) {
      showStatus('error', `發生錯誤: ${error.message}`);
      setIsLoading(false);
    }
  };

  const showStatus = (type: StatusType, message: string) => {
    setStatus({ type, message });
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    if (type !== 'loading') {
      // 成功訊息不再自動消失 (除非使用者點擊關閉)，錯誤訊息持續 5 秒
      if (type === 'error') {
        statusTimeoutRef.current = setTimeout(() => setStatus({ type: 'idle', message: '' }), 5000);
      }
    }
  };

  // --- Derived State ---
  const step1Active = !selectedFolder;
  const step2Active = !!selectedFolder && !selectedFile;
  const step3Active = !!selectedFolder && !!selectedFile;

  const uniqueFolders = Array.from(new Set(uploadedFiles.map(f => f.folder).filter(Boolean)));
  const filteredFiles = fileFilter === 'all' 
    ? uploadedFiles 
    : uploadedFiles.filter(f => f.folder === fileFilter);

  const sortedFiles = [...filteredFiles].sort((a, b) => {
    const dateA = new Date(a.time).getTime();
    const dateB = new Date(b.time).getTime();
    return sortOrder === 'newest' ? dateB - dateA : dateA - dateB;
  });

  // 找出所有檔案中最晚的上傳時間
  const newestTimestamp = sortedFiles.length > 0 
    ? Math.max(...sortedFiles.map(f => {
        const d = new Date(f.time).getTime();
        return isNaN(d) ? 0 : d;
      }))
    : 0;

  // --- Login View ---
  if (!user) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans text-gray-800">
        <div className="w-full max-w-md bg-white rounded-xl shadow-lg p-8 animate-in fade-in zoom-in duration-300">
          <div className="text-center mb-8">
            <div className="bg-blue-500 text-white p-4 rounded-full inline-flex mb-4 shadow-md">
              <User className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-gray-800">學生個人專屬空間</h1>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">帳號</label>
              <input
                type="text"
                value={loginAccount}
                onChange={(e) => setLoginAccount(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">密碼</label>
              <input
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-700 transition shadow-md flex justify-center items-center"
            >
              {isLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : '登入系統'}
            </button>
          </form>

          {status.type === 'error' && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm flex items-center justify-center animate-in shake">
              <AlertCircle className="w-4 h-4 mr-2" />
              {status.message}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- Main App View (Personal Space) ---
  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center p-4 font-sans text-gray-800">
      <div className="w-full max-w-5xl bg-white rounded-xl shadow-lg p-6 md:p-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center">
            <div className="bg-blue-500 text-white p-3 rounded-full mr-4 shadow-md">
              <User className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-800">個人專屬空間</h1>
              <p className="text-gray-500 font-medium">
                {user.className}班 {user.seat}號
              </p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50 transition text-sm font-medium"
          >
            <LogOut className="w-4 h-4 mr-2" />
            登出
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-8">
          <button 
            onClick={() => setActiveTab('upload')}
            className={`py-2 px-6 border-b-2 font-bold focus:outline-none transition-colors flex items-center gap-2 ${
              activeTab === 'upload' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <UploadCloud className="w-4 h-4" />
            上傳作業
          </button>
          <button 
            onClick={() => setActiveTab('download')}
            className={`py-2 px-6 border-b-2 font-bold focus:outline-none transition-colors flex items-center gap-2 ${
              activeTab === 'download' 
                ? 'border-blue-500 text-blue-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FolderOpen className="w-4 h-4" />
            我的檔案
          </button>
        </div>

        {/* Upload Section */}
        {activeTab === 'upload' && (
          <div className="max-w-2xl mx-auto animate-in fade-in duration-300">
            <form onSubmit={handleSubmit} className="space-y-8">
              
              {/* Step 1 */}
              <div className={`flex items-start space-x-4 p-4 rounded-xl transition-all duration-300 ${step1Active ? 'bg-blue-50/50 border border-blue-100' : ''}`}>
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm transition-all duration-300 ${
                  step1Active ? 'bg-blue-500 text-white ring-4 ring-blue-300 ring-offset-2 shadow-[0_0_15px_rgba(59,130,246,0.6)] scale-110' :
                  selectedFolder ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-500'
                }`}>1</div>
                <div className="flex-grow">
                  <label htmlFor="folderSelect" className="block text-lg font-medium text-gray-800 mb-2">選擇作業項目</label>
                  <div className="relative">
                    <select 
                      id="folderSelect"
                      value={selectedFolder}
                      onChange={(e) => setSelectedFolder(e.target.value)}
                      className="w-full p-3 pr-8 border border-gray-300 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none bg-white text-lg"
                      disabled={isLoading}
                    >
                      <option value="" disabled>請選擇作業</option>
                      {folders.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-gray-700">
                      <svg className="fill-current h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className={`flex items-start space-x-4 p-4 rounded-xl transition-all duration-300 ${step2Active ? 'bg-orange-50/50 border border-orange-100' : ''}`}>
                <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm transition-all duration-300 ${
                  step2Active ? 'bg-orange-500 text-white ring-4 ring-orange-300 ring-offset-2 shadow-[0_0_15px_rgba(249,115,22,0.6)] scale-110' :
                  selectedFile ? 'bg-orange-500 text-white' : 'bg-gray-300 text-gray-500'
                }`}>2</div>
                <div className="flex-grow">
                  <label className="block text-lg font-medium text-gray-800 mb-2">上傳檔案</label>
                  <div 
                    className={`relative w-full border-2 rounded-xl flex flex-col justify-center items-center text-center cursor-pointer transition-all duration-300 ease-in-out ${
                      selectedFile 
                        ? 'h-auto p-6 border-solid border-green-500 bg-green-50' 
                        : 'h-56 border-dashed border-gray-300 hover:border-blue-500 hover:bg-blue-50'
                    }`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <input 
                      type="file" 
                      ref={fileInputRef}
                      onChange={handleFileSelect}
                      className="hidden" 
                    />
                    
                    {selectedFile ? (
                      <div className="text-green-600 flex flex-col items-center justify-center animate-in zoom-in duration-300">
                        <CheckCircle className="w-12 h-12 mb-3" />
                        <p className="text-lg font-bold">已選擇檔案</p>
                        <p className="text-sm mt-1 opacity-80">點擊可更換</p>
                      </div>
                    ) : (
                      <div className="text-gray-500 pointer-events-none">
                        <UploadCloud className="mx-auto h-12 w-12 text-gray-400 mb-3" />
                        <p className="text-lg font-medium text-gray-700">點擊或將檔案拖曳至此</p>
                        <p className="text-sm text-gray-400 mt-2">支援所有格式 (最大 50MB)</p>
                      </div>
                    )}
                  </div>
                  <div className={`mt-4 text-base font-medium rounded-lg p-3 flex items-center justify-center text-center transition-colors ${selectedFile ? 'text-gray-900 bg-gray-100' : 'text-gray-400 bg-gray-50'}`}>
                    {selectedFile ? selectedFile.name : '尚未選擇檔案'}
                  </div>
                </div>
              </div>

              {/* Step 3 */}
              {selectedFile && (
                <div ref={step3Ref} className={`pt-6 pb-2 flex justify-center items-center space-x-4 animate-in slide-in-from-bottom-4 duration-500 p-4 rounded-xl transition-all ${step3Active ? 'bg-purple-50/50 border border-purple-100' : ''}`}>
                  <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold shadow-sm transition-all duration-300 ${
                    step3Active ? 'bg-purple-500 text-white ring-4 ring-purple-300 ring-offset-2 shadow-[0_0_15px_rgba(168,85,247,0.6)] scale-110' :
                    'bg-gray-300 text-gray-500'
                  }`}>3</div>
                  <button 
                    type="submit" 
                    disabled={isLoading}
                    className={`w-full md:w-2/3 flex justify-center items-center font-bold py-4 px-6 rounded-xl focus:outline-none transition-all duration-300 ${
                      isLoading 
                        ? 'bg-gray-400 text-white cursor-not-allowed' 
                        : 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.6)] hover:bg-blue-700 hover:-translate-y-1 hover:shadow-[0_0_25px_rgba(37,99,235,0.8)] ring-4 ring-blue-300 ring-offset-2 animate-pulse'
                    }`}
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                        處理中...
                      </>
                    ) : '確認上傳檔案'}
                  </button>
                </div>
              )}
            </form>
          </div>
        )}

        {/* Download Section */}
        {activeTab === 'download' && (
          <div className="animate-in fade-in duration-300">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
              <div className="flex items-center space-x-4">
                <h2 className="text-xl font-bold text-gray-800 flex items-center">
                  <Folder className="w-6 h-6 text-yellow-500 mr-2" />
                  我的檔案庫
                </h2>
                <div className="relative">
                  <select 
                    value={fileFilter}
                    onChange={(e) => setFileFilter(e.target.value)}
                    className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer appearance-none"
                  >
                    <option value="all">所有作業</option>
                    {uniqueFolders.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-500">
                    <Folder className="w-4 h-4" />
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>

                {/* Sort Order */}
                <div className="relative">
                  <select 
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value as 'newest' | 'oldest')}
                    className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm cursor-pointer appearance-none"
                  >
                    <option value="newest">最新日期在先</option>
                    <option value="oldest">最舊日期在先</option>
                  </select>
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center px-3 text-gray-500">
                    <RefreshCw className="w-4 h-4" />
                  </div>
                  <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                    <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                  </div>
                </div>
              </div>

              <button 
                onClick={loadUploadedFiles}
                disabled={isLoadingFiles}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-200 transition flex items-center font-medium shadow-sm border border-gray-200 disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoadingFiles ? 'animate-spin' : ''}`} />
                重新整理
              </button>
            </div>

            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 min-h-[300px]">
              {isLoadingFiles ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-500">
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin mb-4" />
                  <p className="font-medium text-lg">正在載入檔案，請稍候...</p>
                </div>
              ) : sortedFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                  <FolderOpen className="w-16 h-16 mb-4 opacity-50" />
                  <p className="text-lg font-medium">您還沒有上傳任何檔案</p>
                  <button onClick={() => setActiveTab('upload')} className="mt-4 text-blue-600 hover:underline">
                    去上傳第一份作業吧！
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                  {sortedFiles.map((file, idx) => {
                    const date = new Date(file.time);
                    const fileTimestamp = date.getTime();
                    const isNewest = fileTimestamp === newestTimestamp && newestTimestamp > 0;
                    
                    const timeStr = isNaN(date.getTime()) 
                      ? file.time 
                      : `${date.getMonth()+1}/${date.getDate()} ${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
                    
                    return (
                      <a 
                        key={idx}
                        href={file.url}
                        download={file.fileName}
                        target="_blank"
                        rel="noreferrer"
                        className={`relative bg-white p-4 rounded-xl border hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col items-center text-center group cursor-pointer overflow-hidden animate-in zoom-in duration-300 ${
                          isNewest ? 'border-blue-400 ring-2 ring-blue-100 shadow-md' : 'border-gray-200 hover:border-blue-400'
                        }`}
                        style={{ animationDelay: `${idx * 50}ms` }}
                        title="點擊下載檔案"
                      >
                        <span className="absolute top-2 left-2 bg-blue-50 text-blue-700 text-[10px] font-bold px-2 py-1 rounded w-max max-w-[60%] truncate shadow-sm">
                          {file.folder}
                        </span>

                        {isNewest && (
                          <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-black px-2 py-1 rounded shadow-sm animate-bounce">
                            NEW
                          </span>
                        )}
                        
                        <File className={`w-16 h-16 mt-6 mb-3 group-hover:scale-110 transition-transform duration-200 ${
                          isNewest ? 'text-blue-600' : 'text-blue-400 group-hover:text-blue-500'
                        }`} />

                        <h3 className="text-sm font-bold text-gray-800 w-full truncate px-1" title={file.fileName}>
                          {file.fileName}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 font-medium bg-gray-100 px-2 py-0.5 rounded-full w-max max-w-full truncate">
                          {file.className} {file.seat}號
                        </p>
                        <p className="text-[11px] text-gray-400 mt-2">
                          {timeStr}
                        </p>
                      </a>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Status Toast / Modal */}
        {status.type !== 'idle' && (
          <>
            {/* 成功時顯示半透明背景，加強置中提示感 */}
            {status.type === 'success' && (
              <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[49] animate-in fade-in duration-300" />
            )}
            
            <div className={`fixed z-50 transition-all duration-500 flex flex-col items-center justify-center ${
              status.type === 'success' 
                ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-2xl p-10 rounded-3xl animate-in zoom-in-95 fade-in' 
                : 'top-8 left-1/2 -translate-x-1/2 px-8 py-4 rounded-2xl animate-in slide-in-from-top-8 fade-in'
            } shadow-2xl ${
              status.type === 'loading' ? 'bg-blue-600 text-white' :
              status.type === 'success' ? 'bg-green-600 text-white border-8 border-green-400 shadow-[0_0_50px_rgba(22,163,74,0.8)]' :
              'bg-red-600 text-white border-2 border-red-400'
            }`}>
              <div className={`flex items-center ${status.type === 'success' ? 'flex-col space-y-6 text-center' : 'space-x-4'}`}>
                {status.type === 'loading' && <Loader2 className="w-7 h-7 animate-spin" />}
                {status.type === 'success' && <CheckCircle className="w-24 h-24 mb-2" />}
                {status.type === 'error' && <AlertCircle className="w-7 h-7" />}
                
                <div className="flex flex-col">
                  {status.type === 'success' && <span className="text-3xl font-black mb-2 tracking-wider">上傳成功！</span>}
                  <span className={`font-bold ${status.type === 'success' ? 'text-2xl leading-relaxed' : 'text-xl'}`}>
                    {status.message}
                  </span>
                </div>
              </div>

              {status.type !== 'loading' && (
                <button 
                  onClick={() => {
                    setStatus({ type: 'idle', message: '' });
                    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
                  }} 
                  className={`hover:bg-white/20 rounded-full transition-all duration-200 ${
                    status.type === 'success' 
                      ? 'mt-10 bg-white/10 px-10 py-3 border border-white/30 hover:scale-105 active:scale-95' 
                      : 'ml-6 p-2'
                  }`}
                  title="關閉"
                >
                  {status.type === 'success' ? (
                    <span className="text-xl font-bold flex items-center">
                      我知道了 <X className="w-6 h-6 ml-2" />
                    </span>
                  ) : (
                    <X className="w-6 h-6" />
                  )}
                </button>
              )}
            </div>
          </>
        )}

      </div>
    </div>
  );
}


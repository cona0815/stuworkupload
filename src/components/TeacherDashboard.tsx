import React, { useState, useEffect } from 'react';
import { 
  Users, 
  CheckCircle2, 
  XCircle, 
  ArrowLeft,
  Calendar,
  Search,
  Filter
} from 'lucide-react';
import { backend, FileRecord } from '../lib/api';

interface TeacherDashboardProps {
  onBack: () => void;
}

export default function TeacherDashboard({ onBack }: TeacherDashboardProps) {
  const [allFiles, setAllFiles] = useState<FileRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedFolder, setSelectedFolder] = useState<string>('all');
  const [folders, setFolders] = useState<string[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('all');
  const [classes, setClasses] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  });

  useEffect(() => {
    loadData();

    // Auto refresh every 30 seconds
    const intervalId = setInterval(() => {
      loadData(true);
    }, 30000);

    return () => clearInterval(intervalId);
  }, []);

  const loadData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      const [filesRes, initialRes] = await Promise.all([
        backend.getUploadedFiles(),
        backend.getInitialData()
      ]);

      if (filesRes.success) {
        setAllFiles(filesRes.files);
        const uniqueClasses = Array.from(new Set(filesRes.files.map(f => f.className)));
        setClasses(uniqueClasses);
      }

      if (initialRes.success) {
        setFolders(initialRes.folders);
      }
    } catch (error) {
      console.error('Failed to load teacher data:', error);
    } finally {
      if (!silent) setIsLoading(false);
    }
  };

  // Filter files for selected date and criteria
  const getSubmissionStatus = (seatNumber: number) => {
    const seatStr = seatNumber.toString().padStart(2, '0');
    
    return allFiles.some(file => {
      const d = new Date(file.time);
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const fileDateStr = `${year}-${month}-${day}`;
      
      const matchesDate = fileDateStr === selectedDate;
      const matchesSeat = file.seat === seatStr;
      const matchesFolder = selectedFolder === 'all' || file.folder === selectedFolder;
      const matchesClass = selectedClass === 'all' || file.className === selectedClass;
      
      return matchesDate && matchesSeat && matchesFolder && matchesClass;
    });
  };

  const seats = Array.from({ length: 32 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
          <div className="flex items-center">
            <button 
              onClick={onBack}
              className="mr-4 p-2 hover:bg-gray-200 rounded-full transition"
            >
              <ArrowLeft className="w-6 h-6 text-gray-600" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-800 flex items-center">
                <Users className="w-8 h-8 mr-3 text-blue-600" />
                教師管理介面
              </h1>
              <div className="text-gray-500 flex items-center mt-2">
                <Calendar className="w-4 h-4 mr-2" />
                <input 
                  type="date" 
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="px-2 py-1 border border-gray-300 rounded bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
                />
              </div>
            </div>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <div className="relative">
              <select 
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
              >
                <option value="all">所有班級</option>
                {classes.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <Filter className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            </div>

            <div className="relative">
              <select 
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 outline-none appearance-none cursor-pointer"
              >
                <option value="all">所有作業</option>
                {folders.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
            </div>

            <button 
              onClick={loadData}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition flex items-center text-sm font-medium shadow-sm"
            >
              重新整理
            </button>
          </div>
        </div>

        {/* Status Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
            <div className="bg-green-100 p-3 rounded-full mr-4">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">指定日期已繳交</p>
              <p className="text-2xl font-bold text-gray-800">
                {seats.filter(s => getSubmissionStatus(s)).length} 人
              </p>
            </div>
          </div>
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center">
            <div className="bg-red-100 p-3 rounded-full mr-4">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500 font-medium">指定日期未繳交</p>
              <p className="text-2xl font-bold text-gray-800">
                {seats.filter(s => !getSubmissionStatus(s)).length} 人
              </p>
            </div>
          </div>
        </div>

        {/* Grid */}
        <div className="bg-white p-4 md:p-6 rounded-2xl shadow-md border border-gray-200">
          <h2 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
            座號繳交狀態 (1-32)
            <span className="ml-3 text-xs font-normal text-gray-500">
              綠色表示指定日期已上傳檔案
            </span>
          </h2>
          
          {isLoading ? (
            <div className="flex justify-center py-10">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2 md:gap-3">
              {seats.map(seat => {
                const isSubmitted = getSubmissionStatus(seat);
                return (
                  <div 
                    key={seat}
                    className={`
                      aspect-square flex flex-col items-center justify-center rounded-lg border-2 transition-all duration-300
                      ${isSubmitted 
                        ? 'bg-green-50 border-green-500 text-green-700 shadow-[0_0_5px_rgba(34,197,94,0.2)]' 
                        : 'bg-white border-gray-200 text-gray-300'
                      }
                    `}
                  >
                    <span className="text-sm md:text-base font-bold">{seat}</span>
                    {isSubmitted && <CheckCircle2 className="w-3 h-3 mt-0.5" />}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="mt-8 flex items-center justify-center space-x-8 text-sm font-medium text-gray-600">
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-500 rounded mr-2"></div>
            <span>已繳交</span>
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-white border-2 border-gray-200 rounded mr-2"></div>
            <span>未繳交</span>
          </div>
        </div>
      </div>
    </div>
  );
}

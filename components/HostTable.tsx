'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Trash2, Activity, Wifi, WifiOff, AlertCircle, Pencil, LineChart, History, ChevronLeft, ChevronRight, MoreHorizontal, Server } from 'lucide-react';
import EditHostForm from './EditHostForm';
import { toast } from 'react-toastify';

function DowntimeTimer({ lastDownTime }: { lastDownTime: any }) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (!lastDownTime) return null;
  
  // SQLite returns 'YYYY-MM-DD HH:MM:SS' in UTC
  // Replace space with T and add Z to make it explicit UTC
  const downDate = new Date(lastDownTime.replace(' ', 'T') + 'Z');
  const diffMs = now.getTime() - downDate.getTime();
  
  if (diffMs < 0) return <span>Just now</span>;
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return <span>{days}d {hours % 24}h</span>;
  if (hours > 0) return <span>{hours}h {minutes % 60}m</span>;
  if (minutes > 0) return <span>{minutes}m {seconds % 60}s</span>;
  return <span>{seconds}s</span>;
}

interface HostTableProps {
  hosts: any[];
  userRole?: string;
  onDelete: any;
  onEdit: any;
  onShowGraph: any;
  onShowStatusHistory: any;
}

export default function HostTable({ hosts, userRole = 'view-only', onDelete, onEdit, onShowGraph, onShowStatusHistory }: HostTableProps) {
  const [editingHostId, setEditingHostId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDropdown, setActiveDropdown] = useState(null);
  const dropdownRef = useRef(null);

  // Reset to page 1 when search or data length changes dramatically
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, rowsPerPage]);

  // Handle clicking outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: any) {
      if (dropdownRef.current && !(dropdownRef.current as any).contains(event.target)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const filteredHosts = useMemo(() => {
    const safeHosts = Array.isArray(hosts) ? hosts : [];
    if (!searchTerm) return safeHosts;
    const lower = searchTerm.toLowerCase();
    return safeHosts.filter((h: any) => 
      (h.name || '').toLowerCase().includes(lower) || 
      (h.ip || '').toLowerCase().includes(lower)
    );
  }, [hosts, searchTerm]);

  const totalPages = Math.ceil(filteredHosts.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentHosts = filteredHosts.slice(startIndex, startIndex + rowsPerPage);

  if (!hosts || hosts.length === 0) {
    return (
      <div className="text-center p-8 text-slate-500 bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
        No hosts monitored. Add one to start.
      </div>
    );
  }

  const handleSave = async (id: number, data: any) => {
    await onEdit(id, data);
    setEditingHostId(null);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden flex flex-col h-full">
      {/* Table Header Header */}
      <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-blue-50 dark:bg-blue-500/10 rounded-md">
            <Server className="w-4 h-4 text-blue-500" />
          </div>
          <h2 className="text-[13px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            Host Monitor
          </h2>
        </div>
      </div>

      {/* Table Controls (Search & Rows per page) */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-900/20">
        <div className="relative w-full sm:w-64">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search table..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-md leading-5 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
          />
        </div>
        
        <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
          <span>Show:</span>
          <select
            value={rowsPerPage}
            onChange={(e) => setRowsPerPage(Number(e.target.value))}
            className="border border-slate-300 dark:border-slate-600 rounded-md py-1 pl-2 pr-8 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
          <span>entries</span>
        </div>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider font-semibold">
              <th className="px-4 py-5 w-12 text-center">SN</th>
              <th className="px-4 py-5 w-28">Status</th>
              <th className="px-4 py-5 w-40">Device</th>
              <th className="px-4 py-5 text-center w-52">Ping (ms)</th>
              <th className="px-4 py-5 text-center w-20">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-700">
            {currentHosts.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-8 text-center text-slate-500 dark:text-slate-400">
                  No records found matching "{searchTerm}"
                </td>
              </tr>
            ) : (
              currentHosts.map((host: any, index: number) => {
                const isDown = host.status === 'Down';
                const isUp = host.status === 'Up';
                const isEditing = editingHostId === host.id;
                const threshold = host.latency_threshold || 100;
                const isHighLatency = isUp && typeof host.latency_avg === 'number' && host.latency_avg > threshold;
                
                return (
                  <tr 
                    key={host.id} 
                    className={`
                      transition-colors hover:bg-slate-50 dark:hover:bg-slate-700/50 relative group
                      ${isDown ? 'bg-red-50/50 dark:bg-red-900/10' : ''}
                      ${isHighLatency ? 'bg-orange-50/50 dark:bg-orange-900/10' : ''}
                    `}
                  >
                    <td className="px-4 py-6 text-center text-sm text-slate-500 dark:text-slate-400 font-mono">
                      {startIndex + index + 1}
                    </td>
                    <td className="px-4 py-6">
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      {isUp ? (
                        <Wifi className={`w-5 h-5 ${isHighLatency ? 'text-orange-500' : 'text-emerald-500'}`} />
                      ) : isDown ? (
                        <WifiOff className="w-5 h-5 text-red-500 animate-pulse" />
                      ) : (
                        <Activity className="w-5 h-5 text-slate-400" />
                      )}
                      <span className={`
                        font-medium px-2 py-1 rounded-full text-xs uppercase tracking-wider
                        ${isUp && !isHighLatency ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : ''}
                        ${isUp && isHighLatency ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : ''}
                        ${isDown ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : ''}
                        ${!isUp && !isDown ? 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400' : ''}
                      `}>
                        {isHighLatency ? 'DEGRADED' : (host.status ? host.status.toUpperCase() : 'UNKNOWN')}
                      </span>
                    </div>
                    {isDown && host.last_down_time && (
                      <div className="text-[10px] text-red-500/80 font-medium ml-7 mt-0.5">
                        <DowntimeTimer lastDownTime={host.last_down_time} />
                      </div>
                    )}
                  </div>
                </td>
                <td className="px-4 py-6 font-medium relative">
                  <div className="flex flex-col">
                    <span className="text-slate-900 dark:text-slate-100">{host.name}</span>
                    <span className="text-xs text-slate-500 font-mono mt-0.5">{host.ip}</span>
                  </div>
                  {isEditing && (
                    <div className="absolute top-0 left-0 z-10 mt-2">
                      <EditHostForm 
                        host={host} 
                        onSave={handleSave} 
                        onCancel={() => setEditingHostId(null)} 
                      />
                    </div>
                  )}
                </td>
                    <td className="px-4 py-6">
                      <div className="flex justify-center gap-4">
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Min</span>
                          <span className="font-mono text-xs">{typeof host.latency_min === 'number' ? host.latency_min.toFixed(1) : '-'}</span>
                        </div>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-blue-500 dark:text-blue-400 uppercase tracking-wider mb-1 font-bold">Avg</span>
                          <span className={`font-mono text-sm font-bold ${isHighLatency ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'}`}>
                            {typeof host.latency_avg === 'number' ? host.latency_avg.toFixed(1) : '-'}
                          </span>
                        </div>
                        <div className="w-px h-8 bg-slate-200 dark:bg-slate-700"></div>
                        <div className="flex flex-col items-center">
                          <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Max</span>
                          <div className="flex flex-col items-center">
                            <span className="font-mono text-xs">{typeof host.latency_max === 'number' ? host.latency_max.toFixed(1) : '-'}</span>
                            <span className="text-[9px] text-slate-400 lowercase leading-tight">thr: {threshold}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                <td className="px-4 py-6 text-center">
                  <div className="relative inline-block text-left">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveDropdown(activeDropdown === host.id ? null : host.id);
                      }}
                      className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700 rounded-md transition-colors"
                      title="More actions"
                    >
                      <MoreHorizontal className="w-5 h-5" />
                    </button>

                    {activeDropdown === host.id && (
                      <div 
                        ref={dropdownRef}
                        className="absolute right-0 mt-2 w-12 bg-white dark:bg-slate-800 rounded-md shadow-lg border border-slate-200 dark:border-slate-700 z-50 py-2 flex flex-col items-center gap-2"
                      >
                        <button
                          onClick={() => {
                            onShowStatusHistory(host);
                            setActiveDropdown(null);
                          }}
                          className="p-2 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-md transition-colors"
                          title="Show Status History"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            onShowGraph(host);
                            setActiveDropdown(null);
                          }}
                          className="p-2 text-slate-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/20 rounded-md transition-colors"
                          title="Show Ping History"
                        >
                          <LineChart className="w-4 h-4" />
                        </button>
                        
                        <button
                          onClick={() => {
                            if (userRole === 'view-only') {
                              toast.error("You don't have permission for this operation", { position: "top-right" });
                              return;
                            }
                            setEditingHostId(host.id);
                            setActiveDropdown(null);
                          }}
                          className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                          title="Edit Host"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            if (userRole === 'view-only') {
                              toast.error("You don't have permission for this operation", { position: "top-right" });
                              return;
                            }
                            onDelete(host.id);
                            setActiveDropdown(null);
                          }}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                          title="Delete Host"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            );
          })
        )}
      </tbody>
    </table>
  </div>

  {/* Pagination Controls */}
      {filteredHosts.length > 0 && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/20 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-sm text-slate-600 dark:text-slate-400">
            Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, filteredHosts.length)} of {filteredHosts.length} entries
          </div>
          
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className={`
                px-3 py-1.5 rounded-md text-sm font-medium transition-colors border
                ${currentPage === 1 
                  ? 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50' 
                  : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900'}
              `}
            >
              Previous
            </button>
            
            {Array.from({ length: totalPages }).map((_, idx) => {
              const page = idx + 1;
              const isCurrent = page === currentPage;
              
              // Simple pagination logic to avoid too many buttons
              if (
                totalPages > 7 && 
                page !== 1 && 
                page !== totalPages && 
                Math.abs(page - currentPage) > 1
              ) {
                if (page === 2 || page === totalPages - 1) {
                  return <span key={page} className="px-2 text-slate-400">...</span>;
                }
                return null;
              }

              return (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`
                    px-3 py-1.5 rounded-md text-sm font-medium transition-colors border
                    ${isCurrent 
                      ? 'bg-blue-600 border-blue-600 text-white shadow-sm' 
                      : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900'}
                  `}
                >
                  {page}
                </button>
              );
            })}

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className={`
                px-3 py-1.5 rounded-md text-sm font-medium transition-colors border
                ${currentPage === totalPages 
                  ? 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50' 
                  : 'border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900'}
              `}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

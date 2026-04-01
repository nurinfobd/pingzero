'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Network, Clock, AlertTriangle, Search } from 'lucide-react';

interface InterfaceStat {
  id: number;
  interface_id: string;
  interface_name: string;
  interface_description: string;
  device_name: string;
  device_ip: string;
  device_snmp_status?: string;
  status: number;
  last_down_time: string | null;
}

export default function DownInterfacesTable() {
  const [stats, setStats] = useState<InterfaceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(new Date());
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/snmp/interfaces/stats');
        const data = await response.json();
        // Strict filter: only show if status is definitely not 1 (Up)
        setStats(data.filter((item: InterfaceStat) => Number(item.status) !== 1));
      } catch (error) {
        console.error('Error fetching down interfaces:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 10000); // 10s refresh
    const timer = setInterval(() => setNow(new Date()), 1000); // 1s for duration update
    
    return () => {
      clearInterval(interval);
      clearInterval(timer);
    };
  }, []);

  // Reset to page 1 when search or rows count changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, rowsPerPage]);

  const formatDuration = (downTimeStr: string | null) => {
    if (!downTimeStr) return '---';
    const downTime = new Date(downTimeStr);
    const diff = Math.floor((now.getTime() - downTime.getTime()) / 1000);
    
    if (diff < 0) return 'Just now';
    if (diff < 60) return `${diff}s`;
    
    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `${minutes}m ${diff % 60}s`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ${minutes % 60}m`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  };

  const filteredStats = useMemo(() => {
    if (!searchTerm) return stats;
    const term = searchTerm.toLowerCase();
    return stats.filter(s =>
      s.interface_name.toLowerCase().includes(term) ||
      (s.interface_description || '').toLowerCase().includes(term) ||
      s.device_name.toLowerCase().includes(term) ||
      (s.device_ip || '').includes(term)
    );
  }, [stats, searchTerm]);

  // Pagination logic
  const totalPages = Math.ceil(filteredStats.length / rowsPerPage);
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredStats.slice(indexOfFirstRow, indexOfLastRow);

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col h-full">
      <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-rose-50 dark:bg-rose-500/10 rounded-md">
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <h2 className="text-[13px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            Down Interfaces
          </h2>
        </div>
        <span className="px-2 py-0.5 bg-rose-100 dark:bg-rose-500/20 text-rose-600 dark:text-rose-400 text-[10px] font-bold rounded-full">
          {stats.length} ALERTS
        </span>
      </div>

      {/* Search & Row Filter Controls */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-900/20">
        <div className="relative w-full sm:w-56">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-slate-400" />
          </div>
          <input
            type="text"
            placeholder="Search down interfaces..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="block w-full pl-10 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-rose-500 transition-all font-medium"
          />
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <span>Show:</span>
          <select 
            value={rowsPerPage}
            onChange={(e) => setRowsPerPage(Number(e.target.value))}
            className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-rose-500 font-bold text-slate-700 dark:text-slate-300 transition-colors"
          >
            <option value={5}>5</option>
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
          </select>
          <span className="font-normal text-slate-400 uppercase tracking-tight">entries</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs">Loading...</div>
        ) : filteredStats.length === 0 ? (
          <div className="p-8 text-center flex flex-col items-center gap-2">
            <div className="w-10 h-10 rounded-full bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
              <Network className="w-5 h-5 text-emerald-500 opacity-40" />
            </div>
            <p className="text-xs text-slate-400 font-medium">
              {stats.length === 0 ? 'All interfaces are operational.' : 'No matching down interfaces found.'}
            </p>
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/30 dark:bg-slate-800/30 border-b border-slate-200/50 dark:border-slate-800/50">
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-tight w-10 text-center">SN</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-tight">Interface (Device)</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-tight">Down Since</th>
                <th className="px-4 py-2.5 text-[10px] font-bold text-slate-500 uppercase tracking-tight text-right">Duration</th>
              </tr>
            </thead>
            <tbody>
              {currentRows.map((row, index) => (
                <tr key={row.id} className="border-b border-slate-100 dark:border-slate-800/50 hover:bg-rose-50/10 dark:hover:bg-rose-500/5 transition-colors">
                  <td className="px-4 py-3 text-[10px] font-bold text-slate-400/70 text-center font-mono">
                    {indexOfFirstRow + index + 1}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200 font-mono">
                        {row.interface_name}
                      </span>
                      {row.interface_description && (
                        <span className="text-[10px] text-teal-600 dark:text-teal-400 font-medium truncate max-w-[200px]" title={row.interface_description}>
                          {row.interface_description}
                        </span>
                      )}
                      <span className="text-[9px] text-slate-400 dark:text-slate-500 flex items-center gap-1 italic">
                        {row.device_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                      <Clock className="w-3 h-3 opacity-60" />
                      {row.last_down_time ? new Date(row.last_down_time).toLocaleTimeString() : '---'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[10px] font-mono font-bold rounded border border-slate-200/50 dark:border-slate-700">
                      {formatDuration(row.last_down_time)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination Footer */}
      {filteredStats.length > 0 && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 italic">
            Showing {indexOfFirstRow + 1} to {Math.min(indexOfLastRow, filteredStats.length)} of {filteredStats.length} down interfaces
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              Previous
            </button>
            <div className="flex gap-1">
              {[...Array(totalPages)].map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPage(i + 1)}
                  className={`min-w-[32px] h-8 text-[11px] font-bold border rounded-lg transition-all active:scale-95 ${
                    currentPage === i + 1 
                      ? 'bg-rose-600 border-rose-600 text-white shadow-sm' 
                      : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700'
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="px-3 py-1.5 text-xs font-bold border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 disabled:opacity-40 hover:bg-slate-50 dark:hover:bg-slate-700 transition-all active:scale-95"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { Network, Search, ArrowUpRight, ArrowDownLeft, Activity, RefreshCw, BarChart2 } from 'lucide-react';
import { io } from 'socket.io-client';
import InterfaceTrafficModal from './InterfaceTrafficModal';

let socket: any;

interface InterfaceStat {
  id: number;
  device_id: number;
  interface_id: string;
  interface_name: string;
  interface_description: string;
  device_name: string;
  device_ip: string;
  device_snmp_status?: string;
  capacity_mbps: number;
  current_in_mbps: number;
  current_out_mbps: number;
  max_in_mbps: number;
  max_out_mbps: number;
  rx_power: number | null;
  tx_power: number | null;
  updated_at: string;
}

export default function InterfaceMonitorTable() {
  const [stats, setStats] = useState<InterfaceStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [selectedRow, setSelectedRow] = useState<InterfaceStat | null>(null);

  useEffect(() => {
    fetchStats();

    // Initialize socket connection consistent with other components
    if (!socket) {
      socket = io();
    }

    // Listen for SNMP updates via socket
    const handleUpdate = () => {
      // Refresh stats when a cycle completes to ensure up/down counts are synced
      fetchStats();
    };
    socket.on('snmp:update', handleUpdate);

    const handleStats = (data: any) => {
      setStats(data);
    };
    socket.on('snmp:stats', handleStats);

    // Add a periodic refresh interval
    const interval = setInterval(fetchStats, 5000); // 5s refresh

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('snmp:update', handleUpdate);
        socket.off('snmp:stats', handleStats);
      }
    };
  }, []);

  // Reset to page 1 when search or rows count changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, rowsPerPage]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/snmp/interfaces/stats');
      if (res.ok) {
        const data = await res.json();
        setStats(data);
      }
    } catch (err) {
      console.error("Failed to fetch interface stats", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredStats = useMemo(() => {
    const base = stats.filter(s => 
      s.interface_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (s.interface_description || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.device_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.device_ip.includes(searchTerm)
    );

    return [...base].sort((a: any, b: any) => {
      // Calculate utilization for sorting
      const getUtil = (row: any) => {
        if (row.device_snmp_status === 'Down' || !row.capacity_mbps || row.capacity_mbps <= 0) return 0;
        const util = ((row.current_in_mbps + row.current_out_mbps) / row.capacity_mbps) * 100;
        return isNaN(util) ? 0 : util;
      };

      const utilA = getUtil(a);
      const utilB = getUtil(b);

      if (utilA !== utilB) return utilB - utilA; // Descending
      return a.interface_name.localeCompare(b.interface_name);
    });
  }, [stats, searchTerm]);

  // Pagination logic
  const totalPages = Math.ceil(filteredStats.length / rowsPerPage);
  const indexOfLastRow = currentPage * rowsPerPage;
  const indexOfFirstRow = indexOfLastRow - rowsPerPage;
  const currentRows = filteredStats.slice(indexOfFirstRow, indexOfLastRow);

  const formatMbps = (val: number) => {
    if (val === 0) return "0.00";
    if (val < 0.01) return "< 0.01";
    return val.toFixed(2);
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden flex flex-col h-full">
      {/* Table Header Wrapper */}
      <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-teal-50 dark:bg-teal-500/10 rounded-md">
            <Activity className="w-4 h-4 text-teal-500" />
          </div>
          <h2 className="text-[13px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            Interface Monitoring
          </h2>
        </div>
        {loading && <RefreshCw className="w-4 h-4 animate-spin text-teal-500" />}
      </div>

      {/* Table Controls (Search & Rows per page) */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-900/20">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="Search interfaces..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-sm placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all font-medium"
            />
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <span>Show:</span>
            <select 
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-teal-500 font-bold text-slate-700 dark:text-slate-300 transition-colors"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span className="font-normal text-slate-400 uppercase tracking-tight">entries</span>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 w-12 text-center">SN</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">Interface / Device</th>
                <th className="px-2 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 text-center">Current Traffic (Mbps)</th>
                <th className="px-2 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 text-center">Max Traffic (Mbps)</th>
                <th className="px-2 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 text-center">Capacity Usage</th>
                <th className="px-2 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 text-center">Optical (Rx/Tx)</th>
                <th className="px-4 py-3 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800 text-center">Charts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading && stats.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Activity className="w-8 h-8 text-slate-300 dark:text-slate-700 animate-pulse" />
                      <p className="text-sm text-slate-400 font-medium">Loading statistics from devices...</p>
                    </div>
                  </td>
                </tr>
              ) : currentRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Search className="w-6 h-6 text-slate-300 dark:text-slate-700" />
                      <p className="text-sm text-slate-400">No monitored interfaces found. Add them in the SNMP device settings.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                currentRows.map((row, index) => {
                  const isDeviceDown = row.device_snmp_status === 'Down';
                  const utilization = (!isDeviceDown && row.capacity_mbps > 0)
                    ? Math.min(100, Math.max(0, ((row.current_in_mbps + row.current_out_mbps) / row.capacity_mbps) * 100))
                    : 0;
                  
                    const getOpticalStatus = (val: number, isRx: boolean, capacity: number) => {
                      if (!val || val === 0) return 'normal';
                      
                      // Thresholds based on capacity (Mbps)
                      if (capacity <= 1200) { // 1G
                        if (isRx) return (val < -22 || val > -1) ? 'critical' : (val < -20 || val > -2) ? 'warning' : 'normal';
                        // 1G Tx: Working range -3dB and up (+ values fine)
                        return (val < -3) ? 'critical' : 'normal';
                      } else { // 10G or more
                        if (isRx) {
                          if (capacity <= 12000) return (val < -16 || val > 1) ? 'critical' : (val < -14 || val > 0) ? 'warning' : 'normal';
                          return (val < -14 || val > 4) ? 'critical' : (val < -12 || val > 3) ? 'warning' : 'normal';
                        }
                        // 10G+ Tx: Positive value is best, alert if minus
                        return (val < 0) ? 'critical' : 'normal';
                      }
                    };

                    const renderPower = (val: any, isRx: boolean) => {
                      if (val === null || val === undefined) return null;
                      const sVal = String(val);
                      const isMulti = sVal.includes(',');
                      const lanes = isMulti ? sVal.split(',') : [sVal];
                      const capacity = row.capacity_mbps || 0;

                      const bgColor = isRx ? 'bg-emerald-50 dark:bg-emerald-500/10' : 'bg-indigo-50 dark:bg-indigo-500/10';
                      const borderColor = isRx ? 'border-emerald-100 dark:border-emerald-500/20' : 'border-indigo-100 dark:border-indigo-500/20';
                      const textColor = isRx ? 'text-emerald-600 dark:text-emerald-400' : 'text-indigo-600 dark:text-indigo-400';
                      const iconColor = isRx ? 'text-emerald-500' : 'text-indigo-500';
                      const labelColor = isRx ? 'text-emerald-400/70' : 'text-indigo-400/70';

                      if (isMulti) {
                        return (
                          <div className={`grid grid-cols-2 gap-1 p-1 rounded-md border ${borderColor} ${isDeviceDown ? 'bg-slate-50 dark:bg-slate-800' : 'bg-slate-50/30 dark:bg-slate-900/40'}`}>
                            {lanes.map((lane, i) => {
                              const v = parseFloat(lane);
                              const status = getOpticalStatus(v, isRx, capacity);
                              const statusClass = status === 'critical' ? 'text-rose-500 animate-pulse' : status === 'warning' ? 'text-amber-500' : textColor;
                              
                              return (
                                <div key={i} className={`flex items-center justify-between gap-1 px-1 py-0.5 rounded bg-white dark:bg-slate-800 border ${status !== 'normal' ? 'border-amber-500/30' : 'border-slate-100 dark:border-slate-700'} min-w-[48px]`}>
                                  <span className="text-[7px] font-bold opacity-40 uppercase">L{i}</span>
                                  <span className={`text-[9px] font-mono font-bold ${isDeviceDown ? 'text-slate-400' : statusClass}`}>
                                    {isDeviceDown ? '---' : v.toFixed(1)}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }

                      const v = parseFloat(sVal);
                      const status = getOpticalStatus(v, isRx, capacity);
                      const statusClass = status === 'critical' ? 'text-rose-500 animate-pulse' : status === 'warning' ? 'text-amber-500' : textColor;
                      const boxClass = status === 'critical' ? 'bg-rose-50 dark:bg-rose-500/10 border-rose-200' : status === 'warning' ? 'bg-amber-50 dark:bg-amber-500/10 border-amber-200' : bgColor;

                      return (
                        <div className={`flex items-center gap-2 justify-between px-2 py-0.5 ${isDeviceDown ? 'bg-slate-50 dark:bg-slate-800' : boxClass} rounded-md border ${isDeviceDown ? 'border-slate-100 dark:border-slate-700' : borderColor} w-full`}>
                          {isRx ? <ArrowDownLeft className={`w-3 h-3 ${isDeviceDown ? 'text-slate-400' : iconColor}`} /> : <ArrowUpRight className={`w-3 h-3 ${isDeviceDown ? 'text-slate-400' : iconColor}`} />}
                          <span className={`text-[10px] font-mono font-bold ${isDeviceDown ? 'text-slate-400' : statusClass}`}>
                            {isDeviceDown ? '0.00' : v.toFixed(2)} dBm
                          </span>
                          <span className={`text-[8px] font-bold uppercase ${labelColor}`}>{isRx ? 'Rx' : 'Tx'}</span>
                        </div>
                      );
                    };

                    return (
                      <tr key={row.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group ${isDeviceDown ? 'opacity-70 grayscale-[0.3]' : ''}`}>
                        <td className="px-4 py-4 text-xs font-bold text-slate-400/70 text-center font-mono">
                          {indexOfFirstRow + index + 1}
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex flex-col">
                            <span className="text-sm font-bold text-slate-700 dark:text-slate-200 font-mono text-left">
                              {row.interface_name}
                            </span>
                            {row.interface_description && (
                              <span className="text-[11px] text-teal-600 dark:text-teal-400 font-medium mt-0.5 truncate max-w-[280px]" title={row.interface_description}>
                                {row.interface_description}
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1 font-medium italic mt-0.5">
                              <Network className="w-3 h-3 opacity-60" />
                              {row.device_name} ({row.device_ip})
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-4">
                          <div className="flex flex-col items-center gap-1.5 focus-within:shadow-md transition-shadow">
                            <div className={`flex items-center gap-2 min-w-[110px] justify-between px-2.5 py-1 ${isDeviceDown ? 'bg-slate-50 dark:bg-slate-800' : 'bg-blue-50 dark:bg-blue-500/10'} rounded-md border ${isDeviceDown ? 'border-slate-100 dark:border-slate-700' : 'border-blue-100 dark:border-blue-500/20'}`}>
                              <ArrowDownLeft className={`w-3.5 h-3.5 ${isDeviceDown ? 'text-slate-400' : 'text-blue-500'}`} />
                              <span className={`text-[11px] font-mono font-bold ${isDeviceDown ? 'text-slate-400' : 'text-blue-600 dark:text-blue-400'}`}>{isDeviceDown ? '0.00' : formatMbps(row.current_in_mbps)}</span>
                              <span className="text-[9px] font-bold text-blue-400/70 uppercase">In</span>
                            </div>
                            <div className={`flex items-center gap-2 min-w-[110px] justify-between px-2.5 py-1 ${isDeviceDown ? 'bg-slate-50 dark:bg-slate-800' : 'bg-purple-50 dark:bg-purple-500/10'} rounded-md border ${isDeviceDown ? 'border-slate-100 dark:border-slate-700' : 'border-purple-100 dark:border-purple-500/20'}`}>
                              <ArrowUpRight className={`w-3.5 h-3.5 ${isDeviceDown ? 'text-slate-400' : 'text-purple-500'}`} />
                              <span className={`text-[11px] font-mono font-bold ${isDeviceDown ? 'text-slate-400' : 'text-purple-600 dark:text-purple-400'}`}>{isDeviceDown ? '0.00' : formatMbps(row.current_out_mbps)}</span>
                              <span className="text-[9px] font-bold text-purple-400/70 uppercase">Out</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-4">
                          <div className="flex flex-col items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-opacity">
                            <div className="flex items-center gap-2 min-w-[110px] justify-between px-2.5 py-1 bg-slate-50/50 dark:bg-slate-800 rounded-md border border-slate-200/50 dark:border-slate-700">
                              <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">{formatMbps(row.max_in_mbps)}</span>
                              <span className="text-[9px] font-bold text-slate-400/50 uppercase">Max In</span>
                            </div>
                            <div className="flex items-center gap-2 min-w-[110px] justify-between px-2.5 py-1 bg-slate-50/50 dark:bg-slate-800 rounded-md border border-slate-200/50 dark:border-slate-700">
                              <span className="text-[11px] font-mono font-bold text-slate-500 dark:text-slate-400">{formatMbps(row.max_out_mbps)}</span>
                              <span className="text-[9px] font-bold text-slate-400/50 uppercase">Max Out</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-4">
                          <div className="flex flex-col gap-1.5 w-36 mx-auto">
                            <div className="flex justify-between items-baseline mb-0.5">
                              <span className={`text-[11px] font-mono font-bold ${
                                isDeviceDown ? 'text-slate-400 dark:text-slate-600' :
                                utilization > 90 ? 'text-rose-500 animate-pulse' : 
                                utilization > 75 ? 'text-amber-500' : 
                                'text-emerald-500 dark:text-emerald-400'
                              }`}>
                                {isDeviceDown ? '---' : `${utilization.toFixed(1)}%`}
                              </span>
                              <span className="text-[10px] font-bold text-slate-400 dark:text-slate-600 italic">
                                 Cap: {row.capacity_mbps || 0} Mbps
                              </span>
                            </div>
                            <div className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden border border-slate-200/20 dark:border-slate-700/50 transition-all">
                              <div 
                                className={`h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(0,0,0,0.1)] ${
                                  isDeviceDown ? 'bg-slate-200 dark:bg-slate-700' :
                                  utilization > 90 ? 'bg-gradient-to-r from-rose-500 to-rose-400' :
                                  utilization > 70 ? 'bg-gradient-to-r from-amber-500 to-amber-400' :
                                  'bg-gradient-to-r from-emerald-500 to-teal-400'
                                }`}
                                style={{ width: `${isDeviceDown ? '0' : utilization}%` }}
                              />
                            </div>
                            {isDeviceDown && <span className="text-[8px] font-bold text-rose-500 tracking-tighter uppercase whitespace-nowrap">Device Offline</span>}
                          </div>
                        </td>
                        <td className="px-2 py-4">
                          <div className="flex flex-col items-center gap-1 w-full min-w-[120px]">
                            {row.rx_power !== null || row.tx_power !== null ? (
                              <>
                                {renderPower(row.rx_power, true)}
                                {renderPower(row.tx_power, false)}
                              </>
                            ) : (
                              <span className="text-[10px] font-mono font-bold text-slate-300 dark:text-slate-600 italic">- N/A -</span>
                            )}
                          </div>
                        </td>
                      <td className="px-4 py-4 text-center">
                        <button
                          onClick={() => setSelectedRow(row)}
                          disabled={isDeviceDown}
                          className={`p-2 rounded-xl transition-all ${
                            isDeviceDown 
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-300 dark:text-slate-700 cursor-not-allowed' 
                              : 'bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400 hover:bg-teal-500 hover:text-white dark:hover:bg-teal-500 shadow-sm hover:shadow-teal-500/20 active:scale-90'
                          }`}
                          title="View Traffic Graph"
                        >
                          <BarChart2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-900/40">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400 italic">
            Showing {indexOfFirstRow + 1} to {Math.min(indexOfLastRow, filteredStats.length)} of {filteredStats.length} monitored interfaces
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
                      ? 'bg-teal-600 border-teal-600 text-white shadow-sm' 
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
      {/* Traffic History Modal */}
      {selectedRow && (
        <InterfaceTrafficModal 
          row={selectedRow} 
          onClose={() => setSelectedRow(null)} 
        />
      )}
    </div>
  );
}

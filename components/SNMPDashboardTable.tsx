import { useState, useEffect, useMemo } from 'react';
import { Network, Activity, Cpu, Clock, HardDrive, ArrowUpCircle, ArrowDownCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { io } from 'socket.io-client';

let socket: any;

interface SNMPDevice {
  id: number;
  name: string;
  ip: string;
  device_type: string;
  monitor_sysname: boolean;
  monitor_cpu: boolean;
  monitor_uptime: boolean;
  monitor_interfaces: string; // JSON string
  
  // These would ideally come from live polling, but for now we'll mock or parse them
  sysname_val?: string;
  cpu_val?: string;
  uptime_val?: string;
  interface_up_count?: number;
  interface_down_count?: number;
  snmp_status?: string;
}

export default function SNMPDashboardTable() {
  const [devices, setDevices] = useState<SNMPDevice[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    fetchDevices();
    
    // Initialize socket connection
    if (!socket) {
      socket = io();
    }

    const handleUpdate = (data: SNMPDevice[]) => {
      setDevices(data);
    };

    socket.on('snmp:update', handleUpdate);

    const interval = setInterval(fetchDevices, 5000);

    return () => {
      clearInterval(interval);
      if (socket) {
        socket.off('snmp:update', handleUpdate);
      }
    };
  }, []);

  // Reset to page 1 when search or rows count changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, rowsPerPage]);

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/snmp');
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
      }
    } catch (err) {
      console.error("Failed to fetch SNMP devices", err);
    } finally {
      setLoading(false);
    }
  };

  const filteredDevices = useMemo(() => {
    const safeDevices = Array.isArray(devices) ? devices : [];
    const lower = searchTerm.toLowerCase();
    const base = !searchTerm ? safeDevices : safeDevices.filter((d: any) => 
      (d.name || '').toLowerCase().includes(lower) || 
      (d.ip || '').toLowerCase().includes(lower) ||
      (d.device_type || '').toLowerCase().includes(lower)
    );

    return [...base].sort((a: any, b: any) => {
      // Priority: Down (0) > Up (1) > Others (2)
      const getPriority = (status: string) => {
        if (status === 'Down') return 0;
        if (status === 'Up') return 1;
        return 2;
      };
      
      const priorityA = getPriority(a.snmp_status);
      const priorityB = getPriority(b.snmp_status);
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [devices, searchTerm]);

  const totalPages = Math.ceil(filteredDevices.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const currentDevices = filteredDevices.slice(startIndex, startIndex + rowsPerPage);

  if (loading && devices.length === 0) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm p-8 text-center">
        <Activity className="w-8 h-8 text-slate-300 dark:text-slate-600 animate-pulse mx-auto mb-3" />
        <p className="text-slate-500 dark:text-slate-400 text-sm">Loading SNMP devices...</p>
      </div>
    );
  }

  if (devices.length === 0) {
    return null;
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden flex flex-col h-full">
      {/* Table Header Wrapper */}
      <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 dark:bg-indigo-500/10 rounded-md">
            <Network className="w-4 h-4 text-indigo-500" />
          </div>
          <h2 className="text-[13px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
            SNMP Devices
          </h2>
        </div>
      </div>

      {/* Table Controls (Search & Rows per page) */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-900/20">
          <div className="relative w-full sm:w-64">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="h-4 w-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search SNMP devices..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-slate-300 dark:border-slate-700 rounded-md leading-5 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 sm:text-sm transition-colors"
            />
          </div>
          
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span>Show:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => setRowsPerPage(Number(e.target.value))}
              className="border border-slate-300 dark:border-slate-700 rounded-md py-1 pl-2 pr-8 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={5}>5</option>
              <option value={10}>10</option>
              <option value={25}>25</option>
              <option value={50}>50</option>
            </select>
            <span>entries</span>
          </div>
        </div>

        <div className="overflow-x-auto flex-1">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800 uppercase text-xs tracking-wider">
              <tr>
                <th className="px-6 py-4 font-bold border-r border-slate-200/50 dark:border-slate-700/50">Device</th>
                <th className="px-6 py-4 font-bold border-r border-slate-200/50 dark:border-slate-700/50 text-center">Type</th>
                <th className="px-6 py-4 font-bold border-r border-slate-200/50 dark:border-slate-700/50 text-center">System Status</th>
                <th className="px-6 py-4 font-bold border-r border-slate-200/50 dark:border-slate-700/50 text-center">Interfaces</th>
                <th className="px-6 py-4 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {currentDevices.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-slate-500 dark:text-slate-400">
                    No matching SNMP devices found
                  </td>
                </tr>
              ) : (
                currentDevices.map((device) => {
                  let interfaceCount = 0;
                  try {
                    const parsed = JSON.parse(device.monitor_interfaces || '[]');
                    interfaceCount = Array.isArray(parsed) ? parsed.length : 0;
                  } catch (e) {}

                  const formatMetric = (val: string | undefined) => {
                    if (!val || val === '...') return '...';
                    if (val.toUpperCase().includes('NO SUCH OBJECT') || val.toUpperCase().includes('NOT EXISTS')) {
                      return 'Not Fetched';
                    }
                    return val;
                  };

                  return (
                    <tr key={device.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors border-b border-slate-100 dark:border-slate-800/50">
                      <td className="px-6 py-4 border-r border-slate-100/50 dark:border-slate-800/30">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white text-[14px]">
                              {device.name}
                            </span>
                            <span className="text-slate-300 dark:text-slate-700 font-light mx-1">|</span>
                            <span className="text-[12px] font-mono text-slate-500 dark:text-slate-400">
                              {device.ip}
                            </span>
                          </div>
                          {device.monitor_sysname && (
                            <div className="text-[10px] font-bold text-blue-500 dark:text-blue-400 uppercase tracking-widest mt-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded border border-blue-100 dark:border-blue-800/30 w-fit leading-tight">
                              {formatMetric(device.sysname_val)}
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 border-r border-slate-100/50 dark:border-slate-800/30 text-center">
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 rounded text-[10px] font-black uppercase tracking-tighter">
                          {device.device_type}
                        </span>
                      </td>
                      <td className="px-6 py-4 border-r border-slate-100/50 dark:border-slate-800/30">
                        <div className="flex flex-col gap-2 items-center">
                          {device.monitor_cpu ? (
                            <div className="flex items-center gap-2 px-3 py-1 bg-purple-500/5 text-purple-600 dark:text-purple-400 rounded-full border border-purple-500/10 w-full justify-center">
                              <Cpu className="w-3 h-3 text-purple-500" />
                              <span className="text-[11px] font-mono font-bold">{formatMetric(device.cpu_val)}</span>
                            </div>
                          ) : null}
                          {device.monitor_uptime ? (
                            <div className="flex items-center gap-2 px-3 py-1 bg-amber-500/5 text-amber-600 dark:text-amber-400 rounded-lg border border-amber-500/10 w-full justify-center shadow-sm">
                              <Clock className="w-3 h-3 text-amber-500" />
                              <span className="text-[10px] font-mono font-bold leading-tight">{formatMetric(device.uptime_val)}</span>
                            </div>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-6 py-4 border-r border-slate-100/50 dark:border-slate-800/30">
                        <div className="flex justify-center gap-4">
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-widest mb-1">Total</span>
                            <span className="font-mono text-lg font-bold text-slate-700 dark:text-slate-200">{interfaceCount}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] text-emerald-500 uppercase font-black tracking-widest mb-1 flex items-center gap-1"><ArrowUpCircle className="w-2.5 h-2.5"/> Up</span>
                            <span className="font-mono text-lg font-bold text-emerald-600 dark:text-emerald-400">{device.interface_up_count || 0}</span>
                          </div>
                          <div className="flex flex-col items-center">
                            <span className="text-[9px] text-rose-500 uppercase font-black tracking-widest mb-1 flex items-center gap-1"><ArrowDownCircle className="w-2.5 h-2.5"/> Down</span>
                            <span className="font-mono text-lg font-bold text-rose-600 dark:text-rose-400">{device.interface_down_count || 0}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                         {device.snmp_status === 'Down' ? (
                           <div className="flex flex-col items-center gap-1">
                             <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-red-500 text-white shadow-[0_0_10px_rgba(239,68,68,0.3)] animate-pulse">
                               <AlertCircle className="w-3 h-3" />
                               Down
                             </span>
                           </div>
                         ) : device.snmp_status === 'Up' ? (
                           <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-emerald-500 text-white shadow-[0_0_10px_rgba(16,185,129,0.3)]">
                             <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></div>
                             Active
                           </span>
                         ) : (
                           <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">
                             <div className="w-1.5 h-1.5 rounded-full bg-slate-400 animate-pulse"></div>
                             Pending
                           </span>
                         )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {filteredDevices.length > 0 && (
          <div className="p-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-900/20">
            <div className="text-sm text-slate-600 dark:text-slate-400">
              Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, filteredDevices.length)} of {filteredDevices.length} entries
            </div>
            
            <div className="flex items-center gap-1">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className={`
                  px-3 py-1.5 rounded-md text-sm font-medium transition-colors border
                  ${currentPage === 1 
                    ? 'border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-600 cursor-not-allowed bg-slate-50 dark:bg-slate-800/50' 
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900'}
                `}
              >
                Previous
              </button>
              
              {Array.from({ length: totalPages }).map((_, idx) => {
                const page = idx + 1;
                const isCurrent = page === currentPage;
                
                if (
                  totalPages > 5 && 
                  page !== 1 && 
                  page !== totalPages && 
                  Math.abs(page - currentPage) > 1
                ) {
                  if (page === 2 || page === totalPages - 1) {
                    return <span key={page} className="px-1 text-slate-400">...</span>;
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
                        : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900'}
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
                    : 'border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 bg-white dark:bg-slate-900'}
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
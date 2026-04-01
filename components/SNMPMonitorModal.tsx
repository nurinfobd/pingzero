import { useState, useEffect } from 'react';
import { X, Save, Loader2 } from 'lucide-react';
import { toast } from 'react-toastify';

interface InterfaceItem {
  id: string;
  name: string;
}

interface SelectedInterface {
  id: string;
  name: string;
  capacity: string;
}

interface SNMPMonitorModalProps {
  device: any;
  onClose: () => void;
  onSaved: () => void;
}

export default function SNMPMonitorModal({ device, onClose, onSaved }: SNMPMonitorModalProps) {
  const [monitorSysname, setMonitorSysname] = useState(!!device.monitor_sysname);
  const [monitorCpu, setMonitorCpu] = useState(!!device.monitor_cpu);
  const [monitorUptime, setMonitorUptime] = useState(!!device.monitor_uptime);
  const [selectedInterfaces, setSelectedInterfaces] = useState<SelectedInterface[]>([]);
  
  const [interfaces, setInterfaces] = useState<InterfaceItem[]>([]);
  const [loadingInterfaces, setLoadingInterfaces] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Parse existing interfaces from device
    if (device.monitor_interfaces) {
      try {
        const parsed = JSON.parse(device.monitor_interfaces);
        if (Array.isArray(parsed)) {
          // Backward compatibility: Convert string IDs to objects
          const normalized = parsed.map(item => {
            if (typeof item === 'string') {
              return { id: item, name: '', capacity: '' };
            }
            return item;
          });
          setSelectedInterfaces(normalized);
        }
      } catch (e) {
        console.error("Failed to parse existing interfaces", e);
      }
    }
    
    fetchInterfaces();
  }, [device.id]);

  const fetchInterfaces = async () => {
    setLoadingInterfaces(true);
    try {
      const res = await fetch(`/api/snmp/${device.id}/interfaces`);
      if (res.ok) {
        const data = await res.json();
        setInterfaces(data);
        
        // Match names for already selected interfaces that might be missing names (legacy data)
        setSelectedInterfaces(prev => prev.map(sel => {
          if (!sel.name) {
            const match = data.find((i: InterfaceItem) => i.id === sel.id);
            if (match) return { ...sel, name: match.name };
          }
          return sel;
        }));
      } else {
        toast.error("Failed to fetch interfaces from device");
      }
    } catch (err) {
      toast.error("Error connecting to device");
    } finally {
      setLoadingInterfaces(false);
    }
  };

  const handleInterfaceToggle = (iface: InterfaceItem) => {
    setSelectedInterfaces(prev => {
      const isSelected = prev.some(i => i.id === iface.id);
      if (isSelected) {
        return prev.filter(i => i.id !== iface.id);
      } else {
        return [...prev, { id: iface.id, name: iface.name, capacity: '' }];
      }
    });
  };

  const handleCapacityChange = (id: string, capacity: string) => {
    setSelectedInterfaces(prev => prev.map(i => 
      i.id === id ? { ...i, capacity: capacity.replace(/[^0-9]/g, '') } : i
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/snmp/${device.id}/monitor`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monitor_sysname: monitorSysname,
          monitor_cpu: monitorCpu,
          monitor_uptime: monitorUptime,
          monitor_interfaces: selectedInterfaces
        }),
      });

      if (res.ok) {
        toast.success("Monitoring configuration saved");
        onSaved();
        onClose();
      } else {
        toast.error("Failed to save configuration");
      }
    } catch (err) {
      toast.error("An error occurred while saving");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/80 backdrop-blur-sm z-[200] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white uppercase tracking-wider">
            Monitor: {device.name}
          </h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">System Metrics</h4>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={monitorSysname}
                  onChange={(e) => setMonitorSysname(e.target.checked)}
                  className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Hostname / SysName / Identity</span>
              </label>
              
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={monitorCpu}
                  onChange={(e) => setMonitorCpu(e.target.checked)}
                  className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">CPU Usage</span>
              </label>
              
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={monitorUptime}
                  onChange={(e) => setMonitorUptime(e.target.checked)}
                  className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Uptime</span>
              </label>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
            <div className="flex justify-between items-center mb-4 border-b border-slate-200 dark:border-slate-700 pb-2">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Network Interfaces</h4>
              {loadingInterfaces && <Loader2 className="w-4 h-4 animate-spin text-teal-500" />}
            </div>
            
            {loadingInterfaces && interfaces.length === 0 ? (
              <div className="text-center py-4 text-sm text-slate-500">Loading interfaces from device...</div>
            ) : interfaces.length === 0 ? (
              <div className="text-center py-4 text-sm text-slate-500">No interfaces found or could not connect.</div>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-2">
                {interfaces.map((iface) => {
                  const selected = selectedInterfaces.find(i => i.id === iface.id);
                  return (
                    <div key={iface.id} className="flex items-center justify-between gap-3 hover:bg-slate-100 dark:hover:bg-slate-800 p-2 rounded transition-colors group">
                      <label className="flex items-center gap-3 cursor-pointer flex-1">
                        <input 
                          type="checkbox" 
                          checked={!!selected}
                          onChange={() => handleInterfaceToggle(iface)}
                          className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500"
                        />
                        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 font-mono">
                          <span className="text-xs text-slate-400 mr-2">[{iface.id}]</span>
                          {iface.name}
                        </span>
                      </label>
                      
                      {selected && (
                        <div className="flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-200">
                          <label className="text-[10px] uppercase font-bold text-slate-400">Max Capacity:</label>
                          <div className="relative">
                            <input 
                              type="text"
                              value={selected.capacity}
                              onChange={(e) => handleCapacityChange(iface.id, e.target.value)}
                              placeholder="0"
                              className="w-20 px-2 py-1 text-xs border border-slate-300 dark:border-slate-600 rounded bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-teal-500 pr-8"
                            />
                            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-slate-400 pointer-events-none">Mbps</span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-lg font-bold tracking-wider uppercase transition-colors text-sm"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold tracking-wider uppercase transition-colors flex items-center gap-2 text-sm disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>

      </div>
    </div>
  );
}
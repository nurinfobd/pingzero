import { useState, useEffect, useRef } from 'react';
import { X, Network, Trash2, Plus, Pencil, Activity, MoreHorizontal } from 'lucide-react';
import { toast } from 'react-toastify';
import SNMPMonitorModal from './SNMPMonitorModal';

interface SNMPDevice {
  id: number;
  name: string;
  ip: string;
  community: string;
  version: string;
  port: number;
  device_type: string;
  created_at: string;
}

interface SNMPManagerModalProps {
  onClose: () => void;
}

export default function SNMPManagerModal({ onClose }: SNMPManagerModalProps) {
  const [devices, setDevices] = useState<SNMPDevice[]>([]);
  const [availableHosts, setAvailableHosts] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [ip, setIp] = useState('');
  const [community, setCommunity] = useState('public');
  const [version, setVersion] = useState('2c');
  const [port, setPort] = useState('161');
  const [deviceType, setDeviceType] = useState('Other');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [activeDropdown, setActiveDropdown] = useState<number | null>(null);
  const [selectedDeviceForMonitor, setSelectedDeviceForMonitor] = useState<SNMPDevice | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchDevices();
    fetchAvailableHosts();
  }, []);

  // Handle click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchAvailableHosts = async () => {
    try {
      const res = await fetch('/api/hosts');
      if (res.ok) {
        const data = await res.json();
        setAvailableHosts(data);
      }
    } catch (err) {
      console.error('Error fetching hosts');
    }
  };

  const fetchDevices = async () => {
    try {
      const res = await fetch('/api/snmp');
      if (res.ok) {
        const data = await res.json();
        setDevices(data);
      } else {
        toast.error('Failed to load SNMP devices');
      }
    } catch (err) {
      toast.error('Error fetching SNMP devices');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      // Basic IP validation
      const ipOk = /^\d{1,3}(\.\d{1,3}){3}$/.test(ip);
      if (!ipOk) {
        toast.error('Invalid IP address format');
        setLoading(false);
        return;
      }

      const url = editingId ? `/api/snmp/${editingId}` : '/api/snmp';
      const method = editingId ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ip, community, version, port: parseInt(port), device_type: deviceType }),
      });

      if (res.ok) {
        toast.success(editingId ? 'SNMP device updated successfully' : 'SNMP device verified and added successfully');
        resetForm();
        fetchDevices();
      } else {
        const errorData = await res.json();
        toast.error(errorData.error || `Failed to ${editingId ? 'update' : 'add'} SNMP device`);
      }
    } catch (err) {
      toast.error(`An error occurred while ${editingId ? 'updating' : 'adding'} SNMP device`);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setName('');
    setIp('');
    setCommunity('public');
    setVersion('2c');
    setPort('161');
    setDeviceType('Other');
    setEditingId(null);
  };

  const handleEditClick = (device: SNMPDevice) => {
    setEditingId(device.id);
    setName(device.name);
    setIp(device.ip);
    setCommunity(device.community);
    setVersion(device.version);
    setPort(device.port.toString());
    setDeviceType(device.device_type || 'Other');
    setActiveDropdown(null);
  };

  const handleDeleteDevice = async (id: number) => {
    if (!confirm('Are you sure you want to delete this SNMP device?')) return;
    
    try {
      const res = await fetch(`/api/snmp/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('SNMP device deleted successfully');
        fetchDevices();
      } else {
        toast.error('Failed to delete SNMP device');
      }
    } catch (err) {
      toast.error('Error deleting SNMP device');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 dark:bg-slate-900/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-4xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2 uppercase tracking-wider">
            <Network className="w-5 h-5 text-teal-500" />
            SNMP MANAGER
          </h3>
          <button 
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          
          {/* Add/Edit Device Form */}
          <div className="bg-slate-50 dark:bg-slate-800/50 p-6 rounded-lg border border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4 flex items-center gap-2">
              {editingId ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
              {editingId ? 'EDIT SNMP DEVICE' : 'ADD SNMP DEVICE'}
            </h4>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-9 gap-4 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Host/Device</label>
                <select
                  value={name}
                  onChange={(e) => {
                    const selectedName = e.target.value;
                    setName(selectedName);
                    const selectedHost = availableHosts.find(h => h.name === selectedName);
                    if (selectedHost) {
                      setIp(selectedHost.ip);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                >
                  <option value="" disabled>Select a monitored device</option>
                  {availableHosts.map(host => (
                    <option key={host.id} value={host.name}>
                      {host.name} ({host.ip})
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Type</label>
                <select
                  value={deviceType}
                  onChange={(e) => setDeviceType(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="Mikrotik">Mikrotik</option>
                  <option value="Huawei">Huawei</option>
                  <option value="Juniper">Juniper</option>
                  <option value="Cisco">Cisco</option>
                  <option value="BDCOM">BDCOM</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">IP Address</label>
                <input 
                  type="text" 
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                  placeholder="192.168.1.1"
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Community</label>
                <input 
                  type="text" 
                  value={community}
                  onChange={(e) => setCommunity(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Version</label>
                <select 
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                >
                  <option value="2c">v2c</option>
                  <option value="1">v1</option>
                  <option value="3">v3</option>
                </select>
              </div>
              <div className="md:col-span-1">
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 uppercase tracking-wider">Port</label>
                <input 
                  type="number"
                  value={port}
                  onChange={(e) => setPort(e.target.value)}
                  className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-teal-500 outline-none"
                  required
                />
              </div>
              <div className="md:col-span-2 flex gap-2">
                <button 
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-lg font-bold tracking-wider uppercase transition-colors disabled:opacity-50"
                >
                  {loading ? (editingId ? 'UPDATING...' : 'ADDING...') : (editingId ? 'UPDATE' : 'ADD')}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={resetForm}
                    className="w-full py-2 bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-white rounded-lg font-bold tracking-wider uppercase transition-colors"
                  >
                    CANCEL
                  </button>
                )}
              </div>
            </form>
          </div>

          {/* Device List */}
          <div>
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-4">MONITORED SNMP DEVICES</h4>
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg overflow-visible pb-24">
              <table className="w-full text-left text-sm relative">
                <thead className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Name</th>
                    <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Type</th>
                    <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">IP Address</th>
                    <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Community</th>
                    <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Version</th>
                    <th className="p-3 font-semibold text-slate-600 dark:text-slate-300">Port</th>
                    <th className="p-3 font-semibold text-slate-600 dark:text-slate-300 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-700/50">
                  {devices.map(device => (
                    <tr key={device.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/20 transition-colors">
                      <td className="p-3 font-medium text-slate-900 dark:text-white">{device.name}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">
                        <span className="px-2 py-1 bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400 rounded-full text-xs font-medium">
                          {device.device_type || 'Other'}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400 font-mono">{device.ip}</td>
                      <td className="p-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{device.community}</td>
                      <td className="p-3">
                        <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full text-xs font-bold uppercase">
                          v{device.version}
                        </span>
                      </td>
                      <td className="p-3 text-slate-600 dark:text-slate-400">{device.port}</td>
                      <td className="p-3 text-right">
                        <div className="relative inline-block text-left">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveDropdown(activeDropdown === device.id ? null : device.id);
                            }}
                            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:text-slate-300 dark:hover:bg-slate-700 rounded-md transition-colors"
                            title="More actions"
                          >
                            <MoreHorizontal className="w-5 h-5" />
                          </button>

                          {activeDropdown === device.id && (
                            <div 
                              ref={dropdownRef}
                              className="absolute right-0 top-full mt-1 w-12 bg-white dark:bg-slate-800 rounded-md shadow-xl border border-slate-200 dark:border-slate-700 z-[9999] py-2 flex flex-col items-center gap-2"
                            >
                            <button
                              onClick={() => {
                                setSelectedDeviceForMonitor(device);
                                setActiveDropdown(null);
                              }}
                              className="p-2 text-slate-400 hover:text-teal-500 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-md transition-colors"
                              title="Monitor Device"
                            >
                              <Activity className="w-4 h-4" />
                            </button>
                            
                            <button
                              onClick={() => {
                                handleEditClick(device);
                              }}
                              className="p-2 text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md transition-colors"
                              title="Edit Device"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            
                            <button
                              onClick={() => {
                                handleDeleteDevice(device.id);
                                setActiveDropdown(null);
                              }}
                              className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors"
                              title="Delete Device"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {devices.length === 0 && (
                    <tr>
                      <td colSpan={6} className="p-4 text-center text-slate-500 dark:text-slate-400">
                        No SNMP devices configured yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

        </div>
      </div>
      
      {selectedDeviceForMonitor && (
        <SNMPMonitorModal 
          device={selectedDeviceForMonitor}
          onClose={() => setSelectedDeviceForMonitor(null)}
          onSaved={fetchDevices}
        />
      )}
    </div>
  );
}

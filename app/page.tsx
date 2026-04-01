'use client';

import { useEffect, useState } from 'react';
import io from 'socket.io-client';
import HostTable from '@/components/HostTable';
import AddHostForm from '@/components/AddHostForm';
import Alarm from '@/components/Alarm';
import PingGraphModal from '@/components/PingGraphModal';
import StatusHistoryModal from '@/components/StatusHistoryModal';
import SettingsModal from '@/components/SettingsModal';
import UserManagementModal from '@/components/UserManagementModal';
import SNMPManagerModal from '@/components/SNMPManagerModal';
import SNMPDashboardTable from '@/components/SNMPDashboardTable';
import InterfaceMonitorTable from '@/components/InterfaceMonitorTable';
import DownInterfacesTable from '@/components/DownInterfacesTable';
import { 
  Bell, 
  Settings, 
  PlusCircle, 
  LogOut, 
  LayoutDashboard, 
  Network, 
  Activity, 
  ShieldCheck, 
  AlertCircle, 
  Monitor,
  Volume2,
  VolumeX,
  Server,
  CheckCircle2,
  AlertOctagon,
  ChevronLeft,
  Menu,
  Heart
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

import Image from 'next/image';
import { useRef } from 'react';

let socket: any;

export default function Home() {
  const [hosts, setHosts] = useState<any[]>([]);
  const [downInterfacesCount, setDownInterfacesCount] = useState(0);
  const prevDownInterfacesRef = useRef<Set<string>>(new Set());
  const isFirstFetchRef = useRef(true);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const beepTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('view-only');
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [showSNMPManagement, setShowSNMPManagement] = useState(false);
  const [connected, setConnected] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMenuDropdown, setShowMenuDropdown] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sidebarExpanded, setSidebarExpanded] = useState(true);
  const [selectedHostForGraph, setSelectedHostForGraph] = useState<any>(null);
  const [selectedHostForStatusHistory, setSelectedHostForStatusHistory] = useState<any>(null);

  const [settings, setSettings] = useState({
    theme: 'system',
    toastsEnabled: true,
    soundEnabled: false,
    soundType: 'standard', // 'standard', 'radar', 'siren'
  });
  const settingsRef = useRef(settings);

  // Load settings on mount
  useEffect(() => {
    const stored = localStorage.getItem('nms_settings');
    if (stored) {
      try {
        setSettings(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse settings', e);
      }
    }
  }, []);

  // Sync settingsRef and localStorage
  useEffect(() => {
    settingsRef.current = settings;
    localStorage.setItem('nms_settings', JSON.stringify(settings));
    
    // Apply theme
    const root = document.documentElement;
    if (settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings]);

  useEffect(() => {
    // Fetch user role
    const fetchRole = async () => {
      try {
        const res = await fetch('/api/auth/me');
        if (res.ok) {
          const data = await res.json();
          setUserRole(data.role);
        }
      } catch (err) {
        console.error('Failed to fetch user role');
      }
    };
    fetchRole();
    
    socketInitializer();
    fetchDownInterfacesCount();

    return () => {
      if (socket) socket.disconnect();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  const fetchDownInterfacesCount = async () => {
    try {
      const res = await fetch('/api/snmp/interfaces/stats');
      if (res.ok) {
        const data = await res.json();
        const currentDownInterfaces = data.filter((item: any) => Number(item.status) !== 1);
        const downCount = currentDownInterfaces.length;
        
        // Track new outages by ID
        const currentDownIds = new Set<string>(currentDownInterfaces.map((i: any) => `${i.device_id}_${i.interface_id}`));
        
        let shouldPlaySound = false;
        
        if (!isFirstFetchRef.current && settingsRef.current.toastsEnabled) {
          // Find interfaces that just went down
          currentDownInterfaces.forEach((iface: any) => {
            const id = `${iface.device_id}_${iface.interface_id}`;
            if (!prevDownInterfacesRef.current.has(id)) {
              // New Outage!
              toast.error(`Interface Down: ${iface.interface_name} on ${iface.device_name}`, {
                position: "top-right",
                autoClose: 5000,
              });
              shouldPlaySound = true;
            }
          });
        }
        
        if (shouldPlaySound) {
          playAlertSound();
        }
        
        setDownInterfacesCount(downCount);
        prevDownInterfacesRef.current = currentDownIds;
        isFirstFetchRef.current = false;
      }
    } catch (err) {
      console.error('Failed to fetch interface count', err);
    }
  };

  const playAlertSound = () => {
    if (!settingsRef.current.soundEnabled) return;
    
    try {
      // Clear existing timeout if any
      if (beepTimeoutRef.current) {
        clearTimeout(beepTimeoutRef.current);
        beepTimeoutRef.current = null;
      }

      if (!audioRef.current) {
        audioRef.current = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      }
      
      const audio = audioRef.current;
      audio.loop = true;
      audio.currentTime = 0;
      
      // Play sound and set timeout to stop it
      audio.play().then(() => {
        beepTimeoutRef.current = setTimeout(() => {
          audio.pause();
          audio.currentTime = 0;
          beepTimeoutRef.current = null;
        }, 5000);
      }).catch(e => {
        console.log("Audio play blocked or failed", e);
      });
      
    } catch (e) {
      console.error("Sound error", e);
    }
  };

  const socketInitializer = async () => {
    // We can connect to the same origin
    socket = io();

    socket.on('connect', () => {
      console.log('Connected to socket server');
      setConnected(true);
    });

    socket.on('disconnect', () => {
      console.log('Disconnected');
      setConnected(false);
    });

    socket.on('hosts:update', (data: any) => {
      setHosts((prevHosts: any[]) => {
        const safePrevHosts = Array.isArray(prevHosts) ? prevHosts : [];
        const safeData = Array.isArray(data) ? data : [];
        
        let shouldPlaySound = false;

        // Check for status changes to trigger toasts
        if (safePrevHosts.length > 0 && settingsRef.current.toastsEnabled) {
          safeData.forEach((newHost: any) => {
            const oldHost = safePrevHosts.find(h => h.id === newHost.id);
            if (oldHost && oldHost.status !== newHost.status) {
              if (newHost.status === 'Down') {
                toast.error(`Device Down: ${newHost.name} (${newHost.ip})`, {
                  position: "top-right",
                  autoClose: 5000,
                  theme: "colored",
                });
                shouldPlaySound = true;
              } else if (newHost.status === 'Up' && oldHost.status === 'Down') {
                toast.success(`Device Recovered: ${newHost.name} (${newHost.ip})`, {
                  position: "top-right",
                  autoClose: 5000,
                  theme: "colored",
                });
              }
            }
          });
        }

        if (shouldPlaySound) {
          playAlertSound();
        }

        return safeData;
      });
    });
    
    socket.on('snmp:update', () => {
      fetchDownInterfacesCount();
    });

    // Also listen for specific events if needed, but 'hosts:update' covers most
    socket.on('hosts:new', (newHost: any) => {
        // Optimistic update or wait for full list?
        // server emits hosts:update usually after changes, so we might just wait.
        // But the server code emits hosts:update on connection and interval.
    });
  };

  const getApiErrorMessage = async (res: Response) => {
    const contentType = res.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const data: any = await res.json().catch(() => null);
      if (data && typeof data.error === 'string') return data.error;
      if (data) return JSON.stringify(data);
    }
    return (await res.text()) || 'Request failed';
  };

  const addHost = async (hostData: any) => {
    try {
      const res = await fetch('/api/hosts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hostData),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res));
      toast.success('Device added successfully', {
        position: "top-right",
        autoClose: 2500,
        theme: "colored",
      });
      setShowAddForm(false);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to add device', {
        position: "top-right",
        autoClose: 5000,
        theme: "colored",
      });
      throw err;
    }
  };

  const updateHost = async (id: number, hostData: any) => {
    try {
      const res = await fetch(`/api/hosts/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(hostData),
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res));
      toast.success('Device updated successfully', {
        position: "top-right",
        autoClose: 2500,
        theme: "colored",
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update device', {
        position: "top-right",
        autoClose: 5000,
        theme: "colored",
      });
      throw err;
    }
  };

  const deleteHost = async (id: number) => {
    if (!confirm('Are you sure you want to delete this host?')) return;
    try {
      const res = await fetch(`/api/hosts/${id}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await getApiErrorMessage(res));
      toast.success('Device deleted successfully', {
        position: "top-right",
        autoClose: 2500,
        theme: "colored",
      });
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete device', {
        position: "top-right",
        autoClose: 5000,
        theme: "colored",
      });
      throw err;
    }
  };

  const stats = {
    total: Array.isArray(hosts) ? hosts.length : 0,
    up: Array.isArray(hosts) ? hosts.filter((h: any) => h.status === 'Up').length : 0,
    down: Array.isArray(hosts) ? hosts.filter((h: any) => h.status === 'Down').length : 0,
    unknown: Array.isArray(hosts) ? hosts.filter((h: any) => !h.status || (h.status !== 'Up' && h.status !== 'Down')).length : 0
  };

  const filteredAndSortedHosts = (Array.isArray(hosts) ? hosts : [])
    .filter((host: any) => {
      if (!searchQuery) return true;
      const lowerQuery = searchQuery.toLowerCase();
      return (
        (host.name || '').toLowerCase().includes(lowerQuery) ||
        (host.ip || '').toLowerCase().includes(lowerQuery)
      );
    })
    .sort((a: any, b: any) => {
      // Priority: Down > Degraded > Up > Others
      const getPriority = (host: any) => {
        const isUp = host.status === 'Up';
        const isDown = host.status === 'Down';
        const threshold = host.latency_threshold || 100;
        const isDegraded = isUp && typeof host.latency_avg === 'number' && host.latency_avg > threshold;

        if (isDown) return 0;
        if (isDegraded) return 1;
        if (isUp) return 2;
        return 3;
      };
      
      const priorityA = getPriority(a);
      const priorityB = getPriority(b);
      
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      
      // Secondary sort: Name
      return (a.name || '').localeCompare(b.name || '');
    });

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      window.location.href = '/login';
    } catch (err) {
      console.error('Logout failed', err);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-100 dark:bg-slate-950 font-sans">
      
      {/* Left Sidebar */}
      <aside className={`${sidebarExpanded ? 'w-64' : 'w-20'} bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col hidden relative overflow-visible shadow-2xl transition-all duration-300 ease-in-out`}>
        {/* Toggle Button */}
        <button 
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="absolute -right-3 top-8 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-white rounded-full p-1 z-50 shadow-lg transition-colors"
        >
          {sidebarExpanded ? <ChevronLeft className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
        </button>

        {/* Tech decorative background elements (only visible in dark mode or subtly in light mode) */}
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-blue-100/50 dark:from-blue-600/10 to-transparent pointer-events-none overflow-hidden"></div>
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-400/10 dark:bg-blue-500/5 blur-[50px] pointer-events-none overflow-hidden"></div>
        
        {/* Mobile Sidebar - Only visible to screen readers or when md:flex is active but we shouldn't show it on mobile anymore. It's hidden by default on mobile. */}
        <div className={`p-6 border-b border-slate-200 dark:border-slate-800/60 relative z-10 flex items-center justify-center min-h-[98px] transition-all ${sidebarExpanded ? '' : 'px-2'}`}>
          {sidebarExpanded ? (
            <a href="https://teamzero.bd" target="_blank" rel="noopener noreferrer" className="relative group transition-transform hover:scale-105 active:scale-95">
              <img 
                src="/pingzero.png" 
                alt="PingZero Logo" 
                width={100} 
                height={28} 
                className="object-contain relative z-10"
                style={{ 
                  filter: 'none !important', 
                  WebkitFilter: 'none !important', 
                  mixBlendMode: 'normal',
                  display: 'block'
                }}
              />
            </a>
          ) : (
            <a href="https://teamzero.bd" target="_blank" rel="noopener noreferrer" className="relative group transition-transform hover:scale-105 active:scale-95">
              <img 
                src="/pingzero-small.png" 
                alt="PingZero Small Logo" 
                width={28} 
                height={28} 
                className="object-contain relative z-10"
                style={{ 
                  filter: 'none !important', 
                  WebkitFilter: 'none !important', 
                  mixBlendMode: 'normal',
                  display: 'block'
                }}
              />
            </a>
          )}
        </div>
        
        <nav className="flex-1 p-4 space-y-2 relative z-10 mt-2 overflow-hidden">
          {sidebarExpanded && (
            <div className="px-3 mb-2">
              <p className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase whitespace-nowrap">MAIN MENU</p>
            </div>
          )}
          <button className={`w-full flex items-center gap-3 py-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-100 dark:border-blue-500/20 text-blue-700 dark:text-blue-400 rounded-lg font-medium transition-all shadow-[inset_0_1px_1px_rgba(255,255,255,0.5)] dark:shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)] ${sidebarExpanded ? 'px-4' : 'justify-center px-0'}`}>
            <LayoutDashboard className="w-5 h-5 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)] dark:drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] shrink-0" />
            {sidebarExpanded && (
              <>
                <span className="whitespace-nowrap uppercase text-sm tracking-wider">DASHBOARD</span>
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600 dark:bg-blue-500 shadow-[0_0_5px_rgba(37,99,235,0.5)] dark:shadow-[0_0_5px_rgba(59,130,246,1)] shrink-0"></div>
              </>
            )}
          </button>
          
          {sidebarExpanded && (
            <div className="px-3 mt-6 mb-2">
              <p className="text-[10px] font-bold tracking-widest text-slate-400 dark:text-slate-500 uppercase whitespace-nowrap">ACTIONS</p>
            </div>
          )}
          {!sidebarExpanded && <div className="h-4"></div>}
          
          <button 
            onClick={() => {
              if (userRole === 'view-only') {
                toast.error("You don't have permission for this operation", { position: "top-right" });
                return;
              }
              setShowAddForm(!showAddForm);
            }}
            className={`group w-full flex items-center gap-3 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/50 rounded-lg font-medium transition-all ${sidebarExpanded ? 'px-4' : 'justify-center px-0'}`}
            title={!sidebarExpanded ? (showAddForm ? 'CANCEL ADD' : 'ADD DEVICE') : undefined}
          >
            <PlusCircle className="w-5 h-5 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors shrink-0" />
            {sidebarExpanded && <span className="whitespace-nowrap uppercase text-sm tracking-wider">{showAddForm ? 'CANCEL ADD' : 'ADD DEVICE'}</span>}
          </button>

          <button 
            onClick={() => setShowSettings(true)}
            className={`group w-full flex items-center gap-3 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/50 rounded-lg font-medium transition-all ${sidebarExpanded ? 'px-4' : 'justify-center px-0'}`}
            title={!sidebarExpanded ? 'SETTINGS' : undefined}
          >
            <Settings className="w-5 h-5 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors shrink-0" />
            {sidebarExpanded && <span className="whitespace-nowrap uppercase text-sm tracking-wider">SETTINGS</span>}
          </button>

          <button 
            onClick={() => {
              if (userRole === 'view-only') {
                toast.error("You don't have permission for this operation", { position: "top-right" });
                return;
              }
              setShowSNMPManagement(true);
            }}
            className={`group w-full flex items-center gap-3 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/50 rounded-lg font-medium transition-all ${sidebarExpanded ? 'px-4' : 'justify-center px-0'}`}
            title={!sidebarExpanded ? 'SNMP' : undefined}
          >
            <Network className="w-5 h-5 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors shrink-0" />
            {sidebarExpanded && <span className="whitespace-nowrap uppercase text-sm tracking-wider">SNMP</span>}
          </button>

          <button 
            onClick={() => {
              if (userRole !== 'superadmin') {
                toast.error("You don't have permission for this operation", { position: "top-right" });
                return;
              }
              setShowUserManagement(true);
            }}
            className={`group w-full flex items-center gap-3 py-3 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-50 dark:hover:bg-slate-800/50 border border-transparent hover:border-slate-200 dark:hover:border-slate-700/50 rounded-lg font-medium transition-all ${sidebarExpanded ? 'px-4' : 'justify-center px-0'}`}
            title={!sidebarExpanded ? 'USERS' : undefined}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            {sidebarExpanded && <span className="whitespace-nowrap uppercase text-sm tracking-wider">USERS</span>}
          </button>
          
          <button 
            onClick={handleLogout}
            className={`group w-full flex items-center gap-3 py-3 mt-4 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 border border-transparent hover:border-red-200 dark:hover:border-red-800/50 rounded-lg font-medium transition-all ${sidebarExpanded ? 'px-4' : 'justify-center px-0'}`}
            title={!sidebarExpanded ? 'LOGOUT' : undefined}
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {sidebarExpanded && <span className="whitespace-nowrap uppercase text-sm tracking-wider">LOGOUT</span>}
          </button>
        </nav>

        <div className={`p-4 border-t border-slate-200 dark:border-slate-800/60 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md relative z-10 ${sidebarExpanded ? '' : 'flex justify-center'}`}>
          <div className={`flex items-center justify-between rounded-lg border text-sm font-medium ${sidebarExpanded ? 'px-4 py-3' : 'p-2'} ${
            connected 
              ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400' 
              : 'bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400'
          }`}
          title={!sidebarExpanded ? (connected ? 'System Online' : 'Disconnected') : undefined}
          >
            <span className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full shadow-[0_0_8px_currentColor] shrink-0 ${connected ? 'bg-emerald-500 dark:bg-emerald-400 animate-pulse' : 'bg-red-500 dark:bg-red-400'}`}></div>
              {sidebarExpanded && <span className="tracking-wide uppercase text-xs whitespace-nowrap">{connected ? 'System Online' : 'Disconnected'}</span>}
            </span>
            {sidebarExpanded && <Activity className={`w-4 h-4 opacity-50 shrink-0 ${connected ? 'animate-pulse' : ''}`} />}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Sticky Header - Fixed at the top */}
        <header className="sticky top-0 z-40 px-6 py-2.5 bg-slate-100/80 dark:bg-slate-950/80 backdrop-blur-md border-b border-slate-200/60 dark:border-slate-800/60 flex flex-col md:flex-row items-center justify-between gap-4 shrink-0 transition-all">
          <div className="flex items-center gap-4 w-full md:w-auto">
            <div className="md:hidden">
              <a href="https://teamzero.bd" target="_blank" rel="noopener noreferrer" className="inline-block transition-transform hover:scale-105 active:scale-95">
                <Image 
                  src="/pingzero-small.png" 
                  alt="PingZero Logo" 
                  width={28} 
                  height={28} 
                  className="object-contain"
                />
              </a>
            </div>
            <div>
              <div className="hidden md:block mb-0.5">
                <a href="https://teamzero.bd" target="_blank" rel="noopener noreferrer" className="inline-block transition-transform hover:scale-105 active:scale-95">
                  <Image 
                    src="/pingzero.png" 
                    alt="PingZero Logo" 
                    width={110} 
                    height={30} 
                    className="object-contain"
                    style={{ 
                      filter: 'none !important', 
                      WebkitFilter: 'none !important', 
                      mixBlendMode: 'normal',
                      display: 'block'
                    }}
                  />
                </a>
              </div>
              <p className="text-[10px] font-extrabold text-slate-500/80 dark:text-slate-400/80 uppercase tracking-[0.2em]">
                Network Monitoring System
              </p>
            </div>
          </div>
          
            <div className="flex items-center gap-2 w-full md:w-auto justify-end">
              <button 
                onClick={() => setSettings(prev => ({ ...prev, soundEnabled: !prev.soundEnabled }))}
                className={`flex items-center gap-2 px-3 py-1.5 transition-all rounded-full border ${settings.soundEnabled ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600' : 'bg-slate-500/10 border-slate-500/20 text-slate-500'} hover:shadow-sm active:scale-95`}
                title={settings.soundEnabled ? "Sound Alerts Enabled" : "Sound Alerts Muted"}
              >
                {settings.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
                <span className="text-[10px] font-bold uppercase tracking-tighter">
                  {settings.soundEnabled ? 'Alerts ON' : 'Muted'}
                </span>
              </button>

              <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 bg-white/60 dark:bg-slate-800/60 rounded-full border border-slate-200/50 dark:border-slate-700/50 text-[10px] font-bold text-slate-500 uppercase tracking-tighter shadow-sm whitespace-nowrap backdrop-blur-sm">
                <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`}></div>
                {connected ? 'Live' : 'Offline'}
              </div>
            
            <div className="relative">
              <button 
                onClick={() => setShowMenuDropdown(!showMenuDropdown)}
                className="w-10 h-10 flex flex-col justify-center items-center gap-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-all group z-50 relative"
                aria-label="Menu"
              >
                <span className={`block w-6 h-0.5 bg-slate-600 dark:bg-slate-300 rounded-full transition-all duration-300 ${showMenuDropdown ? 'rotate-45 translate-y-2' : ''}`}></span>
                <span className={`block w-6 h-0.5 bg-slate-600 dark:bg-slate-300 rounded-full transition-all duration-300 ${showMenuDropdown ? 'opacity-0' : ''}`}></span>
                <span className={`block w-6 h-0.5 bg-slate-600 dark:bg-slate-300 rounded-full transition-all duration-300 ${showMenuDropdown ? '-rotate-45 -translate-y-2' : ''}`}></span>
              </button>
              
              {showMenuDropdown && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 space-y-1">
                    <button 
                      onClick={() => setShowMenuDropdown(false)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                    >
                      <LayoutDashboard className="w-4 h-4 text-blue-500" />
                      Dashboard
                    </button>
                    <button 
                      onClick={() => {
                        if (userRole === 'view-only') { toast.error("You don't have permission for this operation"); return; }
                        setShowAddForm(true);
                        setShowMenuDropdown(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                    >
                      <PlusCircle className="w-4 h-4 text-emerald-500" />
                      Add Device
                    </button>
                    <button 
                      onClick={() => { setShowSettings(true); setShowMenuDropdown(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                    >
                      <Settings className="w-4 h-4 text-slate-400" />
                      Settings
                    </button>
                    <button 
                      onClick={() => {
                        if (userRole === 'view-only') { toast.error("You don't have permission for this operation"); return; }
                        setShowSNMPManagement(true);
                        setShowMenuDropdown(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                    >
                      <Network className="w-4 h-4 text-teal-500" />
                      SNMP Manager
                    </button>
                    <button 
                      onClick={() => {
                        if (userRole !== 'superadmin') { toast.error("You don't have permission for this operation"); return; }
                        setShowUserManagement(true);
                        setShowMenuDropdown(false);
                      }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 rounded-lg transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                      User Management
                    </button>
                    <div className="h-px bg-slate-200 dark:bg-slate-700 my-2"></div>
                    <button 
                      onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <LogOut className="w-4 h-4" />
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>
        {/* Scrollable Dashboard Content */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-8 space-y-8 custom-scrollbar relative">
          <div className="w-full max-w-[1600px] mx-auto space-y-8">
            <div className="flex flex-col gap-8">
              
              {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard 
            title="Total Hosts" 
            value={stats.total} 
            icon={<Server className="w-5 h-5" />} 
            color="blue"
          />
          <StatCard 
            title="Online" 
            value={stats.up} 
            icon={<CheckCircle2 className="w-5 h-5" />} 
            color="emerald"
          />
          <StatCard 
            title="Offline" 
            value={stats.down} 
            icon={<AlertOctagon className="w-5 h-5" />} 
            color="red"
            isAlert={stats.down > 0}
          />
          <StatCard 
            title="Down Interfaces" 
            value={downInterfacesCount} 
            icon={<Network className="w-5 h-5" />} 
            color="red"
            isAlert={downInterfacesCount > 0}
          />
          <StatCard 
            title="Pending/Unknown" 
            value={stats.unknown} 
            icon={<Activity className="w-5 h-5" />} 
            color="slate"
          />
        </div>

        {/* Main Content Areas */}
        <div className="flex flex-col gap-8">
          
          {/* Add Form Modal */}
          {showAddForm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
              <div className="w-full max-w-md mx-auto relative">
                <div className="animate-in fade-in zoom-in-95 duration-200">
                  <AddHostForm onAdd={addHost} onClose={() => setShowAddForm(false)} />
                </div>
              </div>
            </div>
          )}

          {/* Row 1: Host Monitor + Interface Monitoring */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
            {/* Host Table Column */}
            <div className="xl:col-span-5">
              <HostTable 
                hosts={filteredAndSortedHosts} 
                userRole={userRole}
                onDelete={deleteHost} 
                onEdit={updateHost}
                onShowGraph={(host: any) => setSelectedHostForGraph(host)}
                onShowStatusHistory={(host: any) => setSelectedHostForStatusHistory(host)}
              />
            </div>

            {/* Interface Monitoring Column */}
            <div className="xl:col-span-7">
              <InterfaceMonitorTable />
            </div>
          </div>

          {/* Row 2: SNMP Devices + Down Interfaces */}
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
            <div className="xl:col-span-7">
              <SNMPDashboardTable />
            </div>
            <div className="xl:col-span-5">
              <DownInterfacesTable />
            </div>
          </div>

          {/* Row for problematic hosts */}
          <div className="space-y-4">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm overflow-hidden">
              <div className="px-4 py-3 bg-slate-50/50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-red-50 dark:bg-red-500/10 rounded-md">
                    <Activity className="w-4 h-4 text-red-500" />
                  </div>
                  <h2 className="text-[13px] font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                    Top Problematic
                  </h2>
                </div>
                <p className="text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-tight">Most Downtime Events</p>
              </div>
              
              <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {/* We will calculate top problematic hosts here */}
                {(() => {
                  const safeHosts = Array.isArray(hosts) ? hosts : [];
                  const topHosts = [...safeHosts]
                    .sort((a, b) => (b.recent_down_count || 0) - (a.recent_down_count || 0))
                    .slice(0, 5)
                    .filter(h => (h.recent_down_count || 0) >= 2);
                    
                  if (topHosts.length === 0) {
                    return (
                      <div className="p-8 text-center text-slate-500 dark:text-slate-400 text-sm flex flex-col items-center gap-2">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400/50" />
                        <p>No problematic hosts detected.</p>
                        <p className="text-xs opacity-70">All systems are stable.</p>
                      </div>
                    );
                  }
                  
                  return topHosts.map((host: any, index) => (
                    <div key={host.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer" onClick={() => setSelectedHostForStatusHistory(host)}>
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                          index === 0 ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' :
                          index === 1 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400' :
                          'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400'
                        }`}>
                          {index + 1}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{host.name}</p>
                          <p className="text-xs text-slate-500 font-mono truncate">{host.ip}</p>
                        </div>
                      </div>
                      <div className="flex flex-col items-end shrink-0 ml-2">
                        <span className="text-lg font-bold text-red-500">{host.recent_down_count}</span>
                        <span className="text-[10px] text-slate-500 uppercase font-medium">Drops</span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>
        </div>


        {showSettings && (
          <SettingsModal 
            settings={settings}
            onUpdate={setSettings}
            onClose={() => setShowSettings(false)}
          />
        )}

        {selectedHostForGraph && (
          <PingGraphModal 
            host={selectedHostForGraph} 
            onClose={() => setSelectedHostForGraph(null)} 
          />
        )}

        {selectedHostForStatusHistory && (
          <StatusHistoryModal
            hostId={selectedHostForStatusHistory.id}
            hostName={selectedHostForStatusHistory.name}
            onClose={() => setSelectedHostForStatusHistory(null)}
          />
        )}

        {showUserManagement && (
          <UserManagementModal onClose={() => setShowUserManagement(false)} />
        )}

        {showSNMPManagement && (
          <SNMPManagerModal onClose={() => setShowSNMPManagement(false)} />
        )}
            </div>
          </div>
        </div>


      {/* Mobile Bottom Navigation */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_-4px_20px_rgba(0,0,0,0.2)]">
        <div className="flex items-center justify-between h-16 px-2">
          
          <div className="flex items-center w-1/3 justify-around">
            {/* Left: Add Device */}
            <button 
              onClick={() => {
                if (userRole === 'view-only') {
                  toast.error("You don't have permission for this operation", { position: "top-right" });
                  return;
                }
                setShowAddForm(true);
              }} 
              className="flex flex-col items-center justify-center w-12 h-full text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
            >
              <PlusCircle className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Add</span>
            </button>

            {/* Left: User Management */}
            <button 
              onClick={() => {
                if (userRole !== 'superadmin') {
                  toast.error("You don't have permission for this operation", { position: "top-right" });
                  return;
                }
                setShowUserManagement(true);
              }} 
              className="flex flex-col items-center justify-center w-12 h-full text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mb-1"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              <span className="text-[10px] font-medium uppercase tracking-wider">Users</span>
            </button>
          </div>
          
          {/* Center: Dashboard (Floating Notch) */}
          <div className="relative flex justify-center w-1/3">
            <div className="absolute -top-8">
              <button 
                onClick={() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                className="w-16 h-16 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-lg border-[6px] border-slate-100 dark:border-slate-950 transition-transform active:scale-95 z-50"
              >
                <img 
                  src="/pingzero-small.png" 
                  alt="Dashboard" 
                  className="w-8 h-8 object-contain"
                  style={{ filter: 'none !important', WebkitFilter: 'none !important', mixBlendMode: 'normal' }}
                />
              </button>
            </div>
          </div>

          <div className="flex items-center w-1/3 justify-around">
            {/* Right: SNMP */}
            <button 
              onClick={() => {
                if (userRole === 'view-only') {
                  toast.error("You don't have permission for this operation", { position: "top-right" });
                  return;
                }
                setShowSNMPManagement(true);
              }} 
              className="flex flex-col items-center justify-center w-12 h-full text-slate-500 hover:text-teal-600 dark:text-slate-400 dark:hover:text-teal-400 transition-colors"
            >
              <Network className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium uppercase tracking-wider">SNMP</span>
            </button>

            {/* Right: Settings */}
            <button 
              onClick={() => setShowSettings(true)} 
              className="flex flex-col items-center justify-center w-12 h-full text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
            >
              <Settings className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Settings</span>
            </button>

            {/* Right: Logout */}
            <button 
              onClick={handleLogout} 
              className="flex flex-col items-center justify-center w-12 h-full text-slate-500 hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400 transition-colors"
            >
              <LogOut className="w-6 h-6 mb-1" />
              <span className="text-[10px] font-medium uppercase tracking-wider">Logout</span>
            </button>
          </div>
        </div>
      </div>

      <ToastContainer />
      <footer className="sticky bottom-0 z-40 px-6 py-3 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-t border-slate-200/50 dark:border-slate-800/50 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400 tracking-wider">
        NMS Tools of <a href="https://teamzero.bd" target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:text-blue-700 transition-colors">TeamZero</a>
      </footer>
    </main>
  </div>
);
}

function StatCard({ title, value, icon, color, isAlert = false }: { title: string, value: number | string, icon: any, color: string, isAlert?: boolean }) {
  const colorStyles: any = {
    blue: {
      text: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-500/10 dark:bg-blue-500/10',
      accent: 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]',
      icon: 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
    },
    emerald: {
      text: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-500/10 dark:bg-emerald-500/10',
      accent: 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]',
      icon: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
    },
    red: {
      text: 'text-red-600 dark:text-red-400',
      bg: 'bg-red-500/10 dark:bg-red-500/10',
      accent: 'bg-red-500 shadow-[0_0_12px_rgba(239,68,68,0.5)]',
      icon: 'bg-red-500/20 text-red-600 dark:text-red-400'
    },
    slate: {
      text: 'text-slate-600 dark:text-slate-400',
      bg: 'bg-slate-500/10 dark:bg-slate-500/10',
      accent: 'bg-slate-500 shadow-[0_0_12px_rgba(107,114,128,0.5)]',
      icon: 'bg-slate-500/20 text-slate-600 dark:text-slate-400'
    },
  };

  const style = colorStyles[color] || colorStyles.slate;

  return (
    <div className={`
      relative overflow-hidden
      bg-white/40 dark:bg-slate-900/40 backdrop-blur-xl
      p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50
      flex items-center justify-between transition-all duration-300
      hover:shadow-lg hover:shadow-slate-200/20 dark:hover:shadow-none hover:-translate-y-1 group
      ${isAlert ? 'ring-2 ring-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)] animate-pulse' : ''}
    `}>
      {/* Technical Accent Bar */}
      <div className={`absolute left-0 top-0 bottom-0 w-1.5 ${style.accent} opacity-80 rounded-r-full`}></div>
      
      <div className="flex-1 pl-2">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600 animate-pulse"></span>
          <p className={`text-[10px] font-bold uppercase tracking-[0.15em] ${isAlert ? 'text-red-500' : 'text-slate-500 dark:text-slate-400'}`}>
            {title} {isAlert && '(ALERT)'}
          </p>
        </div>
        
        <div className="flex items-baseline gap-2">
          <p className={`text-3xl font-mono font-bold tracking-tight ${isAlert ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-white'}`}>
            {value}
          </p>
          <p className="text-[8px] font-mono text-slate-400/60 uppercase tracking-tighter">
            Live Polling
          </p>
        </div>
      </div>

      <div className={`p-4 rounded-xl transition-transform duration-500 group-hover:rotate-12 ${style.icon}`}>
        {icon}
      </div>
      
      {/* Decorative tech grid */}
      <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-slate-400/5 dark:bg-white/5 rounded-full blur-3xl pointer-events-none group-hover:bg-slate-400/10 dark:group-hover:bg-white/10 transition-colors"></div>
    </div>
  );
}

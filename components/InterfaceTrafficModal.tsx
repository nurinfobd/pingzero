'use client';

import { useEffect, useState, useMemo } from 'react';
import { X, Loader2, ArrowDownLeft, ArrowUpRight, Activity } from 'lucide-react';
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export default function InterfaceTrafficModal({ row, onClose }: { row: any, onClose: any }) {
  const [data, setData] = useState<{in: any[], out: any[]}>({ in: [], out: [] });
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('live');
  const [view, setView] = useState('traffic'); // 'traffic' or 'optical'

  useEffect(() => {
    const fetchData = async () => {
      try {
        const endpoint = view === 'traffic' 
          ? `/api/snmp/${row.device_id}/${row.interface_id}/history?range=${range}`
          : `/api/snmp/${row.device_id}/${row.interface_id}/optical-history`;
          
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error('Failed to fetch history');
        const history = await res.json();
        
        const inSeries: any[] = [];
        const outSeries: any[] = [];

        history.forEach((h: any) => {
          const timestamp = new Date(h.created_at).getTime();
          
          if (view === 'traffic') {
            inSeries.push([timestamp, parseFloat(h.in_mbps.toFixed(2))]);
            outSeries.push([timestamp, parseFloat(h.out_mbps.toFixed(2))]);
          } else {
            // Optical: Parse Rx/Tx (may be comma separated for multi-lane)
            const parseVal = (str: string) => {
                if (!str) return 0;
                const parts = str.split(',').map(v => parseFloat(v)).filter(v => !isNaN(v));
                if (parts.length === 0) return 0;
                // Average of lanes
                return parseFloat((parts.reduce((a, b) => a + b, 0) / parts.length).toFixed(2));
            };
            inSeries.push([timestamp, parseVal(h.rx_power)]);
            outSeries.push([timestamp, parseVal(h.tx_power)]);
          }
        });
        
        setData({ in: inSeries, out: outSeries });
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, range === 'live' ? 5000 : 60000);

    return () => clearInterval(interval);
  }, [row.device_id, row.interface_id, range, view]);

  const options = useMemo(() => ({
    chart: {
      id: 'traffic-history',
      type: 'area',
      animations: {
        enabled: view === 'traffic' && range === 'live',
        easing: 'linear',
        dynamicAnimation: { speed: 1000 }
      },
      zoom: { enabled: true, type: 'x', autoScaleYaxis: true },
      toolbar: { show: true },
      background: 'transparent'
    },
    colors: view === 'traffic' ? ['#3b82f6', '#a855f7'] : ['#10b981', '#6366f1'], // Emerald/Indigo for Optical
    dataLabels: { enabled: false },
    stroke: {
      curve: (view === 'traffic' && range === 'live') ? 'smooth' : 'straight',
      width: 2
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.05, stops: [0, 100]
      }
    },
    xaxis: {
      type: 'datetime',
      labels: {
        style: { colors: '#64748b' },
        datetimeUTC: false,
        datetimeFormatter: {
          year: 'yyyy', month: 'MMM \'yy', day: 'dd MMM',
          hour: 'HH:mm', minute: (view === 'traffic' && range === 'live') ? 'HH:mm:ss' : 'HH:mm', second: 'HH:mm:ss'
        }
      },
      tooltip: { enabled: false }
    },
    yaxis: {
      min: view === 'traffic' ? undefined : -40,
      max: view === 'traffic' ? undefined : 10,
      labels: {
        style: { colors: '#64748b' },
        formatter: (val: number) => val.toFixed(2)
      },
      title: {
        text: view === 'traffic' ? 'Traffic (Mbps)' : 'Optical Power (dBm)',
        style: { color: '#64748b' }
      }
    },
    grid: { borderColor: '#334155', strokeDashArray: 4 },
    theme: { mode: 'dark' },
    tooltip: {
      theme: 'dark',
      x: { format: (view === 'traffic' && range === 'live') ? 'HH:mm:ss' : 'HH:mm' },
      y: {
          formatter: (val: number) => `${val.toFixed(2)} ${view === 'traffic' ? 'Mbps' : 'dBm'}`
      }
    },
    legend: {
        position: 'top', horizontalAlign: 'left', labels: { colors: '#94a3b8' }
    }
  }), [range, view]);

  const series = useMemo(() => [
    { name: view === 'traffic' ? 'Inbound' : 'Rx Power', data: data.in },
    { name: view === 'traffic' ? 'Outbound' : 'Tx Power', data: data.out }
  ], [data, view]);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4 backdrop-blur-md">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl p-6 relative border border-slate-200 dark:border-slate-800 animate-in fade-in zoom-in duration-200">
        <div className="flex justify-between items-start mb-6">
            <div>
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-teal-500/10 rounded-xl">
                        <Activity className="w-6 h-6 text-teal-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-slate-800 dark:text-slate-100 tracking-tight">
                            {view === 'traffic' ? 'Traffic Analysis' : 'Optical Analysis'}: <span className="text-teal-500 font-mono">{row.interface_name}</span>
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 font-medium flex items-center gap-1.5 mt-0.5">
                            {row.device_name} — <span className="font-mono">{row.device_ip}</span>
                        </p>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                    <button 
                        onClick={() => { setView('traffic'); setLoading(true); }}
                        className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'traffic' ? 'bg-white dark:bg-slate-700 text-teal-500 shadow-sm' : 'text-slate-400'}`}
                    >
                        Traffic
                    </button>
                    <button 
                        onClick={() => { setView('optical'); setLoading(true); }}
                        className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest rounded-lg transition-all ${view === 'optical' ? 'bg-white dark:bg-slate-700 text-teal-500 shadow-sm' : 'text-slate-400'}`}
                    >
                        Optical Graph
                    </button>
                </div>
                <button 
                    onClick={onClose}
                    className="p-2 text-slate-400 hover:text-rose-500 bg-slate-100 dark:bg-slate-800 rounded-xl transition-all hover:rotate-90"
                >
                    <X className="w-5 h-5" />
                </button>
            </div>
        </div>

        {/* Range Selectors */}
        <div className="flex items-center gap-2 mb-6 bg-slate-100 dark:bg-slate-800/50 p-1.5 rounded-2xl w-fit">
            {[
                { id: 'live', label: 'Live' },
                { id: '24h', label: '24 Hours' },
                { id: 'monthly', label: 'Monthly' },
                { id: 'yearly', label: 'Yearly' }
            ].map((r) => (
                <button
                    key={r.id}
                    onClick={() => { setRange(r.id); setLoading(true); }}
                    className={`px-4 py-2 text-[11px] font-black uppercase tracking-widest rounded-xl transition-all ${
                        range === r.id 
                            ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/25 scale-105' 
                            : 'text-slate-500 hover:text-teal-500 hover:bg-teal-500/5'
                    }`}
                >
                    {r.label}
                </button>
            ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <div className={`bg-${view === 'traffic' ? 'blue' : 'emerald'}-500/5 border border-${view === 'traffic' ? 'blue' : 'emerald'}-500/10 rounded-2xl p-4 flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 bg-${view === 'traffic' ? 'blue' : 'emerald'}-500/20 rounded-lg`}>
                        <ArrowDownLeft className={`w-5 h-5 text-${view === 'traffic' ? 'blue' : 'emerald'}-500`} />
                    </div>
                    <div>
                        <div className={`text-[10px] font-black text-${view === 'traffic' ? 'blue' : 'emerald'}-400 uppercase tracking-widest`}>
                            {view === 'traffic' ? 'Current In' : 'Current Rx'}
                        </div>
                        <div className="text-2xl font-black text-slate-700 dark:text-white font-mono">
                            {view === 'traffic' ? row.current_in_mbps.toFixed(2) : (typeof row.rx_power === 'string' && row.rx_power.includes(',') ? row.rx_power.split(',')[0] : parseFloat(row.rx_power || 0).toFixed(2))} 
                            <span className="text-xs text-slate-500 ml-1">{view === 'traffic' ? 'Mbps' : 'dBm'}</span>
                        </div>
                    </div>
                </div>
            </div>
            <div className={`bg-${view === 'traffic' ? 'purple' : 'indigo'}-500/5 border border-${view === 'traffic' ? 'purple' : 'indigo'}-500/10 rounded-2xl p-4 flex items-center justify-between`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 bg-${view === 'traffic' ? 'purple' : 'indigo'}-500/20 rounded-lg`}>
                        <ArrowUpRight className={`w-5 h-5 text-${view === 'traffic' ? 'purple' : 'indigo'}-500`} />
                    </div>
                    <div>
                        <div className={`text-[10px] font-black text-${view === 'traffic' ? 'purple' : 'indigo'}-400 uppercase tracking-widest`}>
                            {view === 'traffic' ? 'Current Out' : 'Current Tx'}
                        </div>
                        <div className="text-2xl font-black text-slate-700 dark:text-white font-mono">
                            {view === 'traffic' ? row.current_out_mbps.toFixed(2) : (typeof row.tx_power === 'string' && row.tx_power.includes(',') ? row.tx_power.split(',')[0] : parseFloat(row.tx_power || 0).toFixed(2))} 
                            <span className="text-xs text-slate-500 ml-1">{view === 'traffic' ? 'Mbps' : 'dBm'}</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div className="h-[400px] w-full bg-slate-50 dark:bg-black/20 rounded-2xl p-4 border border-slate-100 dark:border-slate-800/50 relative">
          {loading && data.in.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/50 dark:bg-slate-900/50 backdrop-blur-sm z-10 rounded-2xl">
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-10 h-10 animate-spin text-teal-500" />
                <p className="text-sm font-bold text-slate-500 animate-pulse uppercase tracking-widest">Polling Traffic Data...</p>
              </div>
            </div>
          ) : null}
          <Chart options={options as any} series={series} type="area" height="100%" width="100%" />
        </div>
        
        <div className="mt-4 flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <span>Real-time Update (5s)</span>
            <span>Historical window: {range === 'live' ? 'Live' : range === '24h' ? '24 Hours' : range === 'monthly' ? 'Monthly' : 'Yearly'}</span>
        </div>
      </div>
    </div>
  );
}

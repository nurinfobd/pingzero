'use client';

import { useEffect, useState, useMemo } from 'react';
import { X, Loader2 } from 'lucide-react';
import dynamic from 'next/dynamic';

const Chart = dynamic(() => import('react-apexcharts'), { ssr: false });

export default function PingGraphModal({ host, onClose }: { host: any, onClose: any }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState('realtime'); // realtime, daily, monthly, yearly

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/hosts/${host.id}/history?range=${range}`);
        if (!res.ok) throw new Error('Failed to fetch history');
        const history = await res.json();
        
        // Format for ApexCharts
        // For realtime, we might want simple array. For others, time series.
        // ApexCharts expects [timestamp, value] for datetime x-axis
        const formatted = history.map((h: any) => {
            let timestamp;
            if (range === 'realtime') {
                timestamp = new Date(h.created_at).getTime();
            } else {
                // The aggregated queries return 'time' string, not created_at
                // SQLite returns simplified string, might need parsing or just use as category
                // Actually, if we use datetime axis, we need valid timestamp.
                // SQLite strftime returns 'YYYY-MM-DD HH:MM' etc. which JS Date can parse (usually)
                // But let's be safe.
                timestamp = new Date(h.time || h.created_at).getTime();
            }
            return [timestamp, parseFloat(h.latency.toFixed(1))];
        });
        
        setData(formatted);
      } catch (err: any) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    
    let interval: any;
    if (range === 'realtime') {
      interval = setInterval(fetchData, 2000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [host.id, range]);

  const options = useMemo(() => ({
    chart: {
      id: 'ping-history',
      type: 'area',
      animations: {
        enabled: range === 'realtime', // Disable animations for longer ranges to improve performance and prevent zoom reset
        easing: 'linear',
        dynamicAnimation: {
          speed: 1000
        }
      },
      zoom: {
        enabled: range !== 'realtime',
        type: 'x',
        autoScaleYaxis: false,
        zoomedArea: {
          fill: {
            color: '#90CAF9',
            opacity: 0.4
          },
          stroke: {
            color: '#0D47A1',
            opacity: 0.4,
            width: 1
          }
        }
      },
      toolbar: {
        show: range !== 'realtime', // Show toolbar for manual zoom in non-realtime modes
        tools: {
          download: true,
          selection: true,
          zoom: true,
          zoomin: true,
          zoomout: true,
          pan: true,
          reset: true
        },
        autoSelected: 'zoom' 
      },
      background: 'transparent'
    },
    colors: ['#3b82f6'],
    dataLabels: {
      enabled: false
    },
    stroke: {
      curve: 'smooth',
      width: 2
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.4,
        opacityTo: 0.05,
        stops: [0, 100]
      }
    },
    xaxis: {
      type: 'datetime',
      tooltip: {
        enabled: false
      },
      axisBorder: {
        show: false
      },
      axisTicks: {
        show: false
      },
      labels: {
        style: {
          colors: '#64748b'
        },
        datetimeUTC: false, // Ensures times match local browser timezone
        datetimeFormatter: {
            year: 'yyyy',
            month: 'MMM \'yy',
            day: 'dd MMM',
            hour: 'HH:mm'
        }
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: '#64748b'
        }
      },
      title: {
        text: 'Latency (ms)',
        style: {
          color: '#64748b'
        }
      }
    },
    grid: {
      borderColor: '#334155',
      strokeDashArray: 4,
      xaxis: {
        lines: {
          show: true
        }
      },
      yaxis: {
        lines: {
          show: true
        }
      },
      padding: {
        top: 0,
        right: 0,
        bottom: 0,
        left: 10
      }
    },
    theme: {
      mode: 'dark' // We force dark theme look for chart internals or handle dynamically
    },
    annotations: {
        yaxis: [
            {
                y: host.latency_threshold || 100,
                borderColor: '#f97316',
                label: {
                    borderColor: '#f97316',
                    style: {
                        color: '#fff',
                        background: '#f97316',
                    },
                    text: 'Threshold',
                }
            }
        ]
    },
    tooltip: {
        theme: 'dark',
        x: {
            format: 'dd MMM HH:mm:ss'
        }
    }
  }), [range, host.latency_threshold]);

  const series = useMemo(() => [{
    name: 'Latency',
    data: data
  }], [data]);

  const ranges = [
    { id: 'realtime', label: 'Realtime' },
    { id: 'daily', label: 'Daily (24h)' },
    { id: 'monthly', label: 'Monthly (30d)' },
    { id: 'yearly', label: 'Yearly (365d)' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-5xl p-6 relative border border-slate-200 dark:border-slate-700">
        <div className="flex justify-between items-start mb-6">
            <div>
                <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    {host.name}
                    <span className={`text-sm px-2 py-0.5 rounded-full ${host.status === 'Up' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                        {host.status}
                    </span>
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 font-mono mt-1">
                    {host.ip}
                </p>
            </div>
            <button 
                onClick={onClose}
                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg transition-colors"
            >
                <X className="w-5 h-5" />
            </button>
        </div>

        {/* Range Tabs */}
        <div className="flex gap-2 mb-4 bg-slate-100 dark:bg-slate-900/50 p-1 rounded-lg w-fit">
            {ranges.map(r => (
                <button
                    key={r.id}
                    onClick={() => {
                        setRange(r.id);
                        setLoading(true);
                    }}
                    className={`
                        px-4 py-1.5 rounded-md text-sm font-medium transition-all
                        ${range === r.id 
                            ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' 
                            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'}
                    `}
                >
                    {r.label}
                </button>
            ))}
        </div>

        <div className="h-[450px] w-full bg-slate-50 dark:bg-slate-900/30 rounded-lg p-2 border border-slate-100 dark:border-slate-700/50">
          {loading && data.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin" />
            </div>
          ) : (
            <Chart options={options as any} series={series} type="area" height="100%" width="100%" />
          )}
        </div>
      </div>
    </div>
  );
}

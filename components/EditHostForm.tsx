'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';

export default function EditHostForm({ host, onSave, onCancel }: { host: any, onSave: any, onCancel: any }) {
  const [name, setName] = useState(host.name);
  const [ip, setIp] = useState(host.ip);
  const [threshold, setThreshold] = useState(host.latency_threshold || 100);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: any) => {
    e.preventDefault();
    if (!name || !ip) return;
    setLoading(true);
    try {
      await onSave(host.id, { name, ip, latency_threshold: parseInt(threshold) || 100 });
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 items-center bg-white dark:bg-slate-800 p-2 rounded shadow-lg border border-blue-500 absolute z-10">
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Host Name"
          className="p-1 border rounded text-sm dark:bg-slate-900 dark:border-slate-700"
          required
        />
      </div>
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={ip}
          onChange={(e) => setIp(e.target.value)}
          placeholder="IP Address"
          className="p-1 border rounded text-sm dark:bg-slate-900 dark:border-slate-700 font-mono"
          required
        />
      </div>
      <div className="flex flex-col gap-1 w-20">
        <input
          type="number"
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          placeholder="Max ms"
          className="p-1 border rounded text-sm dark:bg-slate-900 dark:border-slate-700"
          title="Max Latency Threshold (ms)"
          min="1"
        />
      </div>
      <div className="flex gap-1">
        <button
          type="submit"
          disabled={loading}
          className="p-1 bg-green-600 hover:bg-green-700 text-white rounded transition-colors"
          title="Save"
        >
          <Check className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="p-1 bg-slate-400 hover:bg-slate-500 text-white rounded transition-colors"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </form>
  );
}

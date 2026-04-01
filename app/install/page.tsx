'use client';

import { useEffect, useMemo, useState } from 'react';

type InstallStatus = { installed: boolean };

export default function InstallPage() {
  const [adminUsername, setAdminUsername] = useState('pingzero');
  const [adminPassword, setAdminPassword] = useState('teamzero');
  const [portalName, setPortalName] = useState('PingZero');
  const [logoDataUrl, setLogoDataUrl] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const logoPreview = useMemo(() => {
    if (logoDataUrl) return logoDataUrl;
    return '/pingzero.png';
  }, [logoDataUrl]);

  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/install/status', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as InstallStatus;
        if (data.installed) {
          window.location.href = '/login';
        }
      } catch (err) {}
    };
    run();
  }, []);

  const onPickLogo = async (file: File | null) => {
    setMessage(null);
    if (!file) {
      setLogoDataUrl('');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Logo file too large (max 5MB)' });
      return;
    }

    const readAsDataUrl = (f: File) =>
      new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(typeof r.result === 'string' ? r.result : '');
        r.onerror = () => reject(new Error('Failed to read file'));
        r.readAsDataURL(f);
      });

    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('Invalid image'));
        img.src = src;
      });

    try {
      const src = await readAsDataUrl(file);
      const img = await loadImage(src);

      const maxDim = 256;
      const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
      const width = Math.max(1, Math.round((img.width || 1) * scale));
      const height = Math.max(1, Math.round((img.height || 1) * scale));

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas not supported');
      ctx.drawImage(img, 0, 0, width, height);

      const preferredType = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
      const output =
        preferredType === 'image/jpeg' ? canvas.toDataURL(preferredType, 0.85) : canvas.toDataURL(preferredType);

      setLogoDataUrl(output);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Failed to load logo' });
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const res = await fetch('/api/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_username: adminUsername,
          admin_password: adminPassword,
          portal_name: portalName,
          logo_data_url: logoDataUrl || undefined,
        }),
      });

      if (!res.ok) {
        if (res.status === 413) {
          throw new Error('Logo payload too large. Please choose a smaller image.');
        }
        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const data: any = await res.json().catch(() => null);
          throw new Error(data?.error || 'Install failed');
        }
        throw new Error((await res.text()) || 'Install failed');
      }

      setMessage({ type: 'success', text: 'Install complete. Redirecting to login...' });
      setTimeout(() => {
        window.location.href = '/login';
      }, 800);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.message || 'Install failed' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 dark:bg-slate-950 p-4">
      <div className="max-w-xl w-full bg-white dark:bg-slate-900 rounded-2xl shadow-xl border border-slate-200 dark:border-slate-800 p-8">
        <div className="flex flex-col items-center gap-3 mb-8">
          <img src={logoPreview} alt="Portal Logo" className="h-12 object-contain block" />
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">First-time Setup</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 text-center">
            Set your admin account and portal branding.
          </p>
        </div>

        {message && (
          <div
            className={
              message.type === 'success'
                ? 'mb-6 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800 px-4 py-3 text-sm'
                : 'mb-6 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 px-4 py-3 text-sm'
            }
          >
            {message.text}
          </div>
        )}

        <form onSubmit={submit} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
              Portal Name
            </label>
            <input
              type="text"
              value={portalName}
              onChange={(e) => setPortalName(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
              placeholder="PingZero"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
              Portal Logo (optional)
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onPickLogo(e.target.files?.[0] || null)}
              className="w-full text-sm text-slate-700 dark:text-slate-300"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
                Admin Username
              </label>
              <input
                type="text"
                value={adminUsername}
                onChange={(e) => setAdminUsername(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 uppercase tracking-wider">
                Admin Password
              </label>
              <input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-3 text-sm font-semibold text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Installing...' : 'Complete Setup'}
          </button>
        </form>
      </div>
    </div>
  );
}

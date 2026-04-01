import { X, Moon, Sun, Monitor, BellRing, Volume2, MessageSquare } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function SettingsModal({ settings, onUpdate, onClose }: { settings: any, onUpdate: any, onClose: any }) {
  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChatId, setTelegramChatId] = useState('');
  const [hostDownUp, setHostDownUp] = useState(true);
  const [interfaceDownUp, setInterfaceDownUp] = useState(true);
  const [interfaceUtilization, setInterfaceUtilization] = useState(true);
  const [hostDegraded, setHostDegraded] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch('/api/settings/telegram')
      .then(res => res.json())
      .then(data => {
        if (data && !data.error) {
          setTelegramToken(data.token || '');
          setTelegramChatId(data.chatId || '');
          if (data.hostDownUp !== undefined) setHostDownUp(data.hostDownUp);
          if (data.interfaceDownUp !== undefined) setInterfaceDownUp(data.interfaceDownUp);
          if (data.interfaceUtilization !== undefined) setInterfaceUtilization(data.interfaceUtilization);
          if (data.hostDegraded !== undefined) setHostDegraded(data.hostDegraded);
        }
      })
      .catch(console.error);
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await fetch('/api/settings/telegram', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token: telegramToken, 
          chatId: telegramChatId,
          hostDownUp,
          interfaceDownUp,
          interfaceUtilization,
          hostDegraded
        })
      });
    } catch (err) {
      console.error(err);
    }
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="flex flex-col bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl border border-slate-200 dark:border-slate-700 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
          <h3 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
            <SettingsIcon className="w-5 h-5 text-slate-500" />
            System Settings
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 dark:hover:text-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 p-6">
          
          {/* Left Column */}
          <div className="flex flex-col gap-6">
            {/* Theme Section */}
            <div className="flex flex-col gap-3">
            <label className="text-xs font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              Appearance (Theme)
            </label>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => onUpdate({ ...settings, theme: 'light' })}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  settings.theme === 'light' 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Sun className="w-6 h-6" />
                <span className="text-xs font-semibold">Light</span>
              </button>
              <button
                onClick={() => onUpdate({ ...settings, theme: 'dark' })}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  settings.theme === 'dark' 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Moon className="w-6 h-6" />
                <span className="text-xs font-semibold">Dark</span>
              </button>
              <button
                onClick={() => onUpdate({ ...settings, theme: 'system' })}
                className={`flex flex-col items-center gap-2 p-3 rounded-lg border-2 transition-all ${
                  settings.theme === 'system' 
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600' 
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <Monitor className="w-6 h-6" />
                <span className="text-xs font-semibold">System</span>
              </button>
            </div>
          </div>

          <div className="h-px w-full bg-slate-200 dark:bg-slate-800"></div>

          {/* Alerts Section */}
          <div className="flex flex-col gap-4">
            <label className="text-xs font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              Alarm & Notifications
            </label>

            {/* Toast Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                  <BellRing className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Toast Notifications</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Show popup when device goes up/down</p>
                </div>
              </div>
              <button
                onClick={() => onUpdate({ ...settings, toastsEnabled: !settings.toastsEnabled })}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                  settings.toastsEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.toastsEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Sound Toggle & Selection */}
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-slate-100 dark:bg-slate-800 rounded-lg">
                    <Volume2 className="w-5 h-5 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">Audio Alarm</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Play continuous beep when devices are down</p>
                  </div>
                </div>
                <button
                  onClick={() => onUpdate({ ...settings, soundEnabled: !settings.soundEnabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    settings.soundEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings.soundEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Sound Type Selection */}
              {settings.soundEnabled && (
                <div className="ml-12 flex items-center gap-3">
                  <span className="text-sm text-slate-600 dark:text-slate-400">Alarm Tone:</span>
                  <select
                    value={settings.soundType || 'standard'}
                    onChange={(e) => onUpdate({ ...settings, soundType: e.target.value })}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2"
                  >
                    <option value="standard">Standard Beep</option>
                    <option value="radar">Sonar Ping</option>
                    <option value="siren">Emergency Siren</option>
                    <option value="pulse">Fast Pulse</option>
                    <option value="chime">Gentle Chime</option>
                    <option value="klaxon">Deep Klaxon</option>
                    <option value="subtle">Subtle Thud</option>
                    <option value="digital">8-Bit Digital</option>
                    <option value="heartbeat">Flatline Tone</option>
                    <option value="scifi">Sci-Fi Sweep</option>
                  </select>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="flex flex-col gap-6">
          {/* Integrations Section */}
          <div className="flex flex-col gap-4">
            <label className="text-xs font-bold tracking-wider text-slate-500 dark:text-slate-400 uppercase">
              Integrations (Telegram)
            </label>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <MessageSquare className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Telegram Alerts</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Receive instant push notifications</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Bot Token</label>
                <input
                  type="password"
                  value={telegramToken}
                  onChange={(e) => setTelegramToken(e.target.value)}
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">Chat ID</label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => setTelegramChatId(e.target.value)}
                  placeholder="-1001234567890"
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 block p-2.5"
                />
              </div>

              <div className="mt-3 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Host Down & Up Alerts</span>
                  <button
                    onClick={() => setHostDownUp(!hostDownUp)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                       hostDownUp ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${hostDownUp ? 'translate-x-4.5' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Interface Down & Up Alerts</span>
                  <button
                    onClick={() => setInterfaceDownUp(!interfaceDownUp)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                       interfaceDownUp ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${interfaceDownUp ? 'translate-x-4.5' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Interface 100% Utilization Alerts</span>
                  <button
                    onClick={() => setInterfaceUtilization(!interfaceUtilization)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                       interfaceUtilization ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${interfaceUtilization ? 'translate-x-4.5' : 'translate-x-1'}`} />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-700 dark:text-slate-300">Degraded/Normal Ping Alerts</span>
                  <button
                    onClick={() => setHostDegraded(!hostDegraded)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${
                       hostDegraded ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${hostDegraded ? 'translate-x-4.5' : 'translate-x-1'}`} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
          <button
            onClick={async () => {
              try {
                await fetch('/api/auth/logout', { method: 'POST' });
                window.location.href = '/login';
              } catch (err) {
                console.error('Logout failed', err);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-400 border border-transparent rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 focus:outline-none transition-colors"
          >
            Logout
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:outline-none transition-colors disabled:opacity-50"
          >
            {isSaving ? 'Saving...' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Just a tiny helper for the Settings icon to avoid another import if missing
function SettingsIcon(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}
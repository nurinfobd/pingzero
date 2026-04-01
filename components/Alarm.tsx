'use client';

import { useEffect, useState, useRef } from 'react';
import { Volume2, VolumeX, AlertTriangle } from 'lucide-react';

export default function Alarm({ hosts, hidden = false, enabled, soundType = 'standard', onToggle }: { hosts: any[], hidden?: boolean, enabled: boolean, soundType?: string, onToggle: (val: boolean) => void }) {
  const audioCtxRef = useRef<any>(null);
  const intervalRef = useRef<any>(null);
  
  // Check if any host is down
  const isDown = hosts && hosts.some((h: any) => h.status === 'Down');

  useEffect(() => {
    // Initialize AudioContext
    if (typeof window !== 'undefined') {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      audioCtxRef.current = new AudioContext();
    }
    return () => {
      stopAlarm();
      if (audioCtxRef.current) {
        audioCtxRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (isDown && enabled) {
      startAlarm();
    } else {
      stopAlarm();
    }
  }, [isDown, enabled, soundType]);

  const playBeep = () => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    
    // Resume context if suspended (browser policy)
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const createTone = (freq: number, start: number, duration: number, type: OscillatorType = 'square') => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.type = type;
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(freq, start);
      
      // Envelope to avoid audio clicks
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.1, start + 0.02);
      gain.gain.setValueAtTime(0.1, start + duration - 0.02);
      gain.gain.linearRampToValueAtTime(0, start + duration);
      
      osc.start(start);
      osc.stop(start + duration);
      return { osc, gain };
    };

    const now = ctx.currentTime;
    
    if (soundType === 'radar') {
      // Sonar / Radar ping (high pitch sine wave fading out)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(1000, now);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.3, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (soundType === 'siren') {
      // Emergency Siren (sweeping sawtooth)
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.linearRampToValueAtTime(1000, now + 0.4);
      osc.frequency.linearRampToValueAtTime(600, now + 0.8);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
      gain.gain.setValueAtTime(0.15, now + 0.7);
      gain.gain.linearRampToValueAtTime(0, now + 0.8);
      
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (soundType === 'pulse') {
      // Fast warning pulse
      createTone(900, now, 0.1, 'square');
      createTone(900, now + 0.15, 0.1, 'square');
      createTone(900, now + 0.3, 0.1, 'square');
    } else if (soundType === 'chime') {
      // Gentle warning chime
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.2); // E5
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.8);
      
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (soundType === 'klaxon') {
      // Deep industrial klaxon
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.setValueAtTime(250, now + 0.4);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
      gain.gain.setValueAtTime(0.2, now + 0.7);
      gain.gain.linearRampToValueAtTime(0, now + 0.8);
      
      osc.start(now);
      osc.stop(now + 0.8);
    } else if (soundType === 'subtle') {
      // Very soft low thud
      createTone(300, now, 0.2, 'sine');
    } else if (soundType === 'digital') {
      // Classic 8-bit digital warning
      createTone(1200, now, 0.05, 'square');
      createTone(1600, now + 0.1, 0.05, 'square');
      createTone(1200, now + 0.2, 0.05, 'square');
      createTone(1600, now + 0.3, 0.05, 'square');
    } else if (soundType === 'heartbeat') {
      // Heartbeat monitor flatline
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(800, now);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.1);
      gain.gain.setValueAtTime(0.15, now + 0.9);
      gain.gain.linearRampToValueAtTime(0, now + 1.0);
      
      osc.start(now);
      osc.stop(now + 1.0);
    } else if (soundType === 'scifi') {
      // Sci-fi warning sweep
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.frequency.setValueAtTime(1500, now);
      osc.frequency.exponentialRampToValueAtTime(400, now + 0.5);
      
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.05);
      gain.gain.linearRampToValueAtTime(0, now + 0.5);
      
      osc.start(now);
      osc.stop(now + 0.5);
    } else {
      // Standard double-beep alert sound
      createTone(800, now, 0.15, 'square');
      createTone(800, now + 0.25, 0.15, 'square');
    }
  };

  const startAlarm = () => {
    if (intervalRef.current) return;
    // Play immediately
    playBeep();
    // Loop
    intervalRef.current = setInterval(playBeep, 1000);
  };

  const stopAlarm = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  };

  const toggleAudio = () => {
    if (!enabled) {
        // Resume context on user gesture
        if (audioCtxRef.current && audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
    }
    if (onToggle) onToggle(!enabled);
  };

  if (!isDown) return null;

  if (hidden) {
    return (
      <button 
        onClick={toggleAudio}
        className={`
          fixed bottom-6 right-6 z-50 p-4 rounded-full shadow-xl transition-all border-2
          ${enabled 
            ? 'bg-red-600 border-red-400 text-white hover:bg-red-700 animate-pulse shadow-[0_0_20px_rgba(220,38,38,0.6)]' 
            : 'bg-slate-800 border-slate-600 text-slate-400 hover:bg-slate-700'}
        `}
        title={enabled ? "Mute Global Alarm" : "Enable Global Alarm"}
      >
        {enabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
      </button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-bounce">
      <div className={`
        flex items-center gap-4 px-6 py-4 rounded-[2rem] shadow-[0_8px_30px_rgb(220,38,38,0.4)] border-4
        bg-[#e53935] border-[#f87171] text-white
      `}>
        <AlertTriangle className="w-8 h-8 animate-pulse text-[#fecaca] stroke-[1.5]" />
        <div className="flex flex-col">
          <span className="font-extrabold text-[1.3rem] leading-none uppercase tracking-[0.05em] mb-1">Critical Alert</span>
          <span className="text-[0.7rem] font-mono opacity-90 uppercase tracking-widest">Device Down Detected</span>
        </div>
        <div className="h-10 w-[1px] bg-[#f87171] mx-3 opacity-50"></div>
        <button 
          onClick={toggleAudio}
          className={`
            p-3 rounded-full transition-colors focus:outline-none 
            ${enabled ? 'bg-[#b91c1c] hover:bg-[#991b1b]' : 'bg-[#991b1b] hover:bg-[#7f1d1d] opacity-80'}
          `}
          title={enabled ? "Mute Alarm" : "Enable Alarm Sound"}
        >
          {enabled ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
}

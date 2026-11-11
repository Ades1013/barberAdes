import { RealtimeEvent } from '../types';
import { supabase } from './supabaseClient';
import { RealtimeChannel } from '@supabase/supabase-js';

type SyncCallback = (event: RealtimeEvent) => void;
type ToastCallback = (event: RealtimeEvent) => void;

class RealtimeBus {
  private localChannel: BroadcastChannel | null = null;
  private supabaseChannel: RealtimeChannel | null = null;
  private syncListeners: Set<SyncCallback> = new Set();
  private toastListeners: Set<ToastCallback> = new Set();
  private soundEnabled: boolean = true;
  private audioCtx: AudioContext | null = null;
  private isConnectedToSupabase: boolean = false;

  constructor() {
    this.initLocalBroadcast();
    this.initSupabaseRealtime();
  }

  private initLocalBroadcast() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      try {
        this.localChannel = new BroadcastChannel('barbersync_realtime_stream');
        this.localChannel.onmessage = (event) => {
          if (event.data) {
            // SILENT BACKGROUND SYNC ONLY for remote tabs:
            // Do NOT trigger toasts, do NOT play chime
            this.notifyDataSync(event.data);
          }
        };
      } catch (err) {
        console.warn('BroadcastChannel error, fallback to window events:', err);
      }
    }

    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key?.startsWith('barbersync_')) {
          this.notifyDataSync({
            id: `evt-${Date.now()}`,
            type: 'STATUS_CHANGE',
            payload: null,
            timestamp: Date.now(),
            actor: 'client',
            message: 'Actualización en segundo plano',
          });
        }
      });
    }
  }

  private initSupabaseRealtime() {
    try {
      if (this.supabaseChannel) {
        try {
          this.supabaseChannel.unsubscribe();
          supabase.removeChannel(this.supabaseChannel);
        } catch {}
        this.supabaseChannel = null;
      }
      this.supabaseChannel = supabase
        .channel('barbersync_db_realtime')
        // 1. Listen to appointments table changes in Supabase (100% SILENT SYNC)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'appointments' },
          (payload) => {
            const eventType: RealtimeEvent['type'] =
              payload.eventType === 'INSERT'
                ? 'NEW_BOOKING'
                : payload.eventType === 'DELETE'
                ? 'CANCEL_BOOKING'
                : 'STATUS_CHANGE';

            // Silently notify app data listeners to refresh database in background
            this.notifyDataSync({
              id: `supabase-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              type: eventType,
              payload: payload.new || payload.old,
              timestamp: Date.now(),
              actor: 'client',
              message: 'Sincronización en segundo plano',
            });
          }
        )
        // 2. Listen to blocked_slots table changes in Supabase (100% SILENT SYNC)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'blocked_slots' },
          (payload) => {
            const eventType: RealtimeEvent['type'] =
              payload.eventType === 'DELETE' ? 'UNBLOCK_SLOT' : 'BLOCK_SLOT';

            // Silently notify app data listeners to refresh slots in background
            this.notifyDataSync({
              id: `supabase-block-${Date.now()}`,
              type: eventType,
              payload: payload.new || payload.old,
              timestamp: Date.now(),
              actor: 'barber',
              message: 'Sincronización en segundo plano',
            });
          }
        )
        // 3. Listen to barbers table changes in Supabase (100% SILENT SYNC for schedules, exceptions, profile)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'barbers' },
          (payload) => {
            this.notifyDataSync({
              id: `supabase-barber-${Date.now()}`,
              type: 'STATUS_CHANGE',
              payload: payload.new || payload.old,
              timestamp: Date.now(),
              actor: 'barber',
              message: 'Sincronización de perfil y excepciones en segundo plano',
            });
          }
        )
        .subscribe((status) => {
          this.isConnectedToSupabase = status === 'SUBSCRIBED';
        });
    } catch (err) {
      console.warn('Error setting up Supabase Realtime channel:', err);
    }
  }

  public isCloudConnected(): boolean {
    return this.isConnectedToSupabase;
  }

  /**
   * Data sync subscription for components (App.tsx) to reload appointments and blocked slots.
   * Runs in the background for all remote and local events.
   */
  public subscribe(callback: SyncCallback): () => void {
    this.syncListeners.add(callback);
    return () => {
      this.syncListeners.delete(callback);
    };
  }

  /**
   * Toast notification subscription for NotificationToast component.
   * Triggered ONLY on the device of the user who performed the action.
   */
  public subscribeToToasts(callback: ToastCallback): () => void {
    this.toastListeners.add(callback);
    return () => {
      this.toastListeners.delete(callback);
    };
  }

  /**
   * Called ONLY when the current local user performs an action in the UI.
   * - Shows a local confirmation toast on this device only.
   * - Plays chime ONLY for the user on this device confirming their own reservation.
   * - Refreshes local UI and broadcasts to other tabs/devices for silent sync.
   */
  public emit(event: Omit<RealtimeEvent, 'id' | 'timestamp'>): void {
    const fullEvent: RealtimeEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };

    // Sound plays ONLY for the local user on this device confirming a booking
    if (fullEvent.type === 'NEW_BOOKING') {
      this.playChime();
    }

    // Broadcast event to other browser tabs for SILENT sync (no remote toast, no remote sound)
    if (this.localChannel) {
      this.localChannel.postMessage(fullEvent);
    }

    // Refresh local app state
    this.notifyDataSync(fullEvent);

    // Show toast ONLY on this local device for the author of the action
    this.notifyToast(fullEvent);
  }

  private notifyDataSync(event: RealtimeEvent) {
    this.syncListeners.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error('Error in realtime sync callback:', err);
      }
    });
  }

  private notifyToast(event: RealtimeEvent) {
    this.toastListeners.forEach((callback) => {
      try {
        callback(event);
      } catch (err) {
        console.error('Error in toast callback:', err);
      }
    });
  }

  public setSoundEnabled(enabled: boolean) {
    this.soundEnabled = enabled;
  }

  public isSoundEnabled(): boolean {
    return this.soundEnabled;
  }

  public playChime() {
    if (!this.soundEnabled || typeof window === 'undefined') return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;

      const osc1 = this.audioCtx.createOscillator();
      const gain1 = this.audioCtx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now);
      gain1.gain.setValueAtTime(0.15, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(this.audioCtx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      const osc2 = this.audioCtx.createOscillator();
      const gain2 = this.audioCtx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(987.77, now + 0.12);
      gain2.gain.setValueAtTime(0.2, now + 0.12);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
      osc2.connect(gain2);
      gain2.connect(this.audioCtx.destination);
      osc2.start(now + 0.12);
      osc2.stop(now + 0.6);
    } catch {
      // Audio context restricted
    }
  }

  public destroy() {
    if (this.supabaseChannel) {
      try {
        this.supabaseChannel.unsubscribe();
        supabase.removeChannel(this.supabaseChannel);
      } catch {}
      this.supabaseChannel = null;
    }
    if (this.localChannel) {
      try {
        this.localChannel.close();
      } catch {}
      this.localChannel = null;
    }
    this.syncListeners.clear();
    this.toastListeners.clear();
  }
}

export const realtimeService = new RealtimeBus();

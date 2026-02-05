/* eslint-disable @typescript-eslint/no-explicit-any */
import { Buffer } from 'buffer';

// This tells TypeScript to stop complaining about window.Buffer
declare global {
  interface Window {
    Buffer: typeof Buffer;
    global: Window;
    process: any;
  }
}

if (typeof window !== 'undefined') {
    window.Buffer = Buffer;
    window.global = window;
    window.process = {
        env: { NODE_DEBUG: undefined },
        version: '',
        nextTick: (cb: any) => setTimeout(cb, 0),
    };
}

export {};
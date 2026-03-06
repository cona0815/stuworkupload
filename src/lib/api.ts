import { mockBackend } from './mock-backend';
import { gasBackend } from './gas-backend';
import { gasHeadlessBackend } from './gas-headless';

// Determine which backend to use
// 1. If VITE_GAS_API_URL is set, use Headless mode (for GitHub Pages)
// 2. If window.google.script exists, use Native GAS mode (for GAS hosting)
// 3. Otherwise, use Mock mode (for local dev without API URL)

const isGasHeadless = !!import.meta.env.VITE_GAS_API_URL;
const isGasNative = typeof window !== 'undefined' && 
                    window.google && 
                    window.google.script;

export const backend = isGasHeadless ? gasHeadlessBackend : 
                       isGasNative ? gasBackend : 
                       mockBackend;

// Export types
export type { FileRecord, UserSession } from './mock-backend';

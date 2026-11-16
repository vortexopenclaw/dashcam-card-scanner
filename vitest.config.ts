import {defineConfig} from 'vitest/config';
// Native fixture files launch Cargo and probe subprocesses. Running one worker
// per CPU oversubscribes those shared resources and starves jsdom timers.
export default defineConfig({test:{include:['tests/**/*.test.{ts,js}'],maxWorkers:2}});

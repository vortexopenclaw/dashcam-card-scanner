// SPDX-License-Identifier: AGPL-3.0-only
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './style.css';
import { initTelemetry, observeInvoke, runTestTriggers } from './telemetry';
import { mount } from './ui';
// Reporting first so mount-time errors are captured; failures never block the UI.
initTelemetry();
mount(document.querySelector<HTMLElement>('#app')!, { invoke: observeInvoke(invoke), listen });
void runTestTriggers(invoke);

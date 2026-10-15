// SPDX-License-Identifier: AGPL-3.0-only
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './style.css';
import { mount } from './ui';
mount(document.querySelector<HTMLElement>('#app')!, { invoke, listen });

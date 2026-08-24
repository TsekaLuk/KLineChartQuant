<template>
  <AgentWorkbenchShell
    :bridge="bridge"
    :panel-width-storage="panelWidthStorage"
    :theme="currentTheme"
  >
    <template #chart>
      <KlineChart
        ref="chartRef"
        :custom-data="e2eChartData"
        @theme-change="currentTheme = $event"
      />
    </template>
  </AgentWorkbenchShell>
</template>

<script setup lang="ts">
  import {
    AgentWorkbenchShell,
    KlineChart,
    useAgentChartToolHost,
    type AgentChartControllerHandle,
    type AgentPanelWidthStorage,
  } from '@363045841yyt/klinechart'
  import { ref } from 'vue'

  import { createE2eChartData } from './features/agent/chart-e2e-fixture'
  import { NativeAgentBridgeClient } from './features/agent/native-agent-bridge'

  const PANEL_WIDTH_KEY = 'agent.panelWidth'
  const nativeAgent = window.desktopAPI?.agent
  if (!nativeAgent) throw new Error('The secure Agent preload bridge is unavailable.')
  const bridge = new NativeAgentBridgeClient(nativeAgent)
  const e2eChartData = import.meta.env.MODE === 'e2e' ? createE2eChartData() : undefined
  const chartRef = ref<AgentChartControllerHandle | null>(null)
  const currentTheme = ref<'light' | 'dark'>(
    window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  )
  useAgentChartToolHost(chartRef, window.desktopAPI?.chartTools)

  const panelWidthStorage: AgentPanelWidthStorage = {
    load() {
      const width = window.desktopAPI?.store.get(PANEL_WIDTH_KEY)
      return typeof width === 'number' ? width : undefined
    },
    save(width) {
      window.desktopAPI?.store.set(PANEL_WIDTH_KEY, width)
    },
  }
</script>

<style>
  :root {
    color-scheme: light dark;
  }

  html,
  body,
  #app {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
  }

  body {
    background: #f4f6f7;
  }

  @media (prefers-color-scheme: dark) {
    body {
      background: #151a1d;
    }
  }
</style>

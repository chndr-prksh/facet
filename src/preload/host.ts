import { contextBridge, ipcRenderer } from 'electron'

const INVOKE = /^(app|state|pane|cursor|shots|shell|cookies|data|links|dev|live|dialog|mcp|agent|auth):[\w-]+$/
const EVENTS = /^facet:[\w-]+$/

const api = {
  invoke(channel: string, ...args: unknown[]): Promise<unknown> {
    if (!INVOKE.test(channel)) return Promise.reject(new Error(`Blocked channel ${channel}`))
    return ipcRenderer.invoke(channel, ...args)
  },
  on(channel: string, listener: (...args: unknown[]) => void): () => void {
    if (!EVENTS.test(channel)) throw new Error(`Blocked channel ${channel}`)
    const wrapped = (_event: unknown, ...args: unknown[]): void => listener(...args)
    ipcRenderer.on(channel, wrapped)
    return () => ipcRenderer.removeListener(channel, wrapped)
  }
}

export type FacetBridge = typeof api

contextBridge.exposeInMainWorld('facet', api)

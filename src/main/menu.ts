import { Menu, app, shell, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'

/** Builds the application menu. Accelerators live here so they keep working while a device pane has focus. */
export function buildMenu(getWindow: () => BrowserWindow | null): void {
  const isMac = process.platform === 'darwin'
  const cmd = (id: string) => (): void => getWindow()?.webContents.send('facet:command', id)
  const item = (label: string, id: string, accelerator?: string): MenuItemConstructorOptions => ({
    label,
    accelerator,
    click: cmd(id)
  })
  const sep: MenuItemConstructorOptions = { type: 'separator' }

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              sep,
              item('Settings…', 'app.settings', 'Cmd+,'),
              sep,
              { role: 'services' },
              sep,
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              sep,
              { role: 'quit' }
            ]
          } as MenuItemConstructorOptions
        ]
      : []),
    {
      label: 'File',
      submenu: [
        item('New Tab', 'tab.new', 'CmdOrCtrl+T'),
        item('Close Tab', 'tab.close', 'CmdOrCtrl+W'),
        sep,
        item('Open Location…', 'nav.focus-url', 'CmdOrCtrl+L'),
        item('Open File…', 'nav.open-file', 'CmdOrCtrl+O'),
        sep,
        item('Bookmark This Page', 'bookmark.toggle', 'CmdOrCtrl+D'),
        ...(isMac ? [] : [sep, item('Settings…', 'app.settings', 'Ctrl+,'), sep, { role: 'quit' } as MenuItemConstructorOptions])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        sep,
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'pasteAndMatchStyle' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        item('Command Palette…', 'view.palette', 'CmdOrCtrl+K'),
        sep,
        item('Reload All Devices', 'nav.reload', 'CmdOrCtrl+R'),
        item('Hard Reload (Skip Cache)', 'nav.hard-reload', 'CmdOrCtrl+Shift+R'),
        item('Back', 'nav.back', 'CmdOrCtrl+['),
        item('Forward', 'nav.forward', 'CmdOrCtrl+]'),
        sep,
        item('Zoom In', 'view.zoom-in', 'CmdOrCtrl+='),
        item('Zoom Out', 'view.zoom-out', 'CmdOrCtrl+-'),
        item('Zoom to Fit', 'view.zoom-fit', 'CmdOrCtrl+0'),
        item('Actual Size', 'view.zoom-100', 'CmdOrCtrl+1'),
        sep,
        item('Cycle Layout', 'view.layout', 'CmdOrCtrl+Shift+L'),
        item('Toggle Device Frames', 'view.frames', 'CmdOrCtrl+Shift+F'),
        item('Toggle Side Panel', 'view.panel', 'CmdOrCtrl+J'),
        sep,
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Devices',
      submenu: [
        item('Manage Devices…', 'devices.manage', 'CmdOrCtrl+Shift+M'),
        item('Add Responsive Pane', 'devices.add-responsive', 'CmdOrCtrl+Shift+N'),
        item('Rotate All', 'devices.rotate', 'CmdOrCtrl+Alt+R'),
        sep,
        item('Toggle Light / Dark', 'tools.color-scheme', 'CmdOrCtrl+Shift+D'),
        item('Toggle Interaction Mirroring', 'tools.sync', 'CmdOrCtrl+Shift+Y'),
        item('Scroll All to Top', 'tools.scroll-top', 'CmdOrCtrl+Up')
      ]
    },
    {
      label: 'Tools',
      submenu: [
        item('Compare Element Across Devices', 'tools.inspect', 'CmdOrCtrl+I'),
        item('Run All Audits', 'tools.audit', 'CmdOrCtrl+Shift+A'),
        sep,
        item('Screenshot All Devices', 'tools.screenshot-all', 'CmdOrCtrl+Shift+S'),
        item('Full-Page Screenshot of All Devices', 'tools.screenshot-full-all', 'CmdOrCtrl+Alt+S'),
        item('Screenshot Studio…', 'tools.studio', 'CmdOrCtrl+Shift+P'),
        sep,
        item('Open DevTools for Focused Device', 'tools.devtools', 'CmdOrCtrl+Alt+I'),
        item('Clear Cookies and Storage', 'tools.clear-data'),
        ...(app.isPackaged
          ? []
          : [sep, { label: 'Inspect Facet UI', click: () => getWindow()?.webContents.openDevTools({ mode: 'detach' }) } as MenuItemConstructorOptions])
      ]
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        item('Keyboard Shortcuts', 'app.shortcuts', 'CmdOrCtrl+/'),
        { label: 'Model Context Protocol Docs', click: () => void shell.openExternal('https://modelcontextprotocol.io') }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

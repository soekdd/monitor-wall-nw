import { Menu } from 'electron';

export const editMenu = {
  label: 'Bearbeiten',
  submenu: [
    { role: 'undo', label: 'Rückgängig' },
    { role: 'redo', label: 'Wiederholen' },
    { type: 'separator' },
    { role: 'cut', label: 'Ausschneiden' },
    { role: 'copy', label: 'Kopieren' },
    { role: 'paste', label: 'Einfügen' },
    { type: 'separator' },
    { role: 'selectAll', label: 'Alles auswählen' },
  ],
};

export function installEditingContextMenu(win) {
  win.webContents.on('context-menu', (_event, params) => {
    const { editFlags, isEditable, selectionText } = params;
    const items = isEditable ? [
      { role: 'undo', label: 'Rückgängig', enabled: editFlags.canUndo },
      { role: 'redo', label: 'Wiederholen', enabled: editFlags.canRedo },
      { type: 'separator' },
      { role: 'cut', label: 'Ausschneiden', enabled: editFlags.canCut },
      { role: 'copy', label: 'Kopieren', enabled: editFlags.canCopy },
      { role: 'paste', label: 'Einfügen', enabled: editFlags.canPaste },
      { type: 'separator' },
      { role: 'selectAll', label: 'Alles auswählen', enabled: editFlags.canSelectAll },
    ] : selectionText ? [{ role: 'copy', label: 'Kopieren', enabled: editFlags.canCopy }] : [];
    if (items.length) Menu.buildFromTemplate(items).popup({ window: win });
  });
}

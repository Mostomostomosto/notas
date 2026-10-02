export interface AppSettings {
  driveFolderName: string;
  dropboxFolderName: string;
  dropboxAppKey: string;
  autoSync: boolean;
}

const SETTINGS_KEY = 'app_notas_settings';

const DEFAULT_SETTINGS: AppSettings = {
  driveFolderName: 'MiAppNotas',
  dropboxFolderName: 'MiAppNotas',
  dropboxAppKey: '',
  autoSync: true,
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      driveFolderName: (parsed.driveFolderName || DEFAULT_SETTINGS.driveFolderName).trim(),
      dropboxFolderName: (parsed.dropboxFolderName || DEFAULT_SETTINGS.dropboxFolderName).trim(),
      dropboxAppKey: (parsed.dropboxAppKey || '').trim(),
      autoSync: parsed.autoSync ?? DEFAULT_SETTINGS.autoSync,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(newSettings: Partial<AppSettings>): AppSettings {
  const current = getSettings();
  const updated: AppSettings = {
    ...current,
    ...newSettings,
  };
  if (newSettings.driveFolderName) {
    updated.driveFolderName = newSettings.driveFolderName.trim().replace(/[/\\:*?"<>|]/g, '_') || 'MiAppNotas';
  }
  if (newSettings.dropboxFolderName) {
    updated.dropboxFolderName = newSettings.dropboxFolderName.trim().replace(/[/\\:*?"<>|]/g, '_') || 'MiAppNotas';
  }
  if (newSettings.dropboxAppKey !== undefined) {
    updated.dropboxAppKey = newSettings.dropboxAppKey.trim();
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}

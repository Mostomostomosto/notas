export interface AppSettings {
  driveFolderName: string;
  autoSync: boolean;
}

const SETTINGS_KEY = 'app_notas_settings';

const DEFAULT_SETTINGS: AppSettings = {
  driveFolderName: 'MiAppNotas',
  autoSync: true,
};

export function getSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      driveFolderName: (parsed.driveFolderName || DEFAULT_SETTINGS.driveFolderName).trim(),
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
    // Sanitizar nombre de carpeta
    updated.driveFolderName = newSettings.driveFolderName.trim().replace(/[/\\:*?"<>|]/g, '_') || 'MiAppNotas';
  }
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(updated));
  return updated;
}

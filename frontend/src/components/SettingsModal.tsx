import { useState, useEffect, useCallback, useMemo } from 'react';
import * as AppGo from '../../wailsjs/go/wailsapp/App.js';
import { getAvailableLanguages, setLanguage as setGlobalLanguage, t as $t, type I18nKey, type LanguageCode } from '../i18n.ts';
import { getModKey, buildCombo } from '../utils/platform.ts';
import { APP_BUILD_TIME, APP_VERSION } from '../config.ts';
import { formatUpdateError, useUpdateChecker, type UpdateCheckResult } from '../hooks/useUpdateChecker.ts';
import { Keyboard, Cloud, Info, Database, Folder, X, Globe, Palette, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { Z } from '../constants/zIndex';
import { WindowSetSize, WindowUnmaximise } from '../../wailsjs/runtime/runtime.js';
import { deleteProgramFont, getProgramFontAssignmentSnapshot, listProgramFonts, selectAndImportProgramFontFiles, setProgramFontPreference } from '../utils/programFonts.ts';
import { getAppThemeMode, getThemePackageSettings as getStoredThemePackageSettings, getTerminalTheme, listThemePackages, loadThemePackages, saveThemePackageSettings, type ThemePackage } from '../utils/theme.ts';
import { loadKeywordRulesFromStorage, saveKeywordRulesToStorage, resetKeywordRulesToDefault, setKeywordRules, type KeywordRule } from '../utils/terminalKeywordHighlight.ts';
import { getGlobalAppearanceSettings, notifyGlobalAppearanceChanged } from '../utils/globalAppearance.ts';
import { Button } from './ui';
import { cn } from '../utils/cn.ts';
import AppTab from './settings/AppTab';
import GeneralTab from './settings/GeneralTab';
import NetworkTab from './settings/NetworkTab';
import AppearanceTabPane from './settings/appearance/AppearanceTabPane';
import FileManagerTab from './settings/FileManagerTab';
import RuntimeEnvironmentTab from './settings/RuntimeEnvironmentTab';
import ShortcutsTab from './settings/ShortcutsTab';
import SyncTabPane from './settings/sync/SyncTabPane';
import { DEFAULT_RUNTIME_ENVIRONMENT_SETTINGS, getRuntimeEnvironmentSettings, saveRuntimeEnvironmentSettings } from './settings/runtimeEnvironmentBridge.ts';
import { settingsConfirm } from './settings/settingsDialogs.ts';
import { PROVIDER_LIST } from './settings/sync/syncProviders.ts';
import { SETTINGS_SEARCH_DEFINITIONS, SETTINGS_SECTIONS } from './settings/settingDefinitions';

const TAB_ICON: Record<string, LucideIcon> = { general: SlidersHorizontal, network: Globe, fileManager: Folder, runtimeEnvironment: Database, appearance: Palette, shortcuts: Keyboard, sync: Cloud, app: Info };

const TAB_LABELS: Record<string, I18nKey> = { general: '通用', network: '网络', fileManager: '文件管理器', runtimeEnvironment: '运行环境', appearance: '外观', shortcuts: '快捷键', sync: '同步与云', app: '关于' };

const TABS = [
  { id: 'general' },
  { id: 'network' },
  { id: 'fileManager' },
  { id: 'runtimeEnvironment' },
  { id: 'appearance' },
  { id: 'shortcuts' },
  { id: 'sync' },
  { id: 'app' },
];

const DEFAULT_FILE_MANAGER_DOWNLOAD_DIR = '${APP_DIR}\\download';
const AVAILABLE_LANGUAGES = getAvailableLanguages();

function resolveFileManagerDownloadDirPreview(template: string, programDirectory: string) {
  const baseDir = String(programDirectory || '').trim();
  const rawTemplate = String(template || '').trim() || DEFAULT_FILE_MANAGER_DOWNLOAD_DIR;
  const separator = baseDir.includes('\\') ? '\\' : '/';
  const replaced = rawTemplate
    .replace(/\$\{APP_DIR\}/g, baseDir)
    .replace(/%APP_DIR%/g, baseDir)
    .replace(/[\\/]+/g, separator);
  if (!replaced) {
    return '';
  }
  if (/^(?:[A-Za-z]:[\\/]|\\\\|\/)/.test(replaced) || !baseDir) {
    return replaced;
  }
  return `${baseDir}${baseDir.endsWith('\\') || baseDir.endsWith('/') ? '' : separator}${replaced}`;
}

export interface SettingsModalProps {
  onClose: () => void;
  addToast: (message: string | Error, type?: string, duration?: number, actions?: unknown[]) => number;
  onRestored?: () => void;
  probePanelPosition: 'left' | 'right';
  onProbePanelPositionChange: (pos: 'left' | 'right') => void;
  forceDarkTheme?: boolean;
  initialTab?: string;
}

export default function SettingsModal({
  onClose,
  addToast,
  onRestored,
  probePanelPosition,
  onProbePanelPositionChange,
  forceDarkTheme = false,
  initialTab = 'general',
}: SettingsModalProps) {
  const CURRENT_VERSION = APP_VERSION;
  const CURRENT_BUILD_TIME = APP_BUILD_TIME;
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);

  const { checking: checkingUpdate, downloadProgress, checkUpdate, applyUpdate } = useUpdateChecker({
    onResult: (result) => {
      if (result.hasUpdate) {
        setUpdateInfo({
          hasUpdate: true,
          latestVersion: 'v' + result.latestVersion,
          url: result.url,
          filename: result.filename,
          assetReady: result.assetReady,
          reason: result.reason,
        });
        addToast($t('发现新版本: v') + result.latestVersion, 'success');
        return;
      }
      setUpdateInfo(null);
      // 远端 tag 已更新但本平台安装包尚未上传（如 Windows 仍在打包）
      if (result?.reason === 'asset_pending') {
        addToast($t('新版本安装包尚未就绪，请稍后再试'), 'info');
        return;
      }
      addToast($t('当前已是最新版本'), 'info');
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : String(err ?? '');
      addToast($t('检查更新失败: ') + message, 'error');
    },
  });

  const handleCheckUpdate = () => { checkUpdate(); };

  const handleApplyUpdate = () => {
    applyUpdate(updateInfo).catch((err) => {
      addToast($t('更新失败: ') + formatUpdateError(err), 'error');
    });
  };

  const [activeTab, setActiveTab] = useState(initialTab || 'general');
  const [settingsSearchQuery, setSettingsSearchQuery] = useState('');
  const [pendingSettingsScrollTargetId, setPendingSettingsScrollTargetId] = useState('');
  const [supportsWebviewGpuDisable, setSupportsWebviewGpuDisable] = useState(false);

  // Recovery password (for cloud backup restore fallback)
  const [recoveryPasswordEditing, setRecoveryPasswordEditing] = useState(false);
  const [recoveryPasswordInput, setRecoveryPasswordInput] = useState('');
  // 恢复失败时的密码兜底
  const [restoreWithPassword, setRestoreWithPassword] = useState(false);
  const [restorePasswordInput, setRestorePasswordInput] = useState('');

  const handleClose = useCallback(() => {
    setRecoveryPasswordInput('');
    setRecoveryPasswordEditing(false);
    setRestorePasswordInput('');
    setRestoreWithPassword(false);
    onClose();
  }, [onClose]);

  // Sync provider selection
  const [syncProvider, setSyncProvider] = useState('webdav');

  // Network/Ping state
  const [pingEnabled, setPingEnabled] = useState(localStorage.getItem('pingEnabled') !== 'false');
  const [probeInterval, setProbeInterval] = useState(parseInt(localStorage.getItem('probeInterval') || '3', 10));
  const [pingInterval, setPingInterval] = useState(parseInt(localStorage.getItem('pingInterval') || '2', 10));
  const [pingMode, setPingMode] = useState(localStorage.getItem('pingMode') || 'auto');

  const [language, setLanguage] = useState(localStorage.getItem('appLanguage') || 'zh-CN');
  // Shortcuts state
  const defaultShortcuts = {
    copy: 'Ctrl+C',
    paste: 'Ctrl+V',
    pasteSelection: 'Ctrl+Shift+V',
    clear: 'Ctrl+L',
    newTab: 'Ctrl+T',
    find: 'Ctrl+F',
    sigint: 'Ctrl+C',
    eof: 'Ctrl+D',
    suspend: 'Ctrl+Z',
    clearLine: 'Ctrl+U',
  };
  const [shortcuts, setShortcuts] = useState(() => {
    try {
      const saved = localStorage.getItem('appShortcuts');
      return saved ? { ...defaultShortcuts, ...JSON.parse(saved) } : defaultShortcuts;
    } catch {
      return defaultShortcuts;
    }
  });
  const [listeningKey, setListeningKey] = useState<string | null>(null); // 'copy' | 'paste' | 'clear' | 'newTab' | null

  const handleResetShortcuts = () => {
    const defaults = { ...defaultShortcuts };
    setListeningKey(null);
    setShortcuts(defaults);
    localStorage.removeItem('appShortcuts');
    window.dispatchEvent(new CustomEvent('app-shortcuts-changed', { detail: defaults }));
    addToast($t('恢复成功'), 'success');
  };

  // Esc 关闭模态框（仅在未监听快捷键时生效）
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && !listeningKey) {
        if (document.querySelector('[data-global-dialog-active="true"]')) return;
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [listeningKey, handleClose]);

  // 监听并捕捉组合快捷键
  useEffect(() => {
    if (!listeningKey) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setListeningKey(null);
        return;
      }

      e.preventDefault();
      e.stopPropagation();

      if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return;

      // macOS 上主快捷键为 ⌘（getModKey），同时允许物理 ⌃ 录制（两者存为同一 "Ctrl+…"，
      // 运行时信号类快捷键会同时匹配两种组合键）；否则按 ⌃C 会录成无修饰的 "C"，
      // 导致普通字母键也被当作快捷键触发
      const combined = buildCombo(e, e.ctrlKey || getModKey(e));

      const updated = { ...shortcuts, [listeningKey]: combined };
      setShortcuts(updated);
      localStorage.setItem('appShortcuts', JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('app-shortcuts-changed', { detail: updated }));

      addToast($t('终端快捷键已修改为') + ` ${combined}`, 'success');
      setListeningKey(null);
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [listeningKey, addToast]);

  useEffect(() => {
    if (typeof initialTab === 'string' && initialTab.trim()) {
      setActiveTab(initialTab.trim())
    }
  }, [initialTab])

  // settingDefinitions.ts 已类型化，直接使用导出定义
  const settingsSectionTitleMap = useMemo(() => Object.fromEntries(
    SETTINGS_SECTIONS.map((item): [string, string] => [item.id || '', item.titleKey ? $t(item.titleKey) : '']),
  ), [language]);
  const availableSettingsSearchDefinitions = useMemo(() => SETTINGS_SEARCH_DEFINITIONS.filter((item) => {
    if (supportsWebviewGpuDisable) {
      return true;
    }
    return item.id !== 'general.section.rendering' && item.id !== 'general.webview-gpu';
  }), [supportsWebviewGpuDisable]);
  const settingsSearchResults = useMemo(() => {
    const normalizedQuery = String(settingsSearchQuery || '').trim().toLowerCase();
    if (!normalizedQuery) {
      return [];
    }
    const typePriority: Record<string, number> = { action: 0, option: 1, field: 2, 'field-group': 3, section: 4 };
    const deduped = new Map();
    availableSettingsSearchDefinitions.forEach((item) => {
      const title = item.titleKey ? $t(item.titleKey) : '';
      const description = item.descriptionKey ? $t(item.descriptionKey) : '';
      const tabLabel = TAB_LABELS[item.tab] ? $t(TAB_LABELS[item.tab]) : '';
      const sectionLabel = item.section && item.section !== item.id ? (settingsSectionTitleMap[item.section] || '') : '';
      const breadcrumbLabels = Array.isArray(item.breadcrumbTitleKeys)
        ? item.breadcrumbTitleKeys.map((key) => $t(key)).filter(Boolean)
        : [];
      const resolvedBreadcrumbLabels = breadcrumbLabels.length > 0 ? breadcrumbLabels : [tabLabel, sectionLabel].filter(Boolean);
      const searchText = [...resolvedBreadcrumbLabels, title, description].filter(Boolean).join(' ').toLowerCase();
      if (!searchText.includes(normalizedQuery)) {
        return;
      }
      const rank = title.toLowerCase().includes(normalizedQuery) ? 0 : (description.toLowerCase().includes(normalizedQuery) ? 1 : 2);
      const typeRank = Object.prototype.hasOwnProperty.call(typePriority, item.type) ? typePriority[item.type] : 9;
      const dedupeKey = `${title}::${resolvedBreadcrumbLabels.join(' / ')}`;
      const nextResult = {
        ...item,
        title,
        description,
        tabLabel,
        sectionLabel,
        breadcrumbLabels: resolvedBreadcrumbLabels,
        rank,
        typeRank,
      };
      const previous = deduped.get(dedupeKey);
      if (!previous || nextResult.rank < previous.rank || (nextResult.rank === previous.rank && nextResult.typeRank < previous.typeRank)) {
        deduped.set(dedupeKey, nextResult);
      }
    });
    return Array.from(deduped.values()).sort((left, right) => left.rank - right.rank || left.typeRank - right.typeRank || left.breadcrumbLabels.join(' / ').localeCompare(right.breadcrumbLabels.join(' / ')) || left.title.localeCompare(right.title));
  }, [availableSettingsSearchDefinitions, language, settingsSearchQuery, settingsSectionTitleMap]);
  type SettingsSearchResultItem = (typeof settingsSearchResults)[number];
  const handleSelectSettingsSearchResult = useCallback((result: SettingsSearchResultItem) => {
    if (!result) {
      return;
    }
    if (result.tab === 'sync') {
      const nextSyncProvider = result.providerId || '';
      if (PROVIDER_LIST.some((item) => item.id === nextSyncProvider)) {
        setSyncProvider(nextSyncProvider);
      }
    }
    setActiveTab(result.tab);
    setPendingSettingsScrollTargetId(result.targetId ?? '');
  }, []);
  useEffect(() => {
    if (!pendingSettingsScrollTargetId) {
      return undefined;
    }
    const frameId = window.requestAnimationFrame(() => {
      document.querySelectorAll('[data-settings-highlight="true"]').forEach((node) => node.removeAttribute('data-settings-highlight'));
      const target = document.querySelector(`[data-settings-field-id="${pendingSettingsScrollTargetId}"],[data-settings-section-id="${pendingSettingsScrollTargetId}"]`);
      setPendingSettingsScrollTargetId('');
      if (!target) {
        return;
      }
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
      target.setAttribute('data-settings-highlight', 'true');
      window.setTimeout(() => {
        if (target.getAttribute('data-settings-highlight') === 'true') {
          target.removeAttribute('data-settings-highlight');
        }
      }, 1800);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab, pendingSettingsScrollTargetId, syncProvider]);

  const handleLanguageChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = e.target.value;
    setLanguage(lang);
    // 选项值即语言代码，setGlobalLanguage 期待 LanguageCode
    await setGlobalLanguage(lang as LanguageCode);
  };

  const [terminalRightClickPasteOnEmpty, setTerminalRightClickPasteOnEmpty] = useState(localStorage.getItem('terminalRightClickPasteOnEmpty') === 'true');
  const [terminalRightClickPasteMode, setTerminalRightClickPasteMode] = useState(localStorage.getItem('terminalRightClickPasteMode') === 'always' ? 'always' : 'empty');
  const [terminalLeftClickCopyOnSelection, setTerminalLeftClickCopyOnSelection] = useState(localStorage.getItem('terminalLeftClickCopyOnSelection') === 'true');
  const [terminalLeftClickCopyOnSelectionMode, setTerminalLeftClickCopyOnSelectionMode] = useState(localStorage.getItem('terminalLeftClickCopyOnSelectionMode') === 'mouseup' ? 'mouseup' : 'click');
  const [terminalTabDoubleClickActionEnabled, setTerminalTabDoubleClickActionEnabled] = useState(() => {
    const stored = localStorage.getItem('terminalTabDoubleClickActionEnabled');
    if (stored === 'true' || stored === 'false') {
      return stored === 'true';
    }
    return localStorage.getItem('terminalTabDoubleClickDuplicate') === 'true';
  });
  const [terminalTabDoubleClickAction, setTerminalTabDoubleClickAction] = useState(() => {
    const stored = localStorage.getItem('terminalTabDoubleClickAction');
    if (stored === 'close' || stored === 'duplicate') {
      return stored;
    }
    return 'duplicate';
  });

  const handleTerminalRightClickPasteOnEmptyChange = (enabled: boolean) => {
    setTerminalRightClickPasteOnEmpty(enabled);
    localStorage.setItem('terminalRightClickPasteOnEmpty', String(enabled));
    window.dispatchEvent(new CustomEvent('terminal-right-click-paste-on-empty-changed', { detail: enabled }));
  };

  const handleTerminalRightClickPasteModeChange = (mode: string) => {
    const next = mode === 'always' ? 'always' : 'empty';
    setTerminalRightClickPasteMode(next);
    if (next === 'empty') localStorage.removeItem('terminalRightClickPasteMode');
    else localStorage.setItem('terminalRightClickPasteMode', next);
    window.dispatchEvent(new CustomEvent('terminal-right-click-paste-mode-changed', { detail: next }));
  };

  const handleTerminalLeftClickCopyOnSelectionChange = (enabled: boolean) => {
    setTerminalLeftClickCopyOnSelection(enabled);
    localStorage.setItem('terminalLeftClickCopyOnSelection', String(enabled));
    window.dispatchEvent(new CustomEvent('terminal-left-click-copy-on-selection-changed', { detail: enabled }));
  };

  const handleTerminalLeftClickCopyOnSelectionModeChange = (mode: string) => {
    const next = mode === 'mouseup' ? 'mouseup' : 'click';
    setTerminalLeftClickCopyOnSelectionMode(next);
    if (next === 'click') localStorage.removeItem('terminalLeftClickCopyOnSelectionMode');
    else localStorage.setItem('terminalLeftClickCopyOnSelectionMode', next);
    window.dispatchEvent(new CustomEvent('terminal-left-click-copy-on-selection-mode-changed', { detail: next }));
  };

  const handleTerminalTabDoubleClickActionEnabledChange = (enabled: boolean) => {
    setTerminalTabDoubleClickActionEnabled(enabled);
    localStorage.setItem('terminalTabDoubleClickActionEnabled', String(enabled));
  };

  const handleTerminalTabDoubleClickActionChange = (action: string) => {
    const next = action === 'close' ? 'close' : 'duplicate';
    setTerminalTabDoubleClickAction(next);
    localStorage.setItem('terminalTabDoubleClickAction', next);
  };

  // 操作确认开关
  const [confirmCloseSession, setConfirmCloseSession] = useState(localStorage.getItem('skipCloseSessionConfirm') !== 'true');
  const [confirmCloseAll, setConfirmCloseAll] = useState(localStorage.getItem('skipCloseAllConfirm') !== 'true');
  const [confirmFileDelete, setConfirmFileDelete] = useState(localStorage.getItem('skipFileDeleteConfirm') !== 'true');
  const [confirmProcessKill, setConfirmProcessKill] = useState(localStorage.getItem('skipProcessKillConfirm') !== 'true');
  const [confirmTerminalSelectionPaste, setConfirmTerminalSelectionPaste] = useState(localStorage.getItem('skipTerminalSelectionPasteConfirm') !== 'true');
  const [windowCloseAction, setWindowCloseAction] = useState(localStorage.getItem('windowCloseAction') || 'ask');
  const [updateUseProxy, setUpdateUseProxy] = useState(localStorage.getItem('updateUseProxy') === 'true');
  const [rememberWorkspace, setRememberWorkspace] = useState(false);
  const [workspacePersistenceLevel, setWorkspacePersistenceLevel] = useState('program');
  const [webviewGpuDisabled, setWebviewGpuDisabled] = useState(false);
  const [programDirectory, setProgramDirectory] = useState('');
  const [fileManagerCompressedTransfer, setFileManagerCompressedTransfer] = useState(localStorage.getItem('fileManagerCompressedTransfer') !== 'false');
  const [fileManagerAutoOpenTransferQueue, setFileManagerAutoOpenTransferQueue] = useState(localStorage.getItem('fileManagerAutoOpenTransferQueue') !== 'false');
  const [fileManagerShowTabIcons, setFileManagerShowTabIcons] = useState(localStorage.getItem('fileManagerShowTabIcons') !== 'false');
  const [fileManagerHideTabCloseButton, setFileManagerHideTabCloseButton] = useState(localStorage.getItem('fileManagerHideTabCloseButton') === 'true');
  const [fileManagerSharedPinnedTabs, setFileManagerSharedPinnedTabs] = useState(localStorage.getItem('fileManagerSharedPinnedTabs') === 'true');
  const [fileManagerLayoutMode, setFileManagerLayoutMode] = useState(localStorage.getItem('fileManagerLayoutMode') === 'sidebar_dual' ? 'sidebar_dual' : 'classic');
  const [fileManagerDualPaneDragTransferEnabled, setFileManagerDualPaneDragTransferEnabled] = useState(localStorage.getItem('fileManagerDualPaneDragTransferEnabled') !== 'false');
  const [fileManagerDualPaneDragPromptOnDirectory, setFileManagerDualPaneDragPromptOnDirectory] = useState(localStorage.getItem('fileManagerDualPaneDragPromptOnDirectory') !== 'false');
  const [fileManagerDualPaneDragInvertModifier, setFileManagerDualPaneDragInvertModifier] = useState(localStorage.getItem('fileManagerDualPaneDragInvertModifier') === 'true');
  const [fileManagerInitialPathMode, setFileManagerInitialPathMode] = useState(localStorage.getItem('fileManagerInitialPathMode') || 'session_initial_path');
  const [fileManagerNewTabPathMode, setFileManagerNewTabPathMode] = useState(localStorage.getItem('fileManagerNewTabPathMode') || 'inherit_current');
  const [fileManagerAskDownloadEveryTime, setFileManagerAskDownloadEveryTime] = useState(localStorage.getItem('fileManagerAskDownloadEveryTime') === 'true');
  const [fileManagerDownloadConflictStrategy, setFileManagerDownloadConflictStrategy] = useState(localStorage.getItem('fileManagerDownloadConflictStrategy') || 'auto_rename');
  const [fileManagerDownloadConflictDiffBySize, setFileManagerDownloadConflictDiffBySize] = useState(localStorage.getItem('fileManagerDownloadConflictDiffBySize') !== 'false');
  const [fileManagerDownloadConflictDiffByMtime, setFileManagerDownloadConflictDiffByMtime] = useState(localStorage.getItem('fileManagerDownloadConflictDiffByMtime') !== 'false');
  const [fileManagerDownloadRenameSuffixMode, setFileManagerDownloadRenameSuffixMode] = useState(localStorage.getItem('fileManagerDownloadRenameSuffixMode') || 'sequence');
  const [fileManagerDownloadDefaultDir, setFileManagerDownloadDefaultDir] = useState(localStorage.getItem('fileManagerDownloadDefaultDir') || DEFAULT_FILE_MANAGER_DOWNLOAD_DIR);
  const [fileManagerUploadChunkSizeKiB, setFileManagerUploadChunkSizeKiB] = useState(localStorage.getItem('fileManagerUploadChunkSizeKiB') || '256');
  const [fileManagerUploadMaxFiles, setFileManagerUploadMaxFiles] = useState(localStorage.getItem('fileManagerUploadMaxFiles') || '6');
  const [fileManagerUploadMaxChunksPerFile, setFileManagerUploadMaxChunksPerFile] = useState(localStorage.getItem('fileManagerUploadMaxChunksPerFile') || '8');
  const [fileManagerUploadGlobalInflightLimit, setFileManagerUploadGlobalInflightLimit] = useState(localStorage.getItem('fileManagerUploadGlobalInflightLimit') || '24');
  const [transferMaxPacketKiB, setTransferMaxPacketKiB] = useState('128');
  const [transferMaxRequestsPerFile, setTransferMaxRequestsPerFile] = useState('16');
  const [transferConcurrentWrites, setTransferConcurrentWrites] = useState(true);
  const [transferApplyToSharedClient, setTransferApplyToSharedClient] = useState(true);
  const [fileManagerChmodAutoApplyLastSettings, setFileManagerChmodAutoApplyLastSettings] = useState(false);
  const [fileManagerDoubleClickUncompressArchive, setFileManagerDoubleClickUncompressArchive] = useState(false);
  const [fileManagerSmartUncompressConflictStrategy, setFileManagerSmartUncompressConflictStrategy] = useState('auto_rename');
  const [fileManagerAutoRefreshDisabled, setFileManagerAutoRefreshDisabled] = useState(false);
  const [fileManagerMaxEditSizeMB, setFileManagerMaxEditSizeMB] = useState<number | string>(5);
  const [fileManagerDefaultOpenMode, setFileManagerDefaultOpenMode] = useState(() => {
    const mode = localStorage.getItem('fileManagerDefaultOpenMode') || 'builtin';
    return ['builtin', 'system', 'external'].includes(mode) ? mode : 'builtin';
  });
  const [fileManagerPreferredExternalApp, setFileManagerPreferredExternalApp] = useState(
    () => (localStorage.getItem('fileEditorPreferredApp') || '').trim(),
  );
  const [runtimeEnvironmentEnabled, setRuntimeEnvironmentEnabled] = useState(DEFAULT_RUNTIME_ENVIRONMENT_SETTINGS.enabled);
  const [runtimeEnvironmentType, setRuntimeEnvironmentType] = useState<string>(DEFAULT_RUNTIME_ENVIRONMENT_SETTINGS.environmentType);
  const [runtimeEnvironmentTargetPathTemplate, setRuntimeEnvironmentTargetPathTemplate] = useState(DEFAULT_RUNTIME_ENVIRONMENT_SETTINGS.targetPathTemplate);
  const [runtimeEnvironmentModulePath, setRuntimeEnvironmentModulePath] = useState(DEFAULT_RUNTIME_ENVIRONMENT_SETTINGS.modulePath);

  const handleToggleConfirmCloseSession = () => {
    const next = !confirmCloseSession;
    setConfirmCloseSession(next);
    if (next) localStorage.removeItem('skipCloseSessionConfirm');
    else localStorage.setItem('skipCloseSessionConfirm', 'true');
  };
  const handleToggleConfirmCloseAll = () => {
    const next = !confirmCloseAll;
    setConfirmCloseAll(next);
    if (next) localStorage.removeItem('skipCloseAllConfirm');
    else localStorage.setItem('skipCloseAllConfirm', 'true');
  };
  const handleToggleConfirmFileDelete = () => {
    const next = !confirmFileDelete;
    setConfirmFileDelete(next);
    if (next) localStorage.removeItem('skipFileDeleteConfirm');
    else localStorage.setItem('skipFileDeleteConfirm', 'true');
  };
  const handleToggleConfirmProcessKill = () => {
    const next = !confirmProcessKill;
    setConfirmProcessKill(next);
    if (next) localStorage.removeItem('skipProcessKillConfirm');
    else localStorage.setItem('skipProcessKillConfirm', 'true');
  };
  const handleToggleConfirmTerminalSelectionPaste = () => {
    const next = !confirmTerminalSelectionPaste;
    setConfirmTerminalSelectionPaste(next);
    if (next) localStorage.removeItem('skipTerminalSelectionPasteConfirm');
    else localStorage.setItem('skipTerminalSelectionPasteConfirm', 'true');
  };
  const handleWindowCloseActionChange = (value: string) => {
    setWindowCloseAction(value);
    if (value === 'ask') localStorage.removeItem('windowCloseAction');
    else localStorage.setItem('windowCloseAction', value);
  };
  const handleToggleUpdateUseProxy = () => {
    const next = !updateUseProxy;
    setUpdateUseProxy(next);
    if (next) localStorage.setItem('updateUseProxy', 'true');
    else localStorage.removeItem('updateUseProxy');
  };
  const handleToggleRememberWorkspace = async () => {
    const next = !rememberWorkspace;
    setRememberWorkspace(next);
    try {
      await window?.go?.wailsapp?.App?.SetRememberWorkspace?.(next);
      window.dispatchEvent(new CustomEvent('workspace-remember-changed', { detail: next }));
    } catch (err) {
      setRememberWorkspace(!next);
      addToast($t('记忆工作区设置保存失败') + `: ${err}`, 'error');
    }
  };
  const handleWorkspacePersistenceLevelChange = async (value: string) => {
    const next = value === 'session' ? 'session' : 'program';
    const previous = workspacePersistenceLevel;
    setWorkspacePersistenceLevel(next);
    try {
      await window?.go?.wailsapp?.App?.SetWorkspacePersistenceLevel?.(next);
      window.dispatchEvent(new CustomEvent('workspace-persistence-level-changed', { detail: next }));
    } catch (err) {
      setWorkspacePersistenceLevel(previous);
      addToast($t('工作区持久化级别保存失败') + `: ${err}`, 'error');
    }
  };
  const handleToggleWebviewGpuDisabled = async () => {
    const next = !webviewGpuDisabled;
    setWebviewGpuDisabled(next);
    try {
      await window?.go?.wailsapp?.App?.SetWebviewGpuDisabled?.(next);
      addToast($t('设置已保存，重启后生效'), 'success');
    } catch (err) {
      setWebviewGpuDisabled(!next);
      addToast($t('硬件加速设置保存失败') + `: ${err}`, 'error');
    }
  };
  const handleToggleFileManagerCompressedTransfer = () => {
    const next = !fileManagerCompressedTransfer;
    setFileManagerCompressedTransfer(next);
    if (next) localStorage.removeItem('fileManagerCompressedTransfer');
    else localStorage.setItem('fileManagerCompressedTransfer', 'false');
  };
  const handleToggleFileManagerAutoOpenTransferQueue = () => {
    const next = !fileManagerAutoOpenTransferQueue;
    setFileManagerAutoOpenTransferQueue(next);
    if (next) localStorage.removeItem('fileManagerAutoOpenTransferQueue');
    else localStorage.setItem('fileManagerAutoOpenTransferQueue', 'false');
  };
  const handleToggleFileManagerShowTabIcons = () => {
    const next = !fileManagerShowTabIcons;
    setFileManagerShowTabIcons(next);
    if (next) localStorage.removeItem('fileManagerShowTabIcons');
    else localStorage.setItem('fileManagerShowTabIcons', 'false');
    window.dispatchEvent(new CustomEvent('file-manager-show-tab-icons-changed', { detail: next }));
  };
  const handleToggleFileManagerHideTabCloseButton = () => {
    const next = !fileManagerHideTabCloseButton;
    setFileManagerHideTabCloseButton(next);
    if (next) localStorage.setItem('fileManagerHideTabCloseButton', 'true');
    else localStorage.removeItem('fileManagerHideTabCloseButton');
    window.dispatchEvent(new CustomEvent('file-manager-hide-tab-close-button-changed', { detail: next }));
  };
  const handleToggleFileManagerSharedPinnedTabs = () => {
    const next = !fileManagerSharedPinnedTabs;
    setFileManagerSharedPinnedTabs(next);
    if (next) localStorage.setItem('fileManagerSharedPinnedTabs', 'true');
    else localStorage.removeItem('fileManagerSharedPinnedTabs');
    window.dispatchEvent(new CustomEvent('file-manager-shared-pinned-tabs-changed', { detail: next }));
  };
  const handleFileManagerLayoutModeChange = (value: string) => {
    const next = value === 'sidebar_dual' ? 'sidebar_dual' : 'classic';
    setFileManagerLayoutMode(next);
    if (next === 'classic') localStorage.removeItem('fileManagerLayoutMode');
    else localStorage.setItem('fileManagerLayoutMode', next);
    window.dispatchEvent(new CustomEvent('file-manager-layout-mode-changed', { detail: next }));
  };
  const handleToggleFileManagerDualPaneDragTransferEnabled = () => {
    const next = !fileManagerDualPaneDragTransferEnabled;
    setFileManagerDualPaneDragTransferEnabled(next);
    if (next) localStorage.removeItem('fileManagerDualPaneDragTransferEnabled');
    else localStorage.setItem('fileManagerDualPaneDragTransferEnabled', 'false');
    window.dispatchEvent(new CustomEvent('file-manager-dual-pane-drag-transfer-enabled-changed', { detail: next }));
  };
  const handleToggleFileManagerDualPaneDragPromptOnDirectory = () => {
    const next = !fileManagerDualPaneDragPromptOnDirectory;
    setFileManagerDualPaneDragPromptOnDirectory(next);
    if (next) localStorage.removeItem('fileManagerDualPaneDragPromptOnDirectory');
    else localStorage.setItem('fileManagerDualPaneDragPromptOnDirectory', 'false');
    window.dispatchEvent(new CustomEvent('file-manager-dual-pane-drag-prompt-on-directory-changed', { detail: next }));
  };
  const handleToggleFileManagerDualPaneDragInvertModifier = () => {
    const next = !fileManagerDualPaneDragInvertModifier;
    setFileManagerDualPaneDragInvertModifier(next);
    if (next) localStorage.setItem('fileManagerDualPaneDragInvertModifier', 'true');
    else localStorage.removeItem('fileManagerDualPaneDragInvertModifier');
    window.dispatchEvent(new CustomEvent('file-manager-dual-pane-drag-invert-modifier-changed', { detail: next }));
  };
  const handleFileManagerInitialPathModeChange = (value: string) => {
    setFileManagerInitialPathMode(value);
    localStorage.setItem('fileManagerInitialPathMode', value);
  };
  const handleFileManagerNewTabPathModeChange = (value: string) => {
    setFileManagerNewTabPathMode(value);
    localStorage.setItem('fileManagerNewTabPathMode', value);
  };
  const handleToggleFileManagerAskDownloadEveryTime = () => {
    const next = !fileManagerAskDownloadEveryTime;
    setFileManagerAskDownloadEveryTime(next);
    if (next) localStorage.setItem('fileManagerAskDownloadEveryTime', 'true');
    else localStorage.removeItem('fileManagerAskDownloadEveryTime');
  };
  const handleFileManagerDownloadConflictStrategyChange = (value: string) => {
    setFileManagerDownloadConflictStrategy(value);
    localStorage.setItem('fileManagerDownloadConflictStrategy', value);
  };
  const handleToggleFileManagerDownloadConflictDiffBySize = () => {
    const next = !fileManagerDownloadConflictDiffBySize;
    if (!next && !fileManagerDownloadConflictDiffByMtime) return;
    setFileManagerDownloadConflictDiffBySize(next);
    if (next) localStorage.removeItem('fileManagerDownloadConflictDiffBySize');
    else localStorage.setItem('fileManagerDownloadConflictDiffBySize', 'false');
  };
  const handleToggleFileManagerDownloadConflictDiffByMtime = () => {
    const next = !fileManagerDownloadConflictDiffByMtime;
    if (!next && !fileManagerDownloadConflictDiffBySize) return;
    setFileManagerDownloadConflictDiffByMtime(next);
    if (next) localStorage.removeItem('fileManagerDownloadConflictDiffByMtime');
    else localStorage.setItem('fileManagerDownloadConflictDiffByMtime', 'false');
  };
  const handleFileManagerDownloadRenameSuffixModeChange = (value: string) => {
    setFileManagerDownloadRenameSuffixMode(value);
    localStorage.setItem('fileManagerDownloadRenameSuffixMode', value);
  };
  const handleFileManagerUploadSettingChange = (key: string, setter: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setter(next);
    if (next === '') localStorage.removeItem(key);
    else localStorage.setItem(key, next);
  };
  const persistTransferTuning = (overrides: Record<string, number | boolean> = {}) => {
    const next = {
      maxPacketKiB: parseInt(transferMaxPacketKiB, 10) || 128,
      maxRequestsPerFile: parseInt(transferMaxRequestsPerFile, 10) || 16,
      concurrentWrites: transferConcurrentWrites,
      applyToSharedClient: transferApplyToSharedClient,
      ...overrides,
    };
    AppGo.SaveTransferTuningSettings(
      next.maxPacketKiB,
      next.maxRequestsPerFile,
      next.concurrentWrites,
      next.applyToSharedClient,
    ).catch(() => {});
  };
  const handleTransferNumberChange = (setter: (v: string) => void, field: 'maxPacketKiB' | 'maxRequestsPerFile') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    setter(next);
    const parsed = parseInt(next, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      persistTransferTuning({ [field]: parsed });
    }
  };
  const handleToggleTransferConcurrentWrites = () => {
    const next = !transferConcurrentWrites;
    setTransferConcurrentWrites(next);
    persistTransferTuning({ concurrentWrites: next });
  };
  const handleToggleTransferApplyToSharedClient = () => {
    const next = !transferApplyToSharedClient;
    setTransferApplyToSharedClient(next);
    persistTransferTuning({ applyToSharedClient: next });
  };
  const handleFileManagerDefaultOpenModeChange = (value: string) => {
    const mode = ['builtin', 'system', 'external'].includes(value) ? value : 'builtin';
    setFileManagerDefaultOpenMode(mode);
    if (mode === 'builtin') localStorage.removeItem('fileManagerDefaultOpenMode');
    else localStorage.setItem('fileManagerDefaultOpenMode', mode);
    window.dispatchEvent(new CustomEvent('file-manager-default-open-mode-changed', { detail: mode }));
  };
  const handlePickFileManagerPreferredExternalApp = async () => {
    try {
      const editorPath = await AppGo.SelectExternalEditor();
      if (!editorPath) return;
      const cleaned = String(editorPath || '').trim();
      if (!cleaned) return;
      localStorage.setItem('fileEditorPreferredApp', cleaned);
      setFileManagerPreferredExternalApp(cleaned);
      window.dispatchEvent(new CustomEvent('file-editor-preferred-app-changed', { detail: cleaned }));
    } catch (err) {
      console.error(err);
    }
  };
  const handleClearFileManagerPreferredExternalApp = () => {
    localStorage.removeItem('fileEditorPreferredApp');
    setFileManagerPreferredExternalApp('');
    window.dispatchEvent(new CustomEvent('file-editor-preferred-app-changed', { detail: '' }));
  };
  const handleToggleFileManagerChmodAutoApplyLastSettings = async () => {
    const next = !fileManagerChmodAutoApplyLastSettings;
    setFileManagerChmodAutoApplyLastSettings(next);
    try {
      const setter = window?.go?.wailsapp?.App?.SetChmodAutoApplyLastSettings;
      if (typeof setter !== 'function') {
        throw new Error($t('应用不可用'));
      }
      await setter(next);
    } catch (err) {
      setFileManagerChmodAutoApplyLastSettings(!next);
      addToast($t('请求失败') + `: ${err}`, 'error');
    }
  };
  const handleToggleFileManagerDoubleClickUncompressArchive = async () => {
    const next = !fileManagerDoubleClickUncompressArchive;
    setFileManagerDoubleClickUncompressArchive(next);
    try {
      const setter = window?.go?.wailsapp?.App?.SetFileManagerDoubleClickUncompressArchive;
      if (typeof setter !== 'function') {
        throw new Error($t('应用不可用'));
      }
      await setter(next);
      window.dispatchEvent(new CustomEvent('file-manager-double-click-uncompress-archive-changed', { detail: next }));
    } catch (err) {
      setFileManagerDoubleClickUncompressArchive(!next);
      addToast($t('请求失败') + `: ${err}`, 'error');
    }
  };
  const handleToggleFileManagerAutoRefreshDisabled = async () => {
    const next = !fileManagerAutoRefreshDisabled;
    setFileManagerAutoRefreshDisabled(next);
    try {
      const setter = window?.go?.wailsapp?.App?.SetFileManagerAutoRefreshDisabled;
      if (typeof setter !== 'function') {
        throw new Error($t('应用不可用'));
      }
      await setter(next);
      window.dispatchEvent(new CustomEvent('file-manager-auto-refresh-disabled-changed', { detail: next }));
    } catch (err) {
      setFileManagerAutoRefreshDisabled(!next);
      addToast($t('请求失败') + `: ${err}`, 'error');
    }
  };
  const handleFileManagerMaxEditSizeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    // 用 Number 而非 parseInt：避免 "12abc" 被解析为 12 而误持久化
    const next = Number(raw);
    // 非法值（空/非数字/越界）只更新 UI 态，不持久化
    if (!Number.isFinite(next) || next < 1 || next > 50) {
      setFileManagerMaxEditSizeMB(raw);
      addToast($t('文件编辑大小上限范围为 1-50 MB'), 'warning');
      return;
    }
    const previous = fileManagerMaxEditSizeMB;
    setFileManagerMaxEditSizeMB(next);
    try {
      const setter = window?.go?.wailsapp?.App?.SetFileManagerMaxEditSize;
      if (typeof setter !== 'function') {
        throw new Error($t('应用不可用'));
      }
      await setter(next);
      window.dispatchEvent(new CustomEvent('file-manager-max-edit-size-changed', { detail: next }));
    } catch (err) {
      setFileManagerMaxEditSizeMB(previous);
      addToast($t('请求失败') + `: ${err}`, 'error');
    }
  };
  const handleFileManagerSmartUncompressConflictStrategyChange = async (value: string) => {
    const next = value === 'overwrite' || value === 'prompt' ? value : 'auto_rename';
    const previous = fileManagerSmartUncompressConflictStrategy;
    setFileManagerSmartUncompressConflictStrategy(next);
    try {
      const setter = window?.go?.wailsapp?.App?.SetFileManagerSmartUncompressConflictStrategy;
      if (typeof setter !== 'function') {
        throw new Error($t('应用不可用'));
      }
      await setter(next);
      window.dispatchEvent(new CustomEvent('file-manager-smart-uncompress-conflict-strategy-changed', { detail: next }));
    } catch (err) {
      setFileManagerSmartUncompressConflictStrategy(previous);
      addToast($t('请求失败') + `: ${err}`, 'error');
    }
  };
  const handleToggleRuntimeEnvironmentEnabled = async () => {
    const next = !runtimeEnvironmentEnabled;
    setRuntimeEnvironmentEnabled(next);
    try {
      const saved = await saveRuntimeEnvironmentSettings({
        enabled: next,
        environmentType: runtimeEnvironmentType,
        targetPathTemplate: runtimeEnvironmentTargetPathTemplate,
        modulePath: runtimeEnvironmentModulePath,
      });
      setRuntimeEnvironmentEnabled(saved.enabled);
      setRuntimeEnvironmentType(saved.environmentType);
      setRuntimeEnvironmentTargetPathTemplate(saved.targetPathTemplate);
      setRuntimeEnvironmentModulePath(saved.modulePath);
    } catch (err) {
      setRuntimeEnvironmentEnabled(!next);
      addToast($t('运行环境设置保存失败') + `: ${err}`, 'error');
    }
  };
  const handleRuntimeEnvironmentTypeChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const next = e.target.value;
    setRuntimeEnvironmentType(next);
    try {
      const saved = await saveRuntimeEnvironmentSettings({
        enabled: runtimeEnvironmentEnabled,
        environmentType: next,
        targetPathTemplate: runtimeEnvironmentTargetPathTemplate,
        modulePath: runtimeEnvironmentModulePath,
      });
      setRuntimeEnvironmentEnabled(saved.enabled);
      setRuntimeEnvironmentType(saved.environmentType);
      setRuntimeEnvironmentTargetPathTemplate(saved.targetPathTemplate);
      setRuntimeEnvironmentModulePath(saved.modulePath);
    } catch (err) {
      addToast($t('运行环境设置保存失败') + `: ${err}`, 'error');
    }
  };
  const handleRuntimeEnvironmentTargetPathTemplateChange = async (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const next = e.target.value;
    setRuntimeEnvironmentTargetPathTemplate(next);
    try {
      const saved = await saveRuntimeEnvironmentSettings({
        enabled: runtimeEnvironmentEnabled,
        environmentType: runtimeEnvironmentType,
        targetPathTemplate: next,
        modulePath: runtimeEnvironmentModulePath,
      });
      setRuntimeEnvironmentEnabled(saved.enabled);
      setRuntimeEnvironmentType(saved.environmentType);
      setRuntimeEnvironmentTargetPathTemplate(saved.targetPathTemplate);
      setRuntimeEnvironmentModulePath(saved.modulePath);
    } catch (err) {
      addToast($t('运行环境设置保存失败') + `: ${err}`, 'error');
    }
  };

  useEffect(() => {
    let cancelled = false;

    Promise.resolve(window?.go?.wailsapp?.App?.GetProgramDirectory?.())
      .then((dir) => {
        if (!cancelled && dir) setProgramDirectory(dir);
      })
      .catch(() => {});

    Promise.resolve(window?.go?.wailsapp?.App?.GetRememberWorkspace?.())
      .then((enabled) => {
        if (!cancelled && typeof enabled === 'boolean') setRememberWorkspace(enabled);
      })
      .catch(() => {});
    Promise.resolve(window?.go?.wailsapp?.App?.GetWorkspacePersistenceLevel?.())
      .then((level) => {
        if (!cancelled && typeof level === 'string') setWorkspacePersistenceLevel(level === 'session' ? 'session' : 'program');
      })
      .catch(() => {});

    Promise.resolve(window?.go?.wailsapp?.App?.SupportsWebviewGpuDisable?.())
      .then((supported) => {
        if (cancelled || supported !== true) return;
        setSupportsWebviewGpuDisable(true);
        Promise.resolve(window?.go?.wailsapp?.App?.GetWebviewGpuDisabled?.())
          .then((enabled) => {
            if (!cancelled && typeof enabled === 'boolean') setWebviewGpuDisabled(enabled);
          })
          .catch(() => {});
      })
      .catch(() => {});

    getRuntimeEnvironmentSettings()
      .then((settings) => {
        if (cancelled || !settings) return;
        setRuntimeEnvironmentEnabled(Boolean(settings.enabled));
        setRuntimeEnvironmentType(settings.environmentType || DEFAULT_RUNTIME_ENVIRONMENT_SETTINGS.environmentType);
        setRuntimeEnvironmentTargetPathTemplate(settings.targetPathTemplate || DEFAULT_RUNTIME_ENVIRONMENT_SETTINGS.targetPathTemplate);
        setRuntimeEnvironmentModulePath(settings.modulePath || DEFAULT_RUNTIME_ENVIRONMENT_SETTINGS.modulePath);
      })
      .catch(() => {});

    AppGo.GetChmodDialogSettings()
      .then((settings) => {
        if (cancelled || !settings) return;
        setFileManagerChmodAutoApplyLastSettings(settings.autoApplyLastSettings === true);
      })
      .catch(() => {});

    Promise.resolve(window?.go?.wailsapp?.App?.GetFileManagerSettings?.())
      .then((settings) => {
        if (cancelled || !settings) return;
        setFileManagerDoubleClickUncompressArchive(settings.doubleClickUncompressArchive === true);
        setFileManagerSmartUncompressConflictStrategy(
          settings.smartUncompressConflictStrategy === 'overwrite' || settings.smartUncompressConflictStrategy === 'prompt'
            ? settings.smartUncompressConflictStrategy
            : 'auto_rename'
        );
        setFileManagerAutoRefreshDisabled(settings.autoRefreshDisabled === true);
        if (Number.isFinite(Number(settings.maxEditSizeMB)) && Number(settings.maxEditSizeMB) >= 1) {
          setFileManagerMaxEditSizeMB(Number(settings.maxEditSizeMB));
        }
        if (Number.isFinite(Number(settings.transferMaxPacketKiB)) && Number(settings.transferMaxPacketKiB) > 0) {
          setTransferMaxPacketKiB(String(settings.transferMaxPacketKiB));
        }
        if (Number.isFinite(Number(settings.transferMaxRequestsPerFile)) && Number(settings.transferMaxRequestsPerFile) > 0) {
          setTransferMaxRequestsPerFile(String(settings.transferMaxRequestsPerFile));
        }
        setTransferConcurrentWrites(settings.transferConcurrentWrites !== false);
        setTransferApplyToSharedClient(settings.transferApplyToSharedClient !== false);
      })
      .catch(() => {});

    return () => { cancelled = true; };
  }, []);

  // ── Tab prop wrappers ──
  const handleTogglePingEnabled = () => {
    const next = !pingEnabled;
    setPingEnabled(next);
    localStorage.setItem('pingEnabled', String(next));
    window.dispatchEvent(new Event('pingEnabledChanged'));
  };
  const handleProbeIntervalChange = (s: number) => { setProbeInterval(s); localStorage.setItem('probeInterval', String(s)); window.dispatchEvent(new Event('probeIntervalChanged')); };
  const handlePingIntervalChange = (s: number) => {
    // Banner 模式半开 SSH 成本更高：不允许低于 15s，避免短时间多次登录失败类告警。
    const next = pingMode === 'banner' ? Math.max(15, Number(s) || 15) : s;
    setPingInterval(next);
    localStorage.setItem('pingInterval', String(next));
    window.dispatchEvent(new Event('pingIntervalChanged'));
  };
  const handlePingModeChange = (mode: string) => {
    setPingMode(mode);
    localStorage.setItem('pingMode', mode);
    window.dispatchEvent(new Event('pingModeChanged'));
    // 用户选择强制 Banner 时，自动把延迟检测间隔抬到至少 15s。
    if (mode === 'banner') {
      const current = parseInt(localStorage.getItem('pingInterval') || String(pingInterval) || '2', 10);
      if (!Number.isFinite(current) || current < 15) {
        const next = 15;
        setPingInterval(next);
        localStorage.setItem('pingInterval', String(next));
        window.dispatchEvent(new Event('pingIntervalChanged'));
      }
    }
  };


  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/[0.42] animate-[fadeIn_0.12s_ease]"
      style={{ zIndex: Z.SETTINGS }}
    >
      <div className="relative w-full max-w-[1100px] max-h-[90vh] overflow-y-auto bg-raised border border-line rounded-md shadow-lg animate-[slideUp_0.12s_ease] flex flex-col h-[80vh]">

        {/* Settings Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-line-subtle">
          <div className="text-md font-semibold text-primary">{$t('设置')}</div>
          <Button variant="ghost" size="icon" onClick={handleClose}><X size={16} /></Button>
        </div>

        {/* Settings Body Layout */}
        <div className="flex flex-1 overflow-hidden">

          {/* Settings Sidebar */}
          <div className="settings-sidebar">
            <div className="px-1 pb-2">
              <div className="relative">
                <input
                  id="settings-modal-search"
                  name="settings-modal-search"
                  autoComplete="off"
                  className="input w-full h-[30px] text-sm"
                  value={settingsSearchQuery}
                  onChange={(event) => setSettingsSearchQuery(event.target.value)}
                  placeholder={$t('搜索...')}
                  style={{ paddingRight: settingsSearchQuery ? 34 : 12 }}
                />
                {settingsSearchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSettingsSearchQuery('')}
                    className="absolute top-1/2 -translate-y-1/2 right-[7px] w-4 h-4 p-0 m-0 border-none bg-transparent text-tertiary inline-flex items-center justify-center cursor-pointer shadow-none"
                  >
                    <X size={12} />
                  </button>
                ) : null}
              </div>
            </div>
            {settingsSearchQuery.trim() ? (
              <div className="flex flex-col gap-1.5 overflow-y-auto px-1 pb-1">
                <div className="px-1.5 text-xs text-tertiary">{$t('搜索结果')} · {settingsSearchResults.length}</div>
                {settingsSearchResults.length > 0 ? settingsSearchResults.map((result) => (
                  <button
                    type="button"
                    key={`${result.id}:${result.targetId}`}
                    onClick={() => handleSelectSettingsSearchResult(result)}
                    className={cn(
                      'flex flex-col gap-1 w-full py-[9px] px-2.5 rounded-sm border border-line text-secondary cursor-pointer text-left',
                      result.tab === activeTab ? 'bg-overlay' : 'bg-raised',
                    )}
                  >
                    <div className="text-sm font-semibold text-primary leading-[1.4]">{result.title}</div>
                    {result.description ? <div className="text-xs text-tertiary leading-[1.5]">{result.description}</div> : null}
                    <div className="text-[10px] text-tertiary leading-[1.5]">{result.breadcrumbLabels.length > 0 ? result.breadcrumbLabels.join(' / ') : result.tabLabel}</div>
                  </button>
                )) : (
                  <div className="py-2.5 px-3 rounded-sm border border-dashed border-line bg-raised">
                    <div className="text-sm font-semibold text-primary">{$t('未找到结果')}</div>
                    <div className="mt-1 text-xs text-tertiary">{$t('尝试其他关键词')}</div>
                  </div>
                )}
              </div>
            ) : TABS.map(tab => (
              <div
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'flex items-center gap-2 py-[7px] px-2.5 rounded-sm cursor-pointer text-base transition-colors duration-[120ms]',
                  activeTab === tab.id ? 'bg-overlay text-primary font-semibold' : 'text-secondary',
                )}
              >
                <span className="inline-flex items-center">{(() => { const IC = TAB_ICON[tab.id]; return IC ? <IC size={15} /> : null; })()}</span> {$t(TAB_LABELS[tab.id])}
              </div>
            ))}
          </div>

          {/* Settings Content */}
          {/* 原 <style> 注入的 [data-settings-highlight] 高亮规则，改为作用域工具类（仅搜索跳转目标会带该属性，均在本面板内） */}
          <div
            className="settings-content-pane
              [&_[data-settings-highlight=true]]:outline [&_[data-settings-highlight=true]]:outline-2 [&_[data-settings-highlight=true]]:outline-accent [&_[data-settings-highlight=true]]:shadow-[0_0_0_3px_rgba(var(--accent-rgb),0.18)] [&_[data-settings-highlight=true]]:rounded-md"
          >
            
            {activeTab === 'app' && (
              <AppTab
                CURRENT_VERSION={CURRENT_VERSION}
                BUILD_TIME={CURRENT_BUILD_TIME}
                updateInfo={updateInfo}
                checkingUpdate={checkingUpdate}
                downloadProgress={downloadProgress}
                onCheckUpdate={handleCheckUpdate}
                onApplyUpdate={handleApplyUpdate}
              />
            )}

            {activeTab === 'general' && (
              <GeneralTab
                language={language}
                onLanguageChange={handleLanguageChange}
                availableLanguages={AVAILABLE_LANGUAGES}
                confirmCloseSession={confirmCloseSession}
                onToggleConfirmCloseSession={handleToggleConfirmCloseSession}
                confirmCloseAll={confirmCloseAll}
                onToggleConfirmCloseAll={handleToggleConfirmCloseAll}
                confirmFileDelete={confirmFileDelete}
                onToggleConfirmFileDelete={handleToggleConfirmFileDelete}
                confirmProcessKill={confirmProcessKill}
                onToggleConfirmProcessKill={handleToggleConfirmProcessKill}
                confirmTerminalSelectionPaste={confirmTerminalSelectionPaste}
                onToggleConfirmTerminalSelectionPaste={handleToggleConfirmTerminalSelectionPaste}
                windowCloseAction={windowCloseAction}
                onWindowCloseActionChange={handleWindowCloseActionChange}
                updateUseProxy={updateUseProxy}
                onToggleUpdateUseProxy={handleToggleUpdateUseProxy}
                rememberWorkspace={rememberWorkspace}
                onToggleRememberWorkspace={handleToggleRememberWorkspace}
                workspacePersistenceLevel={workspacePersistenceLevel}
                onWorkspacePersistenceLevelChange={handleWorkspacePersistenceLevelChange}
                supportsWebviewGpuDisable={supportsWebviewGpuDisable}
                webviewGpuDisabled={webviewGpuDisabled}
                onToggleWebviewGpuDisabled={handleToggleWebviewGpuDisabled}
                terminalRightClickPasteOnEmpty={terminalRightClickPasteOnEmpty}
                onTerminalRightClickPasteOnEmptyChange={handleTerminalRightClickPasteOnEmptyChange}
                terminalRightClickPasteMode={terminalRightClickPasteMode}
                onTerminalRightClickPasteModeChange={handleTerminalRightClickPasteModeChange}
                terminalLeftClickCopyOnSelection={terminalLeftClickCopyOnSelection}
                onTerminalLeftClickCopyOnSelectionChange={handleTerminalLeftClickCopyOnSelectionChange}
                terminalLeftClickCopyOnSelectionMode={terminalLeftClickCopyOnSelectionMode}
                onTerminalLeftClickCopyOnSelectionModeChange={handleTerminalLeftClickCopyOnSelectionModeChange}
                terminalTabDoubleClickActionEnabled={terminalTabDoubleClickActionEnabled}
                onTerminalTabDoubleClickActionEnabledChange={handleTerminalTabDoubleClickActionEnabledChange}
                terminalTabDoubleClickAction={terminalTabDoubleClickAction}
                onTerminalTabDoubleClickActionChange={handleTerminalTabDoubleClickActionChange}
              />
            )}

            {activeTab === 'network' && (
              <NetworkTab
                pingEnabled={pingEnabled}
                onTogglePingEnabled={handleTogglePingEnabled}
                pingMode={pingMode}
                onPingModeChange={handlePingModeChange}
                probeInterval={probeInterval}
                onProbeIntervalChange={handleProbeIntervalChange}
                pingInterval={pingInterval}
                onPingIntervalChange={handlePingIntervalChange}
              />
            )}

            {activeTab === 'fileManager' && (
              <FileManagerTab
                fileManagerCompressedTransfer={fileManagerCompressedTransfer}
                onToggleFileManagerCompressedTransfer={handleToggleFileManagerCompressedTransfer}
                fileManagerAutoOpenTransferQueue={fileManagerAutoOpenTransferQueue}
                onToggleFileManagerAutoOpenTransferQueue={handleToggleFileManagerAutoOpenTransferQueue}
                fileManagerShowTabIcons={fileManagerShowTabIcons}
                onToggleFileManagerShowTabIcons={handleToggleFileManagerShowTabIcons}
                fileManagerHideTabCloseButton={fileManagerHideTabCloseButton}
                onToggleFileManagerHideTabCloseButton={handleToggleFileManagerHideTabCloseButton}
                fileManagerSharedPinnedTabs={fileManagerSharedPinnedTabs}
                onToggleFileManagerSharedPinnedTabs={handleToggleFileManagerSharedPinnedTabs}
                fileManagerLayoutMode={fileManagerLayoutMode}
                onFileManagerLayoutModeChange={handleFileManagerLayoutModeChange}
                fileManagerDualPaneDragTransferEnabled={fileManagerDualPaneDragTransferEnabled}
                onToggleFileManagerDualPaneDragTransferEnabled={handleToggleFileManagerDualPaneDragTransferEnabled}
                fileManagerDualPaneDragPromptOnDirectory={fileManagerDualPaneDragPromptOnDirectory}
                onToggleFileManagerDualPaneDragPromptOnDirectory={handleToggleFileManagerDualPaneDragPromptOnDirectory}
                fileManagerDualPaneDragInvertModifier={fileManagerDualPaneDragInvertModifier}
                onToggleFileManagerDualPaneDragInvertModifier={handleToggleFileManagerDualPaneDragInvertModifier}
                fileManagerChmodAutoApplyLastSettings={fileManagerChmodAutoApplyLastSettings}
                onToggleFileManagerChmodAutoApplyLastSettings={handleToggleFileManagerChmodAutoApplyLastSettings}
                fileManagerDoubleClickUncompressArchive={fileManagerDoubleClickUncompressArchive}
                onToggleFileManagerDoubleClickUncompressArchive={handleToggleFileManagerDoubleClickUncompressArchive}
                fileManagerSmartUncompressConflictStrategy={fileManagerSmartUncompressConflictStrategy}
                onFileManagerSmartUncompressConflictStrategyChange={handleFileManagerSmartUncompressConflictStrategyChange}
                fileManagerAutoRefreshDisabled={fileManagerAutoRefreshDisabled}
                onToggleFileManagerAutoRefreshDisabled={handleToggleFileManagerAutoRefreshDisabled}
                fileManagerMaxEditSizeMB={Number(fileManagerMaxEditSizeMB)}
                onFileManagerMaxEditSizeChange={handleFileManagerMaxEditSizeChange}
                fileManagerDefaultOpenMode={fileManagerDefaultOpenMode}
                onFileManagerDefaultOpenModeChange={handleFileManagerDefaultOpenModeChange}
                fileManagerPreferredExternalApp={fileManagerPreferredExternalApp}
                onPickFileManagerPreferredExternalApp={() => { void handlePickFileManagerPreferredExternalApp(); }}
                onClearFileManagerPreferredExternalApp={handleClearFileManagerPreferredExternalApp}
                fileManagerInitialPathMode={fileManagerInitialPathMode}
                onFileManagerInitialPathModeChange={handleFileManagerInitialPathModeChange}
                fileManagerNewTabPathMode={fileManagerNewTabPathMode}
                onFileManagerNewTabPathModeChange={handleFileManagerNewTabPathModeChange}
                fileManagerAskDownloadEveryTime={fileManagerAskDownloadEveryTime}
                onToggleFileManagerAskDownloadEveryTime={handleToggleFileManagerAskDownloadEveryTime}
                fileManagerDownloadConflictStrategy={fileManagerDownloadConflictStrategy}
                onFileManagerDownloadConflictStrategyChange={handleFileManagerDownloadConflictStrategyChange}
                fileManagerDownloadConflictDiffBySize={fileManagerDownloadConflictDiffBySize}
                onToggleFileManagerDownloadConflictDiffBySize={handleToggleFileManagerDownloadConflictDiffBySize}
                fileManagerDownloadConflictDiffByMtime={fileManagerDownloadConflictDiffByMtime}
                onToggleFileManagerDownloadConflictDiffByMtime={handleToggleFileManagerDownloadConflictDiffByMtime}
                fileManagerDownloadRenameSuffixMode={fileManagerDownloadRenameSuffixMode}
                onFileManagerDownloadRenameSuffixModeChange={handleFileManagerDownloadRenameSuffixModeChange}
                fileManagerDownloadDefaultDir={fileManagerDownloadDefaultDir}
                onFileManagerDownloadDefaultDirChange={handleFileManagerUploadSettingChange('fileManagerDownloadDefaultDir', setFileManagerDownloadDefaultDir)}
                fileManagerDownloadDefaultDirPreview={resolveFileManagerDownloadDirPreview(fileManagerDownloadDefaultDir, programDirectory)}
                fileManagerUploadChunkSizeKiB={Number(fileManagerUploadChunkSizeKiB)}
                onFileManagerUploadChunkSizeKiBChange={handleFileManagerUploadSettingChange('fileManagerUploadChunkSizeKiB', setFileManagerUploadChunkSizeKiB)}
                fileManagerUploadMaxFiles={Number(fileManagerUploadMaxFiles)}
                onFileManagerUploadMaxFilesChange={handleFileManagerUploadSettingChange('fileManagerUploadMaxFiles', setFileManagerUploadMaxFiles)}
                fileManagerUploadMaxChunksPerFile={Number(fileManagerUploadMaxChunksPerFile)}
                onFileManagerUploadMaxChunksPerFileChange={handleFileManagerUploadSettingChange('fileManagerUploadMaxChunksPerFile', setFileManagerUploadMaxChunksPerFile)}
                fileManagerUploadGlobalInflightLimit={Number(fileManagerUploadGlobalInflightLimit)}
                onFileManagerUploadGlobalInflightLimitChange={handleFileManagerUploadSettingChange('fileManagerUploadGlobalInflightLimit', setFileManagerUploadGlobalInflightLimit)}
                transferMaxPacketKiB={Number(transferMaxPacketKiB)}
                onTransferMaxPacketKiBChange={handleTransferNumberChange(setTransferMaxPacketKiB, 'maxPacketKiB')}
                transferMaxRequestsPerFile={Number(transferMaxRequestsPerFile)}
                onTransferMaxRequestsPerFileChange={handleTransferNumberChange(setTransferMaxRequestsPerFile, 'maxRequestsPerFile')}
                transferConcurrentWrites={transferConcurrentWrites}
                onToggleTransferConcurrentWrites={handleToggleTransferConcurrentWrites}
                transferApplyToSharedClient={transferApplyToSharedClient}
                onToggleTransferApplyToSharedClient={handleToggleTransferApplyToSharedClient}
              />
            )}
            {activeTab === 'runtimeEnvironment' && (
              <RuntimeEnvironmentTab />
            )}
            <AppearanceTabPane
              activeTab={activeTab}
              addToast={addToast}
              forceDarkTheme={forceDarkTheme}
              handleClose={handleClose}
              probePanelPosition={probePanelPosition}
              onProbePanelPositionChange={onProbePanelPositionChange}
            />

            {activeTab === 'shortcuts' && (
              <ShortcutsTab
                shortcuts={shortcuts}
                listeningKey={listeningKey}
                onSetListeningKey={setListeningKey}
                onResetShortcuts={handleResetShortcuts}
              />
            )}

            <SyncTabPane
              activeTab={activeTab}
              addToast={addToast}
              onRestored={onRestored}
              syncProvider={syncProvider}
              setSyncProvider={setSyncProvider}
              recoveryPasswordEditing={recoveryPasswordEditing}
              setRecoveryPasswordEditing={setRecoveryPasswordEditing}
              recoveryPasswordInput={recoveryPasswordInput}
              setRecoveryPasswordInput={setRecoveryPasswordInput}
              restoreWithPassword={restoreWithPassword}
              setRestoreWithPassword={setRestoreWithPassword}
              restorePasswordInput={restorePasswordInput}
              setRestorePasswordInput={setRestorePasswordInput}
            />

          </div>
        </div>

      </div>
    </div>
  );
}


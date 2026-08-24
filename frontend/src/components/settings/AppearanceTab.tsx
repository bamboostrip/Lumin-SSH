import React, { useMemo } from 'react';
import { t as $t, type I18nKey } from '../../i18n.ts';
import { Sun, Monitor, Moon, Trash2, Copy } from 'lucide-react';
import { cn } from '../../utils/cn.ts';
import { Button } from '../ui';
import { SettingRow, SettingsDivider, SettingsPanel, SettingsSectionTitle, SettingsTabRoot, ToggleSwitch, type SettingsDefinitionNode } from './SharedComponents';
import { settings } from './settingDefinitions';
import KeywordRulesPanel from './KeywordRulesPanel.tsx';
import { type KeywordRule } from '../../utils/terminalKeywordHighlight.ts';
import type { ThemePackage, ThemePackagePreview } from '../../utils/theme.ts';

/** 程序字体条目 */
interface ProgramFont {
  fileName: string;
  displayName?: string;
}

/** 主题包设置（SettingsModal 传入的宽松形状） */
interface ThemePackageSettings {
  lightThemePackageId?: string;
  darkThemePackageId?: string;
  [key: string]: unknown;
}

export interface AppearanceTabProps {
  programFonts: ProgramFont[];
  programFontSearchQuery: string;
  onProgramFontSearchQueryChange: (query: string) => void;
  onAddProgramFonts: () => void;
  programFontImporting: boolean;
  programFontDeleting: string | null;
  onDeleteProgramFont?: (fileName: string) => void;
  programFontAssignments: { uiFileName?: string; terminalFileName?: string; aiFileName?: string };
  onProgramFontDragStart: (event: React.DragEvent, fileName: string) => void;
  onProgramFontDragEnd: () => void;
  onProgramFontDragEnter: (key: string) => void;
  onProgramFontDragLeave: (key: string) => void;
  onProgramFontDrop: (key: string, fileName: string) => void;
  onProgramFontReset: (key: string) => void;
  activeProgramFontDropTarget: string | null;
  terminalFontSize: number;
  onTerminalFontSizeChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  terminalLocalEcho: boolean;
  onTerminalLocalEchoChange: (v: boolean) => void;
  terminalTimestamps: boolean;
  onTerminalTimestampsChange: (v: boolean) => void;
  terminalCommandBlocks: boolean;
  onTerminalCommandBlocksChange: (v: boolean) => void;
  terminalDefaultMouseCursor: boolean;
  onTerminalDefaultMouseCursorChange: (v: boolean) => void;
  terminalKeywordHighlight: boolean;
  onTerminalKeywordHighlightChange: (v: boolean) => void;
  keywordRules: KeywordRule[];
  onKeywordRulesChange: (rules: KeywordRule[]) => void;
  onKeywordRulesReset: () => void;
  terminalBgColor: string;
  themePackages: ThemePackage[];
  themePackageSettings: ThemePackageSettings;
  themeMode: string;
  onThemeChange: (mode: string) => void;
  onSelectLightThemePackage: (id: string) => void;
  onSelectDarkThemePackage: (id: string) => void;
  onReloadThemePackages: () => void;
  onOpenThemePackagesDirectory: () => void;
  onImportThemePackages: () => void;
  onTuneActiveThemeWithAI: () => void;
  onDeleteThemePackage?: (themePackage: ThemePackage) => void;
  onCopyThemePackageToMode?: (themePackage: ThemePackage, targetMode: string) => void;
  themePackageBusy: boolean;
  showThemeQuickEntry: boolean;
  onToggleThemeQuickEntry: () => void;
  probePanelPosition: 'left' | 'right';
  onProbePanelPositionChange: (position: 'left' | 'right') => void;
  terminalToolbarIconOnly: boolean;
  onToggleTerminalToolbarIconOnly: () => void;
  termBgImage: string;
  globalBgImage: string;
  bgTargetMode: 'global' | 'terminal';
  onBgTargetModeChange: (mode: 'global' | 'terminal') => void;
  onBgUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onBgReset: () => void;
  termBgOpacity: number;
  globalBgOpacity: number;
  onBgOpacityChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  globalIconOpacity: number;
  onGlobalIconOpacityChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  rememberWindowSize: boolean;
  onToggleRememberWindowSize: () => void;
  onResetWindowSize: () => void;
}

export default function AppearanceTab({
  programFonts,
  programFontSearchQuery,
  onProgramFontSearchQueryChange,
  onAddProgramFonts,
  programFontImporting,
  programFontDeleting,
  onDeleteProgramFont,
  programFontAssignments,
  onProgramFontDragStart,
  onProgramFontDragEnd,
  onProgramFontDragEnter,
  onProgramFontDragLeave,
  onProgramFontDrop,
  onProgramFontReset,
  activeProgramFontDropTarget,
  terminalFontSize, onTerminalFontSizeChange,
  terminalLocalEcho, onTerminalLocalEchoChange,
  terminalTimestamps, onTerminalTimestampsChange,
  terminalCommandBlocks, onTerminalCommandBlocksChange,
  terminalDefaultMouseCursor, onTerminalDefaultMouseCursorChange,
  terminalKeywordHighlight, onTerminalKeywordHighlightChange,
  keywordRules, onKeywordRulesChange, onKeywordRulesReset, terminalBgColor,
  themePackages,
  themePackageSettings,
  themeMode, onThemeChange,
  onSelectLightThemePackage,
  onSelectDarkThemePackage,
  onReloadThemePackages,
  onOpenThemePackagesDirectory,
  onImportThemePackages,
  onTuneActiveThemeWithAI,
  onDeleteThemePackage,
  onCopyThemePackageToMode,
  themePackageBusy,
  showThemeQuickEntry, onToggleThemeQuickEntry,
  probePanelPosition, onProbePanelPositionChange,
  terminalToolbarIconOnly, onToggleTerminalToolbarIconOnly,
  termBgImage, globalBgImage,
  bgTargetMode, onBgTargetModeChange,
  onBgUpload, onBgReset,
  termBgOpacity, globalBgOpacity, onBgOpacityChange,
  globalIconOpacity, onGlobalIconOpacityChange,
  rememberWindowSize, onToggleRememberWindowSize, onResetWindowSize,
}: AppearanceTabProps) {
  const fontMap = new Map((Array.isArray(programFonts) ? programFonts : []).map((font) => [font.fileName, font]));
  const filteredFonts = (Array.isArray(programFonts) ? programFonts : []).filter((font) => {
    const query = String(programFontSearchQuery || '').trim().toLowerCase();
    if (!query) {
      return true;
    }
    return String(font.displayName || '').toLowerCase().includes(query) || String(font.fileName || '').toLowerCase().includes(query);
  });
  const fontAssignments = programFontAssignments || { uiFileName: '', terminalFileName: '', aiFileName: '' };
  // settingDefinitions.ts 已类型化，直接使用 settings 注册表
  const settingsData = settings;
  const appearanceSettings = settingsData.appearance;
  const fontTargets = [
    {
      key: 'ui',
      title: $t('界面文本'),
      description: $t('作用于应用界面中的普通文本'),
      defaultText: 'Inter / Segoe UI / sans-serif',
      fileName: fontAssignments.uiFileName || '',
    },
    {
      key: 'terminal',
      title: $t('终端输出'),
      description: $t('只作用于终端输出区域，不影响界面控件'),
      defaultText: 'JetBrains Mono / Fira Code / monospace',
      fileName: fontAssignments.terminalFileName || '',
    },
    {
      key: 'ai',
      title: $t('AI面板'),
      description: $t('作用于 AI 面板普通文本与输入区，代码块保持默认等宽字体'),
      defaultText: 'Inter / Segoe UI / sans-serif',
      fileName: fontAssignments.aiFileName || '',
    },
  ];

  const fontTargetDefinitions: Record<string, SettingsDefinitionNode | undefined> = {
    ui: appearanceSettings.fields.uiFont,
    terminal: appearanceSettings.fields.terminalFont,
    ai: appearanceSettings.fields.aiFont,
  };
  const normalizedThemePackages = Array.isArray(themePackages) ? themePackages : [];
  const lightThemePackages = normalizedThemePackages.filter((themePackage) => themePackage?.modeHint === 'light');
  const darkThemePackages = normalizedThemePackages.filter((themePackage) => themePackage?.modeHint !== 'light');

  return (
    <SettingsTabRoot>
      <div>
        <SettingsSectionTitle definition={appearanceSettings.sections.terminal} />
        <SettingsPanel className="p-3 border-line-subtle">
          <div data-settings-field-id={appearanceSettings.fields.fontManager.id} className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="text-base text-primary font-semibold">{$t('字体管理器')}</div>
                <div className="text-xs text-tertiary">{$t('从字体目录拖拽字体到右侧区域，为界面文本、终端输出和 AI 面板分别分配字体')}</div>
              </div>
              <Button size="sm" className="text-sm" onClick={onAddProgramFonts} disabled={programFontImporting}>
                {programFontImporting ? $t('导入中...') : $t('添加字体')}
              </Button>
            </div>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4 items-stretch">
              <div className="flex flex-col gap-2.5 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center min-h-[22px] px-2 rounded-full border border-line bg-raised text-secondary text-xs">
                    {$t('来源：字体目录')}
                  </span>
                  <span className="text-xs text-tertiary">{filteredFonts.length} {$t('个字体')}</span>
                </div>
                <input
                  id="appearance-font-search"
                  name="appearance-font-search"
                  autoComplete="off"
                  className="input min-h-[30px] text-sm"
                  value={programFontSearchQuery}
                  onChange={(event) => onProgramFontSearchQueryChange(event.target.value)}
                  placeholder={$t('搜索字体文件名')}
                />
                <div className="min-h-[292px] max-h-[292px] overflow-y-auto rounded-md border border-line bg-canvas p-2 flex flex-col gap-2">
                  {filteredFonts.length === 0 ? (
                    <div className="flex flex-1 min-h-[120px] items-center justify-center text-center text-tertiary text-sm leading-[1.7]">
                      {Array.isArray(programFonts) && programFonts.length > 0 ? $t('没有匹配的字体文件') : $t('字体目录中还没有字体，请先添加字体文件')}
                    </div>
                  ) : filteredFonts.map((font) => (
                    <div
                      key={font.fileName}
                      draggable={true}
                      onDragStart={(event) => onProgramFontDragStart(event, font.fileName)}
                      onDragEnd={onProgramFontDragEnd}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-md border border-line bg-overlay cursor-grab select-none"
                    >
                      <div className="flex flex-col gap-1 min-w-0 flex-1">
                        <div className="text-base font-semibold text-primary truncate">{font.displayName}</div>
                        <div className="text-xs text-tertiary truncate">{font.fileName}</div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={$t('删除字体')}
                        title={$t('删除字体')}
                        disabled={!!programFontDeleting}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          onDeleteProgramFont?.(font.fileName);
                        }}
                        onMouseDown={(event) => event.stopPropagation()}
                        className="shrink-0 text-danger"
                        style={{ opacity: programFontDeleting ? 0.5 : 1 }}
                      >
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-3 min-w-0 self-stretch">
                {fontTargets.map((target) => {
                  const assignedFont = target.fileName ? fontMap.get(target.fileName) : null;
                  const isHighlighted = activeProgramFontDropTarget === target.key;
                  return (
                    <div
                      key={target.key}
                      data-settings-field-id={fontTargetDefinitions[target.key]?.id}
                      onDragEnter={() => onProgramFontDragEnter(target.key)}
                      onDragLeave={() => onProgramFontDragLeave(target.key)}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = 'copy';
                        onProgramFontDragEnter(target.key);
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        const nextFileName = event.dataTransfer.getData('text/plain');
                        onProgramFontDrop(target.key, nextFileName);
                      }}
                      className={cn(
                        'rounded-md border p-3 min-h-[84px] flex-1 flex flex-col justify-between gap-2 min-w-0 transition-colors duration-[80ms]',
                        isHighlighted
                          ? 'border-accent bg-[rgba(var(--accent-rgb),0.08)] shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb),0.18)]'
                          : 'border-line bg-canvas',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2.5 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="text-base font-semibold text-primary">{target.title}</div>
                          <div className="text-xs text-tertiary leading-[1.5] break-words">{target.description}</div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onProgramFontReset(target.key)}
                          disabled={!target.fileName}
                          className="text-sm shrink-0"
                        >
                          {$t('恢复默认')}
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap min-w-0">
                        <span className="inline-flex items-center min-h-[22px] px-2 rounded-full border border-line bg-overlay text-primary text-xs font-semibold shrink-0">
                          {assignedFont ? assignedFont.displayName : $t('默认')}
                        </span>
                        <span className="text-xs text-tertiary truncate min-w-0 flex-1">
                          {assignedFont ? assignedFont.fileName : target.defaultText}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <SettingsDivider margin="12px 0 8px" />
          <SettingRow
            definition={appearanceSettings.fields.terminalFontSize}
            description={$t('调节终端的字符显示大小')}
            action={(
              <div className="flex items-center gap-3">
                <input
                  id="appearance-terminal-font-size"
                  name="appearance-terminal-font-size"
                  autoComplete="off"
                  type="range"
                  min="10"
                  max="28"
                  step="1"
                  value={terminalFontSize}
                  onChange={onTerminalFontSizeChange}
                  className="cursor-pointer"
                />
                <span className="text-base w-8 text-right text-primary">{terminalFontSize}px</span>
              </div>
            )}
          />
          <SettingsDivider />
          <SettingRow
            definition={appearanceSettings.fields.terminalLocalEcho}
            description={$t('关闭后输入密码等敏感内容时不会显示字符')}
            action={<ToggleSwitch checked={terminalLocalEcho} onChange={() => onTerminalLocalEchoChange(!terminalLocalEcho)} />}
          />
          <SettingsDivider />
          <SettingRow
            definition={appearanceSettings.fields.terminalTimestamps}
            description={$t('在终端每行输出前添加时间戳')}
            action={<ToggleSwitch checked={terminalTimestamps} onChange={() => onTerminalTimestampsChange(!terminalTimestamps)} />}
          />
          <SettingsDivider />
          <SettingRow
            definition={appearanceSettings.fields.terminalCommandBlocks}
            description={$t('左侧显示可折叠命令块，点击收起输出')}
            action={<ToggleSwitch checked={terminalCommandBlocks} onChange={() => onTerminalCommandBlocksChange(!terminalCommandBlocks)} />}
          />
          <SettingsDivider />
          <SettingRow
            definition={appearanceSettings.fields.terminalDefaultMouseCursor}
            description={$t('开启后, 终端输出区域使用系统默认鼠标指针, 不显示工字型文本光标')}
            action={<ToggleSwitch checked={terminalDefaultMouseCursor} onChange={() => onTerminalDefaultMouseCursorChange(!terminalDefaultMouseCursor)} />}
          />
          <SettingsDivider />
          <SettingRow
            definition={appearanceSettings.fields.terminalKeywordHighlight}
            description={$t('对 error、warning、info、success 等关键字着色显示')}
            action={<ToggleSwitch checked={terminalKeywordHighlight} onChange={() => onTerminalKeywordHighlightChange(!terminalKeywordHighlight)} />}
          />
          {terminalKeywordHighlight && (
            <KeywordRulesPanel
              rules={keywordRules}
              onRulesChange={onKeywordRulesChange}
              onResetDefault={onKeywordRulesReset}
              terminalBg={terminalBgColor}
            />
          )}
        </SettingsPanel>
      </div>

      <div>
        <SettingsSectionTitle definition={appearanceSettings.sections.theme} />
        <SettingsPanel>
          <div data-settings-field-id={appearanceSettings.fields.theme.id} className="flex justify-between items-center gap-3 flex-wrap">
            <div>
              <div className="text-base text-primary">{$t('主题')}</div>
              <div className="text-xs text-tertiary">{$t('浅色、深色和系统模式分别决定当前应用哪一套主题包')}</div>
            </div>
            <div className="flex items-center gap-3 flex-wrap justify-end">
              <button
                type="button"
                onClick={onToggleThemeQuickEntry}
                aria-pressed={showThemeQuickEntry}
                aria-label={$t('快捷入口')}
                className={cn(
                  'inline-flex items-center gap-2.5 min-h-[34px] px-3 rounded-full cursor-pointer select-none whitespace-nowrap transition-colors duration-[80ms] border',
                  showThemeQuickEntry
                    ? 'border-accent-border bg-[rgba(var(--accent-rgb),0.10)] text-primary shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb),0.12)]'
                    : 'border-line bg-raised text-secondary',
                )}
              >
                <span className="text-sm font-semibold">{$t('快捷入口')}</span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'w-9 h-5 rounded-full relative transition-colors duration-[80ms] border border-line',
                    showThemeQuickEntry ? 'bg-accent' : 'bg-hover',
                  )}
                >
                  <span
                    className="absolute top-px w-4 h-4 rounded-full bg-white shadow-xs transition-[left] duration-200 ease-[cubic-bezier(0.4,0,0.2,1)]"
                    style={{ left: showThemeQuickEntry ? 17 : 1 }}
                  />
                </span>
              </button>
              <div className="flex bg-raised rounded-xl p-1 border border-line">
                <Button size="sm" variant={themeMode === 'light' ? 'secondary' : 'ghost'} aria-pressed={themeMode === 'light'} onClick={() => onThemeChange('light')} className="rounded-xl gap-1 aria-pressed:bg-sunken aria-pressed:text-secondary aria-pressed:border-line"><Sun size={14} />{$t('浅色')}</Button>
                <Button size="sm" variant={themeMode === 'system' ? 'secondary' : 'ghost'} aria-pressed={themeMode === 'system'} onClick={() => onThemeChange('system')} className="rounded-xl gap-1 aria-pressed:bg-sunken aria-pressed:text-secondary aria-pressed:border-line"><Monitor size={14} />{$t('系统')}</Button>
                <Button size="sm" variant={themeMode === 'dark' ? 'secondary' : 'ghost'} aria-pressed={themeMode === 'dark'} onClick={() => onThemeChange('dark')} className="rounded-xl gap-1 aria-pressed:bg-sunken aria-pressed:text-secondary aria-pressed:border-line"><Moon size={14} />{$t('深色')}</Button>
              </div>
            </div>
          </div>

          <SettingsDivider />
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3.5">
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" onClick={onReloadThemePackages} disabled={themePackageBusy}>{$t('重新扫描')}</Button>
              <Button size="sm" onClick={onOpenThemePackagesDirectory} disabled={themePackageBusy}>{$t('打开目录')}</Button>
              <Button size="sm" onClick={onImportThemePackages} disabled={themePackageBusy}>{$t('导入JSON')}</Button>
            </div>
            <Button size="sm" onClick={onTuneActiveThemeWithAI} disabled={themePackageBusy}>{$t('AI调色')}</Button>
          </div>

          <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4 items-start">
            <ThemePackagePalette
              definition={appearanceSettings.fields.lightThemePackage}
              title={$t('浅色主题包')}
              description={$t('当主题为浅色或系统切换到浅色时使用')}
              packages={lightThemePackages}
              selectedThemePackageId={themePackageSettings?.lightThemePackageId}
              onSelectThemePackage={onSelectLightThemePackage}
              onDeleteThemePackage={onDeleteThemePackage}
              onCopyThemePackageToMode={onCopyThemePackageToMode}
              copyTargetMode="dark"
              themePackageBusy={themePackageBusy}
            />
            <ThemePackagePalette
              definition={appearanceSettings.fields.darkThemePackage}
              title={$t('深色主题包')}
              description={$t('当主题为深色或系统切换到深色时使用')}
              packages={darkThemePackages}
              selectedThemePackageId={themePackageSettings?.darkThemePackageId}
              onSelectThemePackage={onSelectDarkThemePackage}
              onDeleteThemePackage={onDeleteThemePackage}
              onCopyThemePackageToMode={onCopyThemePackageToMode}
              copyTargetMode="light"
              themePackageBusy={themePackageBusy}
            />
          </div>

          <SettingsDivider />
          <SettingRow
            definition={appearanceSettings.fields.monitorPanel}
            action={(
              <div className="flex bg-raised rounded-xl p-1 border border-line">
                <Button size="sm" variant={probePanelPosition === 'left' ? 'secondary' : 'ghost'} aria-pressed={probePanelPosition === 'left'} onClick={() => onProbePanelPositionChange('left')} className="rounded-xl aria-pressed:bg-sunken aria-pressed:text-secondary aria-pressed:border-line">{$t('左侧')}</Button>
                <Button size="sm" variant={probePanelPosition === 'right' ? 'secondary' : 'ghost'} aria-pressed={probePanelPosition === 'right'} onClick={() => onProbePanelPositionChange('right')} className="rounded-xl aria-pressed:bg-sunken aria-pressed:text-secondary aria-pressed:border-line">{$t('右侧')}</Button>
              </div>
            )}
          />
        </SettingsPanel>
      </div>

      <div>
        <SettingsSectionTitle definition={appearanceSettings.sections.preferences} />
        <SettingsPanel>
          <SettingRow
            definition={appearanceSettings.fields.toolbarIconOnly}
            description={$t('开启后终端工具栏的进程管理、网络监控等按钮只显示图标')}
            action={<ToggleSwitch checked={terminalToolbarIconOnly} onChange={onToggleTerminalToolbarIconOnly} />}
          />
        </SettingsPanel>
      </div>

      <div>
        <SettingsSectionTitle definition={appearanceSettings.sections.background} />
        <SettingsPanel>
          {/* 背景类型切换：全局 / 终端 */}
          <div className="flex justify-between items-center gap-3">
            <div className="min-w-0">
              <div className="text-base text-primary">{$t('全局背景图')}</div>
              <div className="text-xs text-tertiary">{$t('设置全局背景后不可设置终端壁纸')}</div>
            </div>
            <div className="inline-flex border border-line rounded-sm overflow-hidden shrink-0">
              {(['global', 'terminal'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => onBgTargetModeChange(mode)}
                  className={cn(
                    'px-3 py-1 text-sm cursor-pointer border-none',
                    bgTargetMode === mode ? 'bg-accent text-white' : 'bg-transparent text-secondary',
                  )}
                >
                  {mode === 'global' ? $t('全局背景图') : $t('终端背景')}
                </button>
              ))}
            </div>
          </div>
          <SettingsDivider />
          {/* 上传 / 恢复（作用于当前选中的类型） */}
          <div className="flex justify-end items-center gap-3">
            {(bgTargetMode === 'global' ? globalBgImage : termBgImage) && (
              <Button variant="ghost" size="sm" onClick={onBgReset}>{$t('恢复默认')}</Button>
            )}
            <label htmlFor="appearance-bg-upload" className="inline-flex items-center justify-center gap-1 min-h-6 py-[3px] px-[7px] rounded-sm text-sm font-medium leading-none whitespace-nowrap border select-none cursor-pointer outline-none transition-colors duration-100 bg-raised text-secondary border-line hover:bg-hover hover:text-primary hover:border-focus active:bg-active">
              {$t('上传图片')}
              <input id="appearance-bg-upload" type="file" accept="image/*" className="hidden" onChange={onBgUpload} />
            </label>
          </div>
          <SettingsDivider />
          {/* 可见度（随类型切换范围与标签） */}
          <div className="flex justify-between items-center">
            <div className="text-base text-primary">
              {bgTargetMode === 'global' ? $t('全局背景可见度') : $t('壁纸可见度')}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="0"
                max={bgTargetMode === 'global' ? 0.5 : 1}
                step={bgTargetMode === 'global' ? 0.02 : 0.05}
                value={bgTargetMode === 'global' ? globalBgOpacity : termBgOpacity}
                onChange={onBgOpacityChange}
              />
              <span className="text-base w-8 text-right text-primary">
                {Math.round((bgTargetMode === 'global' ? globalBgOpacity : termBgOpacity) * 100)}%
              </span>
            </div>
          </div>
          {/* 图标透明度仅全局模式有效 */}
          {bgTargetMode === 'global' && (
            <>
              <SettingsDivider />
              <div className="flex justify-between items-center">
                <div className="text-base text-primary">{$t('图标透明度')}</div>
                <div className="flex items-center gap-3">
                  <input type="range" min="0.4" max="1" step="0.05" value={globalIconOpacity} onChange={onGlobalIconOpacityChange} />
                  <span className="text-base w-8 text-right text-primary">{Math.round(globalIconOpacity * 100)}%</span>
                </div>
              </div>
            </>
          )}
        </SettingsPanel>
      </div>

      <div>
        <SettingsSectionTitle definition={appearanceSettings.sections.window} />
        <SettingsPanel>
          <SettingRow
            definition={appearanceSettings.fields.rememberWindowSize}
            description={$t('下次启动时恢复上次调整的窗口尺寸')}
            action={<ToggleSwitch checked={rememberWindowSize} onChange={onToggleRememberWindowSize} />}
          />
          <SettingsDivider />
          <SettingRow
            definition={appearanceSettings.fields.resetWindowSize}
            description={$t('下次启动时恢复上次调整的窗口尺寸')}
            action={<Button size="sm" className="text-sm" onClick={onResetWindowSize}>{$t('恢复默认大小')}</Button>}
          />
        </SettingsPanel>
      </div>
    </SettingsTabRoot>
  );
}

interface ThemePackagePaletteProps {
  definition?: SettingsDefinitionNode;
  title: string;
  description: string;
  packages: ThemePackage[];
  selectedThemePackageId?: string;
  onSelectThemePackage: (id: string) => void;
  onDeleteThemePackage?: (themePackage: ThemePackage) => void;
  onCopyThemePackageToMode?: (themePackage: ThemePackage, targetMode: string) => void;
  copyTargetMode: string;
  themePackageBusy: boolean;
}

function ThemePackagePalette({
  definition,
  title,
  description,
  packages,
  selectedThemePackageId,
  onSelectThemePackage,
  onDeleteThemePackage,
  onCopyThemePackageToMode,
  copyTargetMode,
  themePackageBusy,
}: ThemePackagePaletteProps) {
  const normalizedPackages = Array.isArray(packages) ? packages : [];
  const palettePackages = useMemo(() => normalizedPackages.map((themePackage) => ({
    ...themePackage,
    preview: themePackage?.preview || ({} as ThemePackagePreview),
  })), [normalizedPackages]);
  const copyLabel = copyTargetMode === 'light' ? $t('复制到浅色') : $t('复制到深色');

  return (
    <div data-settings-field-id={definition?.id} className="flex flex-col gap-2.5 min-w-0">
      <div className="min-w-0">
        <div className="text-base text-primary font-semibold">{title}</div>
        <div className="text-xs text-tertiary">{description}</div>
      </div>
      {palettePackages.length === 0 ? (
        <div className="p-3 rounded-md border border-dashed border-line text-tertiary text-sm">
          {$t('当前没有可用的主题包')}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {palettePackages.map((themePackage) => {
            const isActive = selectedThemePackageId === themePackage.id;
            const canDelete = themePackage.source === 'user';
            return (
              <div
                key={themePackage.id}
                onClick={() => onSelectThemePackage(themePackage.id)}
                className={cn(
                  'flex items-center gap-2.5 px-3 py-2.5 rounded-md cursor-pointer min-w-0 transition-colors duration-[80ms] border',
                  isActive
                    ? 'border-accent bg-[rgba(var(--accent-rgb),0.08)] shadow-[inset_0_0_0_1px_rgba(var(--accent-rgb),0.18)]'
                    : 'border-line bg-canvas',
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn('w-2 h-2 rounded-full shrink-0', isActive ? 'bg-accent' : 'bg-tertiary')}
                />
                <div className="flex-1 min-w-0">
                  <div className={cn('text-base text-primary truncate', isActive ? 'font-bold' : 'font-semibold')}>
                    {/* themePackage.name 为动态显示名（内置主题为 i18n 键），t() 内部有兜底 */}
                    {$t(themePackage.name as I18nKey)}
                  </div>
                  {themePackage.description ? (
                    <div className="text-xs text-tertiary leading-[1.5] mt-0.5 truncate">
                      {/* 同 name：动态描述，t() 内部有兜底 */}
                      {$t(themePackage.description as I18nKey)}
                    </div>
                  ) : null}
                </div>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-line text-tertiary shrink-0">
                  {themePackage.source === 'builtin' ? $t('内置') : $t('用户')}
                </span>
                {copyTargetMode ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={copyLabel}
                    title={copyLabel}
                    disabled={themePackageBusy}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onCopyThemePackageToMode?.(themePackage, copyTargetMode);
                    }}
                    className="w-6 h-6 min-w-6 text-secondary shrink-0"
                  >
                    <Copy size={12} />
                  </Button>
                ) : null}
                {canDelete ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={$t('删除主题包')}
                    title={$t('删除主题包')}
                    disabled={themePackageBusy}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      onDeleteThemePackage?.(themePackage);
                    }}
                    className="w-6 h-6 min-w-6 text-danger shrink-0"
                  >
                    <Trash2 size={12} />
                  </Button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

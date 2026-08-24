import type { I18nKey } from '../../i18n.ts';
import type { IdentityPresetOption } from '../../utils/fileManagerHelpers.tsx';

export type LooseT = (key: I18nKey, vars?: Record<string, unknown>) => string

/** 标签拖放指示器（setFileManagerTabDropIndicator 状态） */
export interface FileManagerTabDropIndicator {
  tabId?: unknown
  side?: unknown
  [key: string]: unknown
}

// 远端/本地文件条目（ListDir 返回项 + 本地传输占位项的统一形状）
export interface FileManagerFileItem {
  name: string
  isDirectory: boolean
  size?: number
  permission?: string
  mode?: string
  modifyTime?: number
  uid?: string
  gid?: string
  isSymlink?: boolean
  __rowKey?: string
  __luminDeletedPlaceholder?: boolean
  [key: string]: unknown
}

// 右键菜单状态（contextMenu state）
export interface ContextMenuState {
  pos: { x: number; y: number }
  item: FileManagerFileItem | null
  mode?: string
  itemBasePath?: string
  createBasePath?: string
  showCreateActions?: boolean
  deleteItemCount?: number
  clipboardItemCount?: number
  deleteUsesSelectedPaths?: boolean
  clipboardUsesSelectedPaths?: boolean
  tabId?: string
  tabPath?: string
  tabPinned?: boolean
  tabSystemPinned?: boolean
}

// chmod 目标（setChmodTarget 状态，{ item, path, mode, includeSubdirectories, showIncludeSubdirectories }）
export interface FileManagerChmodTarget {
  item: FileManagerFileItem | null
  path: string
  mode: string
  includeSubdirectories?: boolean
  showIncludeSubdirectories?: boolean
  rememberedMode?: string
  autoApplyLastSettings?: boolean
  ownerCandidates?: IdentityPresetOption[]
  groupCandidates?: IdentityPresetOption[]
  [key: string]: unknown
}

// loadDir 的选项
export interface LoadDirOptions {
  silent?: boolean
  tabId?: string
  staleWhileRevalidate?: boolean
  staleItems?: FileManagerFileItem[]
  preferPathCache?: boolean
  preserveWorkspacePathOnSuccess?: boolean
  preserveView?: boolean
  trackDiff?: boolean
  showLoading?: boolean
}

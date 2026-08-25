import CredentialsModal from './CredentialsModal.tsx';
import ExportSelectedDialog from './ExportSelectedDialog.tsx';
import GlobalContextMenu from './GlobalContextMenu.tsx';
import GlobalDialog from './GlobalDialog.tsx';
import ImportExportDialog from './ImportExportDialog.tsx';
import PortForwardDialog from './PortForwardDialog.tsx';
import SerialConfigModal from './SerialConfigModal.tsx';
import SettingsModal from './SettingsModal.tsx';
import SyncFailureToast from './SyncFailureToast.tsx';
import Toast from './Toast.tsx';
import UpdateModal from './UpdateModal.tsx';
import EditFlyLayer from './overlays/EditFlyLayer.tsx';
import TerminalTabContextMenuOverlay from './overlays/TerminalTabContextMenuOverlay.tsx';
import TabContextMenuOverlay from './overlays/TabContextMenuOverlay.tsx';
import SessionListOverlay from './overlays/SessionListOverlay.tsx';
import type { AppOverlaysProps } from './overlays/overlayTypes.ts';

export type { AppOverlaysProps, TabContextMenuState, TerminalTabContextMenuState } from './overlays/overlayTypes.ts';

export default function AppOverlays({ dialogs, importExport, notifications, menus, animation, shared }: AppOverlaysProps) {
  const {
    activeAIDevilMode,
    activeSessionId,
    addToast,
    canCopySessionPassword,
    canMoveTerminalToDockTarget,
    closeAllSessions,
    closePortForwardDialog,
    closeSession,
    closeTerminal,
    closeTerminalGroup,
    connectSerial,
    downloadProgress,
    editFlyAnimation,
    editorModeBanner,
    exportSelectedIds,
    forceCloseSession,
    handleApplyStartupUpdate,
    handleCopySessionPassword,
    handleDownloadTemplate,
    handleExport,
    handleExportSelected,
    handleImport,
    handleRenameTerminalTab,
    handleTabClick,
    handleToastAction,
    hasRecoveryPassword,
    ieBusy,
    isTerminalDockTargetOccupied,
    isUpdateModalVisible,
    loadServers,
    moveTerminalToDockTarget,
    portForwardDialogSessionId,
    portForwardInitialMapping,
    portForwardInitialTab,
    probePanelPosition,
    removeToast,
    sessionAuthPrompts,
    sessionListPos,
    sessionListQuery,
    sessionListRef,
    sessions,
    setExportSelectedIds,
    setIsUpdateModalVisible,
    setProbePanelPosition,
    setSessionListQuery,
    setSettingsInitialTab,
    setShowCredentials,
    setShowExportSelectedDialog,
    setShowImportExportDialog,
    setShowSerialModal,
    setShowSessionList,
    setShowSettings,
    setSyncFailed,
    setTabContextMenu,
    setTerminalTabContextMenu,
    settingsInitialTab,
    showCredentials,
    showExportSelectedDialog,
    showImportExportDialog,
    showPortForwardDialog,
    showSerialModal,
    showSessionList,
    showSettings,
    startupUpdateInfo,
    syncFailed,
    t,
    tabContextMenu,
    terminalTabContextMenu,
    toasts,
  } = { ...dialogs, ...importExport, ...notifications, ...menus, ...animation, ...shared };
  return (<>
      {showImportExportDialog && (
        <ImportExportDialog
          onClose={() => setShowImportExportDialog(false)}
          onExport={handleExport}
          onImport={handleImport}
          onDownloadTemplate={handleDownloadTemplate}
          hasRecoveryPassword={hasRecoveryPassword}
          busy={ieBusy}
        />
      )}

      {showExportSelectedDialog && (
        <ExportSelectedDialog
          onClose={() => {
            setShowExportSelectedDialog(false);
            setExportSelectedIds([]);
          }}
          onExport={handleExportSelected}
          hasRecoveryPassword={hasRecoveryPassword}
          busy={ieBusy}
          selectedCount={exportSelectedIds.length}
        />
      )}

      {showSerialModal && (
        <SerialConfigModal
          onClose={() => setShowSerialModal(false)}
          onConnect={(config) => {
            setShowSerialModal(false);
            connectSerial(config);
          }}
        />
      )}

      {showPortForwardDialog && portForwardDialogSessionId && (
        <PortForwardDialog
          sessionId={portForwardDialogSessionId}
          initialMapping={portForwardInitialMapping}
          initialTab={portForwardInitialTab}
          onClose={closePortForwardDialog}
        />
      )}

      {showSettings && (
        <SettingsModal
          initialTab={settingsInitialTab}
          onClose={() => { setShowSettings(false); loadServers(); }}
          addToast={addToast}
          onRestored={loadServers}
          probePanelPosition={probePanelPosition}
          onProbePanelPositionChange={setProbePanelPosition}
          forceDarkTheme={activeAIDevilMode}
        />
      )}

      {showCredentials && (
        <CredentialsModal
          onClose={() => { setShowCredentials(false); loadServers(); }}
          onChange={loadServers}
          addToast={addToast}
        />
      )}

      {editFlyAnimation && (
        <EditFlyLayer editFlyAnimation={editFlyAnimation} />
      )}

      {editorModeBanner && (
        <div className="editor-mode-banner" key={editorModeBanner.id} aria-live="polite">
          {editorModeBanner.text}
        </div>
      )}

      {/* ── Toasts ────────────────────────────────────────── */}
      <Toast toasts={toasts} onClose={removeToast} onAction={handleToastAction} closeLabel={t('关闭')} />
      <GlobalDialog suspendDefault={showSettings} />


      {/* ── 自动更新弹窗 ──────────────────────────────── */}
      <UpdateModal
        visible={isUpdateModalVisible}
        updateInfo={startupUpdateInfo}
        downloadProgress={downloadProgress}
        t={t}
        onClose={() => setIsUpdateModalVisible(false)}
        onUpdate={handleApplyStartupUpdate}
      />

      <SyncFailureToast
        syncFailed={syncFailed}
        setSyncFailed={setSyncFailed}
        setSettingsInitialTab={setSettingsInitialTab}
        setShowSettings={setShowSettings}
        addToast={addToast}
        t={t}
      />

      <GlobalContextMenu />

      {/* ── 终端子标签右键菜单 ── */}
      {terminalTabContextMenu && (
        <TerminalTabContextMenuOverlay
          terminalTabContextMenu={terminalTabContextMenu}
          sessions={sessions}
          t={t}
          isTerminalDockTargetOccupied={isTerminalDockTargetOccupied}
          canMoveTerminalToDockTarget={canMoveTerminalToDockTarget}
          moveTerminalToDockTarget={moveTerminalToDockTarget}
          setTerminalTabContextMenu={setTerminalTabContextMenu}
          handleRenameTerminalTab={handleRenameTerminalTab}
          closeTerminalGroup={closeTerminalGroup}
          closeTerminal={closeTerminal}
        />
      )}

      {/* ── 标签右键菜单 ── */}
      {tabContextMenu && (
        <TabContextMenuOverlay
          tabContextMenu={tabContextMenu}
          sessions={sessions}
          t={t}
          canCopySessionPassword={canCopySessionPassword}
          setTabContextMenu={setTabContextMenu}
          handleCopySessionPassword={handleCopySessionPassword}
          forceCloseSession={forceCloseSession}
          closeAllSessions={closeAllSessions}
        />
      )}
      {/* ── 服务器列表下拉 ── */}
      {showSessionList && (
        <SessionListOverlay
          sessionListRef={sessionListRef}
          sessionListPos={sessionListPos}
          sessionListQuery={sessionListQuery}
          setSessionListQuery={setSessionListQuery}
          t={t}
          sessions={sessions}
          activeSessionId={activeSessionId}
          sessionAuthPrompts={sessionAuthPrompts}
          handleTabClick={handleTabClick}
          setShowSessionList={setShowSessionList}
          closeSession={closeSession}
        />
      )}
  </>);
}

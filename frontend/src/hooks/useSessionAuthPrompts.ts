import { useCallback, useEffect } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { EventsOn } from '../../wailsjs/runtime/runtime.js';
import * as AppGo from '../../wailsjs/go/wailsapp/App.js';
import type { config } from '../../wailsjs/go/models.ts';
import type { SessionLike } from '../utils/sessionWorkspace';
import type { ConnectingServer, SessionAuthPrompt } from './useSessionConnections';

// 认证提示（hostkey 确认 / 密码重输）子 hook：
// 两个 EventsOn 订阅 + 两个 resolver。从 useSessionConnections 原样搬移。
interface UseSessionAuthPromptsDeps {
  addToast: (message: string | Error, type?: string, duration?: number, actions?: unknown[]) => number;
  t: (key: string, vars?: Record<string, unknown>) => string;
  clearSessionAuthPrompt: (sessionId: string) => void;
  updateSessionStatus: (sessionId: string, status: string) => void;
  postConnectSetup: (sessionId: string, serverId: string) => Promise<unknown>;
  handleConnectError: (sessionId: string, err: unknown) => void | Promise<void>;
  setSessions: Dispatch<SetStateAction<SessionLike[]>>;
  setConnectingServers: Dispatch<SetStateAction<ConnectingServer[]>>;
  setSessionAuthPrompts: Dispatch<SetStateAction<Record<string, SessionAuthPrompt>>>;
  sessionsRef: MutableRefObject<SessionLike[]>;
  serversRef: MutableRefObject<config.Connection[]>;
  authPromptTokenRef: MutableRefObject<number>;
}

export function useSessionAuthPrompts({
  addToast,
  t,
  clearSessionAuthPrompt,
  updateSessionStatus,
  postConnectSetup,
  handleConnectError,
  setSessions,
  setConnectingServers,
  setSessionAuthPrompts,
  sessionsRef,
  serversRef,
  authPromptTokenRef,
}: UseSessionAuthPromptsDeps) {
  const resolveHostKeyChoice = useCallback(async (sessionId: string, chosen: number) => {
    clearSessionAuthPrompt(sessionId);
    try {
      await AppGo.AcceptHostKeyChange(sessionId, chosen);
      if (chosen >= 1) {
        setSessions((prev) =>
          prev.map((s) =>
            s.id === sessionId ? { ...s, status: 'connected' } : s
          )
        );
        setConnectingServers((prev) => prev.filter((s) => s.sessionId !== sessionId));
        addToast(
          chosen === 2 ? t('主机密钥已保存，连接成功') : t('本次已接受，连接成功'),
          'success'
        );

        const matched = sessionsRef.current.find((s) => s.id === sessionId);
        await postConnectSetup(sessionId, String(matched?.serverId || ''));
      } else {
        updateSessionStatus(sessionId, 'error');
        setConnectingServers((prev) => prev.filter((s) => s.sessionId !== sessionId));
        addToast(t('用户取消连接'), 'warning', 3000);
      }
    } catch (err) {
      // 取消分支后端固定返回「用户取消了主机密钥验证」，属预期结果，不作失败提示
      if (chosen >= 1) {
        addToast(`${t('连接失败')}: ${String(err)}`, 'error', 5000);
      } else {
        addToast(t('用户取消连接'), 'warning', 3000);
      }
      updateSessionStatus(sessionId, 'error');
      setConnectingServers((prev) => prev.filter((s) => s.sessionId !== sessionId));
    }
  }, [addToast, clearSessionAuthPrompt, postConnectSetup, t, updateSessionStatus]);

  // ── 监听主机密钥变更事件 ────────────────────────────────────
  // 只写入该会话的待确认状态，由会话面板内的 SessionAuthCard 呈现，
  // 批量连接时 N 台主机就有 N 张卡片，各自独立。
  useEffect(() => {
    const unbind = EventsOn('ssh-host-key-changed', (data: Record<string, unknown>) => {
      const {
        sessionId, host, port, newFingerprint, oldFingerprints, isNew
      } = data;

      const oldFpList = (Array.isArray(oldFingerprints) ? oldFingerprints : []).map(String).join('\n');
      const message = isNew
        ? [
          t('首次连接到此主机，请确认密钥指纹：'),
          ``,
          `${t('主机:')} ${host}:${port}`,
          ``,
          t('密钥指纹:'),
          `${newFingerprint}`,
          ``,
          t('如果指纹与服务器管理员提供的匹配，点击"接受并保存"。'),
        ].join('\n')
        : [
          t('远程主机密钥已变更，可能存在中间人攻击！'),
          ``,
          `${t('主机:')} ${host}:${port}`,
          ``,
          t('新密钥指纹:'),
          `${newFingerprint}`,
          ``,
          t('旧密钥指纹:'),
          `${oldFpList}`,
          ``,
          t('如果确认这是预期的变更（如服务器重装），点击"接受并保存"。'),
        ].join('\n');

      setSessionAuthPrompts((prev) => ({
        ...prev,
        [String(sessionId)]: {
          kind: 'hostkey',
          token: ++authPromptTokenRef.current,
          title: isNew ? t('主机密钥确认') : t('主机密钥已变更'),
          message,
          danger: !isNew, // 密钥变更（疑似中间人）默认焦点落在「取消」
        },
      }));
    });
    return () => {
      if (unbind) unbind();
    };
  }, [t]);

  // ── 认证失败：用户在会话卡片上重输密码后 ──────────────────
  // result: null=取消 | { value, persist }
  const resolvePasswordPrompt = useCallback(async (
    sessionId: string,
    connId: string,
    result: { value: string; persist: boolean } | null,
  ) => {
    clearSessionAuthPrompt(sessionId);
    if (result === null) {
      // 用户取消
      updateSessionStatus(sessionId, 'error');
      setConnectingServers((prev) => prev.filter((s) => s.sessionId !== sessionId));
      addToast(t('用户取消连接'), 'warning', 3000);
      return;
    }

    const { value: newPassword, persist } = result;
    if (!newPassword) {
      updateSessionStatus(sessionId, 'error');
      setConnectingServers((prev) => prev.filter((s) => s.sessionId !== sessionId));
      return;
    }

    updateSessionStatus(sessionId, 'connecting');
    setConnectingServers((prev) => {
      if (prev.some((item) => item.sessionId === sessionId)) return prev;
      const matchedServer = serversRef.current.find((server) => String(server.id) === connId);
      const matchedSession = sessionsRef.current.find((session) => session.id === sessionId);
      // server 字段显式声明为 Connection 兼容形状，避免 || 链推导出 {} 类型导致 TS 报错
      const fallbackServer: Pick<config.Connection, 'id' | 'name' | 'host'> = {
        id: connId,
        name: String(matchedSession?.serverName || matchedSession?.host || connId),
        host: String(matchedSession?.host || ''),
      };
      return [...prev, {
        server: matchedServer || fallbackServer,
        sessionId,
        startTime: Date.now(),
      }];
    });

    try {
      await AppGo.ReconnectWithPassword(sessionId, connId, newPassword, persist);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'connected' } : s))
      );
      setConnectingServers((prev) => prev.filter((s) => s.sessionId !== sessionId));
      addToast(persist ? t('密码已保存，连接成功') : t('连接成功'), 'success', 3000);

      await postConnectSetup(sessionId, connId);
    } catch (retryErr) {
      handleConnectError(sessionId, retryErr);
    }
  }, [addToast, clearSessionAuthPrompt, handleConnectError, postConnectSetup, t, updateSessionStatus]);

  // ── 监听认证失败事件（密码错误等） ──────────────────────────
  // 只写入该会话的待确认状态，由会话面板内的 SessionAuthCard 呈现
  useEffect(() => {
    const unbind = EventsOn('ssh-auth-failed', (data: Record<string, unknown>) => {
      const { sessionId, connId, host, port, username, error } = data;
      const usesCredential = serversRef.current.some(s => s.id === connId && s.credentialId);

      const message = [
        t('认证失败，请输入正确的密码重试：'),
        ``,
        `${t('主机:')} ${host}:${port}`,
        `${t('用户')}: ${username}`,
        ``,
        `${t('错误')}: ${error}`,
      ].join('\n');

      setSessionAuthPrompts((prev) => ({
        ...prev,
        [String(sessionId)]: {
          kind: 'password',
          token: ++authPromptTokenRef.current,
          title: t('认证失败'),
          message,
          connId: String(connId),
          checkboxLabel: usesCredential ? t('更新凭据密码') : t('记住密码'),
        },
      }));
    });
    return () => {
      if (unbind) unbind();
    };
  }, [t]);

  return { resolveHostKeyChoice, resolvePasswordPrompt };
}

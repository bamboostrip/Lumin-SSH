// 文件管理器长操作（压缩/解压/删除/chmod）的取消标识工具。
// 后端按 operationId 注册可取消 ctx，取消按钮调用 AbortFileOperation(operationId)
// 会关闭对应的远端 session（tar/unzip/rm 立即终止）。

export function createFileOperationId(prefix: string): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  const suffix = cryptoObj && typeof cryptoObj.randomUUID === 'function'
    ? cryptoObj.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

export function abortFileOperation(operationId: string): void {
  void window?.go?.wailsapp?.App?.AbortFileOperation?.(operationId);
}

export function isFileOperationCanceled(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err ?? '');
  return /context canceled|operation canceled|operation cancelled/i.test(text);
}

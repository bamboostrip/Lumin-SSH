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
  const abort = window?.go?.wailsapp?.App?.AbortFileOperation;
  if (typeof abort !== 'function') return;
  try {
    // 操作可能已经结束（取消晚于完成），后端会返回 "not running"；
    // 这里必须 catch，否则控制台会出现未处理的 promise rejection。
    void Promise.resolve(abort(operationId)).catch(() => {});
  } catch {
    // Wails bridge 本身异常时也不要把取消动作冒泡成未捕获异常。
  }
}

export function isFileOperationCanceled(err: unknown): boolean {
  const text = err instanceof Error ? err.message : String(err ?? '');
  return /context canceled|operation canceled|operation cancelled/i.test(text);
}

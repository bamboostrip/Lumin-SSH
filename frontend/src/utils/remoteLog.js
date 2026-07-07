const LOG_ENDPOINT = 'http://localhost:20000/_Main_/AddLog';
const CLEAR_ENDPOINT = 'http://localhost:20000/_Main_/ClearLogs';
const ROUND_SEPARATOR = '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n';

async function postLogBody(body) {
  try {
    await fetch(LOG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body,
    });
  } catch {}
}

export function addRemoteLog(payload) {
  const message = typeof payload === 'string' ? payload : JSON.stringify(payload);
  void postLogBody(message);
}

export function addRemoteLogSeparator() {
  void postLogBody(ROUND_SEPARATOR);
}

export async function clearRemoteLogs() {
  try {
    await fetch(CLEAR_ENDPOINT, {
      method: 'POST',
    });
  } catch {}
}
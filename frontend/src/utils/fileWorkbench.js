const WORKBENCH_STATE_KEY = '__luminFileWorkbenchState';
const UPLOAD_QUEUE_STATE_KEY = '__luminFileUploadQueueState';

function getRoot() {
  if (typeof window !== 'undefined') return window;
  return globalThis;
}

function normalizeSessionGroupId(sessionGroupId) {
  return String(sessionGroupId || 'default');
}

function workbenchEventName(sessionGroupId) {
  return `lumin-file-workbench:${normalizeSessionGroupId(sessionGroupId)}`;
}

function uploadQueueEventName(sessionGroupId) {
  return `lumin-file-upload-queue:${normalizeSessionGroupId(sessionGroupId)}`;
}

function ensureWorkbenchStore() {
  const root = getRoot();
  if (!root[WORKBENCH_STATE_KEY]) root[WORKBENCH_STATE_KEY] = {};
  return root[WORKBENCH_STATE_KEY];
}

function ensureUploadQueueStore() {
  const root = getRoot();
  if (!root[UPLOAD_QUEUE_STATE_KEY]) root[UPLOAD_QUEUE_STATE_KEY] = {};
  return root[UPLOAD_QUEUE_STATE_KEY];
}

export function getSessionWorkbenchState(sessionGroupId) {
  const store = ensureWorkbenchStore();
  const key = normalizeSessionGroupId(sessionGroupId);
  return {
    activeTab: 'upload',
    uploadOpen: false,
    editorSplitOpen: false,
    editorOwnerId: '',
    ...(store[key] || {}),
  };
}

export function setSessionWorkbenchState(sessionGroupId, patch) {
  const root = getRoot();
  const store = ensureWorkbenchStore();
  const key = normalizeSessionGroupId(sessionGroupId);
  const current = getSessionWorkbenchState(key);
  const nextPatch = typeof patch === 'function' ? patch(current) : patch;
  const next = { ...current, ...(nextPatch || {}) };
  store[key] = next;
  root.dispatchEvent(new CustomEvent(workbenchEventName(key), { detail: next }));
  return next;
}

export function subscribeSessionWorkbenchState(sessionGroupId, callback) {
  const root = getRoot();
  const key = normalizeSessionGroupId(sessionGroupId);
  const handler = (event) => callback(event.detail);
  callback(getSessionWorkbenchState(key));
  root.addEventListener(workbenchEventName(key), handler);
  return () => root.removeEventListener(workbenchEventName(key), handler);
}

export function getSessionUploadQueue(sessionGroupId) {
  const store = ensureUploadQueueStore();
  const key = normalizeSessionGroupId(sessionGroupId);
  return Array.isArray(store[key]) ? store[key] : [];
}

export function updateSessionUploadQueue(sessionGroupId, updater) {
  const root = getRoot();
  const store = ensureUploadQueueStore();
  const key = normalizeSessionGroupId(sessionGroupId);
  const current = getSessionUploadQueue(key);
  const next = typeof updater === 'function' ? updater(current) : updater;
  store[key] = Array.isArray(next) ? next : [];
  root.dispatchEvent(new CustomEvent(uploadQueueEventName(key), { detail: store[key] }));
  return store[key];
}

export function subscribeSessionUploadQueue(sessionGroupId, callback) {
  const root = getRoot();
  const key = normalizeSessionGroupId(sessionGroupId);
  const handler = (event) => callback(event.detail);
  callback(getSessionUploadQueue(key));
  root.addEventListener(uploadQueueEventName(key), handler);
  return () => root.removeEventListener(uploadQueueEventName(key), handler);
}
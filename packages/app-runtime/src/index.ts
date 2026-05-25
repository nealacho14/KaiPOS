// Context — providers and hooks for app-wide state (auth, branch, websocket).
export {
  AuthProvider,
  useAuth,
  type AuthContextValue,
  type AuthStatus,
  type AuthBusiness,
} from './context/AuthContext.js';
export { ActiveBranchProvider, useActiveBranchContext } from './context/ActiveBranchContext.js';
export {
  WebSocketProvider,
  useWebSocketContext,
  type WebSocketContextValue,
  type WebSocketProviderProps,
} from './context/WebSocketContext.js';

// Lib — the HTTP client, session storage, and the raw websocket client.
export {
  api,
  apiJson,
  apiJsonPaginated,
  ApiError,
  setAuthFailureHandler,
  resetAuthFailureHandlerForTests,
  type Pagination,
  type PaginatedResult,
} from './lib/api.js';
export {
  clearSession,
  getSession,
  setSession,
  getSelectedBusinessId,
  setSelectedBusinessId,
  onSessionChange,
  type SessionUser,
  type StoredSession,
} from './lib/auth-storage.js';
export {
  WSClient,
  type WSClientOptions,
  type WSClientStatus,
  type WSClientEventMap,
} from './lib/ws-client.js';

// Hooks — derived consumers of the contexts and lib.
export {
  useActiveBranch,
  ACTIVE_BRANCH_STORAGE_KEY,
  type UseActiveBranchResult,
} from './hooks/useActiveBranch.js';
export { useBranches, type BranchOption, type UseBranchesResult } from './hooks/useBranches.js';
export { useWebSocket, type UseWebSocketResult } from './hooks/useWebSocket.js';

// Guards — route-level gates that read auth context.
export { RequireAuth } from './guards/RequireAuth.js';
export { RequirePermission, type RequirePermissionProps } from './guards/RequirePermission.js';

// Components — header-level controls that consume the runtime hooks. They
// live here (not in @kaipos/ui) because @kaipos/ui is meant to stay free of
// app state; these primitives are inherently stateful.
export {
  ActiveBranchSwitcher,
  type ActiveBranchSwitcherProps,
} from './components/ActiveBranchSwitcher.js';
export { BusinessPicker } from './components/BusinessPicker.js';
export { UserMenu } from './components/UserMenu.js';

// Message contracts between VS Code extension host and webview.
// These define the communication protocol.

import { QueryResults } from './domain';
import { SavedQuery } from '../features/savedQueries/types';
import { Favorite } from '../features/favorites/types';

// Discriminated union for messages from extension -> webview
export type ExtensionToWebviewMessage =
  | { type: 'savedQueries'; data: SavedQuery[]; source: 'aws' | 'local'; error?: string; savedId?: string }
  | { type: 'logGroupsList'; data: string[] }
  | { type: 'logGroupsListError'; error: string }
  | { type: 'favorites'; data: Favorite[] }
  | { type: 'queryStatus'; data: { status: string } }
  | { type: 'queryResult'; data: QueryResults }
  | { type: 'queryPartialResult'; data: QueryResults }
  | { type: 'queryError'; error: string }
  | { type: 'lastQuery'; query: string | undefined }
  | { type: 'toggleComment' };

// Discriminated union for messages from webview -> extension
export type WebviewToExtensionMessage =
  | { type: 'runQuery'; data: { logGroups: string[]; region?: string; query: string; startTime: number; endTime: number } }
  | { type: 'abortQuery' }
  | { type: 'getSavedQueries'; region?: string }
  | { type: 'saveQuery'; data: { id: string; name: string; query: string; logGroups: string[] }; region?: string }
  | { type: 'deleteQuery'; id: string; region?: string }
  | { type: 'listLogGroups'; region?: string; prefix?: string }
  | { type: 'getFavorites' }
  | { type: 'addFavorite'; data: Favorite }
  | { type: 'removeFavorite'; name: string; region: string }
  | { type: 'debugLog'; message: string }
  | { type: 'updateLastQuery'; query: string };

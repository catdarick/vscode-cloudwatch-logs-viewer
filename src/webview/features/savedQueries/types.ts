// Saved queries feature types.
// Note: This should be the canonical definition used throughout the app.

export interface SavedQuery {
  id: string;
  name: string;
  query: string;
  logGroups: string[];
}

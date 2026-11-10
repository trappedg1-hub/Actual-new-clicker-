# Save recovery

IndexedDB saves are versioned. If a record cannot be migrated, `GameRepository` first copies the original value and reason to the `backups` object store, then clears only the active slot so the app can start a new v0.1 save. Manual export is available from the settings control as a JSON backup.

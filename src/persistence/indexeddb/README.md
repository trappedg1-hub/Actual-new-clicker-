# IndexedDB persistence

The repository stores one versioned active save and a separate recovery-backup store. Currency, affection, progression, upgrades, the InkJS runtime state and the last-save timestamp are committed together in one read-write transaction.

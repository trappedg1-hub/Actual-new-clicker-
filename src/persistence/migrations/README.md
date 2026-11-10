# Save migrations

`migrateSave` is the single boundary that turns untrusted structured-clone data into the current `GameState`. When a later release changes the schema, add an explicit migration path here; do not cast old records directly to the new type.

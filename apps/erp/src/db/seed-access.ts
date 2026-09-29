// Reference data is seeded idempotently by scripts/migrate.mjs.
// First Owner is created through the one-time /setup flow; never by a fixed email.
throw new Error("Use npm run db:migrate, then /setup");

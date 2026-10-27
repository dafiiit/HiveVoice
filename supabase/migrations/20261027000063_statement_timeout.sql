-- No query of the app runs for ever: a statement that takes longer than 30 s is stopped (the pages ask for 20 s themselves, see
-- src/lib/db.ts), and waiting for a lock for more than 15 s ends. A page can no longer hang for minutes on a stuck connection.
alter role hivevoice_app set statement_timeout = '30s';
alter role hivevoice_app set lock_timeout = '15s';

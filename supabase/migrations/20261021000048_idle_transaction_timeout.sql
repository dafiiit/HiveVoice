-- A transaction of the app that waits more than 30 seconds without sending anything is ended by the server.
-- The transaction pooler sometimes leaves one hanging right after "begin"; until now that blocked the
-- connection pool of a server instance for minutes. No request of the app idles that long inside a transaction.
alter role hivevoice_app set idle_in_transaction_session_timeout = '30s';

CREATE TABLE IF NOT EXISTS app_users (
  id VARCHAR(64) PRIMARY KEY,
  username VARCHAR(80) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP(6) NOT NULL
);
CREATE TABLE IF NOT EXISTS auth_sessions (
  token_hash VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  expires_at TIMESTAMP(6) NOT NULL,
  FOREIGN KEY (user_id) REFERENCES app_users(id)
);
CREATE TABLE IF NOT EXISTS trade_records (
  id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  idempotency_key VARCHAR(100) NOT NULL,
  request_hash VARCHAR(64) NOT NULL,
  symbol VARCHAR(24) NOT NULL,
  request_json LONGTEXT NOT NULL,
  analysis_status VARCHAR(16) NOT NULL,
  last_error VARCHAR(255),
  created_at TIMESTAMP(6) NOT NULL,
  UNIQUE (user_id, idempotency_key),
  FOREIGN KEY (user_id) REFERENCES app_users(id)
);
CREATE TABLE IF NOT EXISTS trade_executions (
  trade_id VARCHAR(64) NOT NULL,
  sequence_no INT NOT NULL,
  execution_id VARCHAR(100) NOT NULL,
  side VARCHAR(4) NOT NULL,
  recorded_time VARCHAR(40) NOT NULL,
  price LONGTEXT NOT NULL,
  quantity BIGINT NOT NULL,
  reason VARCHAR(1000),
  PRIMARY KEY (trade_id, execution_id),
  UNIQUE (trade_id, sequence_no),
  FOREIGN KEY (trade_id) REFERENCES trade_records(id)
);
CREATE TABLE IF NOT EXISTS ai_reports (
  trade_id VARCHAR(64) PRIMARY KEY,
  user_id VARCHAR(64) NOT NULL,
  analysis_mode VARCHAR(16) NOT NULL,
  result_json LONGTEXT NOT NULL,
  created_at TIMESTAMP(6) NOT NULL,
  FOREIGN KEY (trade_id) REFERENCES trade_records(id),
  FOREIGN KEY (user_id) REFERENCES app_users(id)
);

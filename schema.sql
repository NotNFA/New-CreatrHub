PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('creator','client')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS creator_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  category TEXT NOT NULL DEFAULT 'UI/UX Designer',
  experience_years INTEGER NOT NULL DEFAULT 0,
  qualifications TEXT DEFAULT '',
  skills TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  portfolio_url TEXT DEFAULT '',
  social_url TEXT DEFAULT '',
  socials_json TEXT DEFAULT '{}',
  sample_works TEXT DEFAULT '',
  work_mode TEXT DEFAULT 'Part-time',
  expected_salary TEXT DEFAULT '',
  hourly_rate INTEGER DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,
  rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS client_profiles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE,
  company TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  social_url TEXT DEFAULT '',
  rating REAL NOT NULL DEFAULT 0,
  rating_count INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS hiring_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_user_id INTEGER NOT NULL,
  creator_user_id INTEGER NOT NULL,
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  contact_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','declined','cancelled')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(client_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(creator_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_creator_category ON creator_profiles(category);
CREATE INDEX IF NOT EXISTS idx_hiring_creator ON hiring_requests(creator_user_id, status);
CREATE INDEX IF NOT EXISTS idx_hiring_client ON hiring_requests(client_user_id, status);

CREATE TABLE IF NOT EXISTS community_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  category TEXT NOT NULL,
  project_type TEXT DEFAULT '',
  description TEXT NOT NULL,
  budget TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(client_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS community_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  post_id INTEGER NOT NULL,
  client_user_id INTEGER NOT NULL,
  creator_user_id INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(post_id) REFERENCES community_posts(id) ON DELETE CASCADE,
  FOREIGN KEY(client_user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(creator_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_community_posts_category ON community_posts(category, created_at);
CREATE INDEX IF NOT EXISTS idx_community_messages_client ON community_messages(client_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_community_messages_creator ON community_messages(creator_user_id, created_at);

CREATE TABLE IF NOT EXISTS meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  requester_id INTEGER NOT NULL,
  receiver_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  purpose TEXT NOT NULL DEFAULT '',
  meeting_date TEXT NOT NULL,
  duration INTEGER NOT NULL,
  meeting_type TEXT NOT NULL DEFAULT 'video',
  status TEXT NOT NULL DEFAULT 'pending',
  zoom_meeting_id TEXT DEFAULT '',
  join_url TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(requester_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(receiver_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_meetings_requester ON meetings(requester_id,status);
CREATE INDEX IF NOT EXISTS idx_meetings_receiver ON meetings(receiver_id,status);

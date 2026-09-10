CREATE TABLE IF NOT EXISTS post_reactions (
  post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('like', 'save')),
  created_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id, kind)
);
CREATE INDEX IF NOT EXISTS post_reactions_user_kind_idx ON post_reactions(user_id, kind);
CREATE TABLE IF NOT EXISTS post_comments (
  id serial PRIMARY KEY,
  post_id integer NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
  text text NOT NULL CHECK (length(text) BETWEEN 1 AND 1000),
  request_id text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS post_comments_post_id_idx ON post_comments(post_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS post_comments_request_idx ON post_comments(user_id, request_id);

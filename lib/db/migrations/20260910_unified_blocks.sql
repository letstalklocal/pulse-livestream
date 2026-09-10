-- Keep legacy live moderation and account-block entry points consistent.
BEGIN;
INSERT INTO user_blocks(blocker_user_id,blocked_user_id,created_at)
 SELECT host_user_id,viewer_user_id,created_at FROM creator_blocks ON CONFLICT DO NOTHING;
INSERT INTO creator_blocks(host_user_id,viewer_user_id,created_at)
 SELECT blocker_user_id,blocked_user_id,created_at FROM user_blocks ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION sync_pulse_account_blocks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth() > 1 THEN RETURN NULL; END IF;
 IF TG_TABLE_NAME = 'user_blocks' THEN
  IF TG_OP = 'INSERT' THEN
   INSERT INTO creator_blocks(host_user_id,viewer_user_id,created_at) VALUES(NEW.blocker_user_id,NEW.blocked_user_id,NEW.created_at) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM creator_blocks WHERE host_user_id=OLD.blocker_user_id AND viewer_user_id=OLD.blocked_user_id;
  END IF;
 ELSE
  IF TG_OP = 'INSERT' THEN
   INSERT INTO user_blocks(blocker_user_id,blocked_user_id,created_at) VALUES(NEW.host_user_id,NEW.viewer_user_id,NEW.created_at) ON CONFLICT DO NOTHING;
  ELSE
   DELETE FROM user_blocks WHERE blocker_user_id=OLD.host_user_id AND blocked_user_id=OLD.viewer_user_id;
  END IF;
 END IF;
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS pulse_sync_account_block ON user_blocks;
CREATE TRIGGER pulse_sync_account_block AFTER INSERT OR DELETE ON user_blocks FOR EACH ROW EXECUTE FUNCTION sync_pulse_account_blocks();
DROP TRIGGER IF EXISTS pulse_sync_live_block ON creator_blocks;
CREATE TRIGGER pulse_sync_live_block AFTER INSERT OR DELETE ON creator_blocks FOR EACH ROW EXECUTE FUNCTION sync_pulse_account_blocks();
COMMIT;

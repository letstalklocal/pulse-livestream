BEGIN;
CREATE TABLE IF NOT EXISTS notification_history (
 id serial PRIMARY KEY,
 recipient_user_id integer NOT NULL REFERENCES users(uid) ON DELETE CASCADE,
 source_key text NOT NULL,
 actor_user_id integer REFERENCES users(uid) ON DELETE SET NULL,
 category text NOT NULL, title text NOT NULL, body text NOT NULL, route text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), read_at timestamptz,
 UNIQUE(recipient_user_id, source_key)
);
CREATE INDEX IF NOT EXISTS notification_history_recipient_id ON notification_history(recipient_user_id, id DESC);
CREATE OR REPLACE FUNCTION record_notification(recipient integer, source text, actor integer, category text, title text, body text, route text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF recipient IS NULL OR recipient=actor OR EXISTS(SELECT 1 FROM user_blocks WHERE (blocker_user_id=recipient AND blocked_user_id=actor) OR (blocker_user_id=actor AND blocked_user_id=recipient)) THEN RETURN; END IF;
 INSERT INTO notification_history(recipient_user_id,source_key,actor_user_id,category,title,body,route)
 VALUES(recipient,source,actor,category,title,coalesce(body,''),route) ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION capture_notification_history() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE recipient integer; payment record;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'direct_messages' THEN
  PERFORM record_notification(NEW.to_user_id,'dm:'||NEW.id,NEW.from_user_id,
   CASE WHEN NEW.kind='private_stream_invitation' THEN 'privateInvitations' ELSE 'messages' END,
   CASE WHEN NEW.kind='private_stream_invitation' THEN 'Private live invitation' ELSE 'New message' END,
   CASE WHEN NEW.kind='text' THEN left(NEW.text,140) WHEN NEW.kind='private_stream_invitation' THEN 'Invited you to a private live' ELSE 'Sent you media' END,'/dm/'||NEW.from_user_id);
 WHEN 'follows' THEN
  PERFORM record_notification(NEW.followed_id,'follow:'||NEW.follower_id||':'||extract(epoch from NEW.created_at),NEW.follower_id,'followers','New follower','Started following you','/profile/'||NEW.follower_id);
 WHEN 'post_comments' THEN
  SELECT owner_user_id INTO recipient FROM posts WHERE id=NEW.post_id;
  PERFORM record_notification(recipient,'comment:'||NEW.id,NEW.user_id,'posts','New comment',left(NEW.text,140),'/posts/'||recipient);
 WHEN 'post_reactions' THEN
  IF NEW.kind='like' THEN
   SELECT owner_user_id INTO recipient FROM posts WHERE id=NEW.post_id;
   PERFORM record_notification(recipient,'like:'||NEW.post_id||':'||NEW.user_id||':'||extract(epoch from NEW.created_at),NEW.user_id,'posts','New like','Liked your post','/posts/'||recipient);
  END IF;
 WHEN 'coin_transactions' THEN
  IF NEW.type='gift' AND NEW.channel_id IS NULL AND NEW.amount>0 AND NEW.from_user_id IS NOT NULL AND
   (nullif(NEW.gift_name,'') IS NOT NULL OR EXISTS(SELECT 1 FROM direct_media_purchases p JOIN direct_messages m ON m.id=p.message_id WHERE p.idempotency_key=NEW.idempotency_key AND p.buyer_user_id=NEW.from_user_id AND m.from_user_id=NEW.to_user_id AND m.to_user_id=NEW.from_user_id)) THEN
   PERFORM record_notification(NEW.to_user_id,'gift:'||NEW.id,NEW.from_user_id,'gifts','Gifts and earnings','You received '||NEW.amount||' coins in a DM','/dm/'||NEW.from_user_id);
  END IF;
 WHEN 'direct_media_purchases' THEN
  FOR payment IN SELECT c.* FROM coin_transactions c JOIN direct_messages m ON m.id=NEW.message_id WHERE c.idempotency_key=NEW.idempotency_key AND c.type='gift' AND c.channel_id IS NULL AND c.amount>0 AND c.from_user_id=NEW.buyer_user_id AND m.from_user_id=c.to_user_id AND m.to_user_id=c.from_user_id LOOP
   PERFORM record_notification(payment.to_user_id,'gift:'||payment.id,payment.from_user_id,'gifts','Gifts and earnings','You received '||payment.amount||' coins in a DM','/dm/'||payment.from_user_id);
  END LOOP;
 WHEN 'live_stream_sessions' THEN
  IF NOT NEW.is_private AND NEW.ended_at IS NULL THEN
   FOR recipient IN SELECT follower_id FROM follows WHERE followed_id=NEW.host_user_id AND NOT EXISTS(SELECT 1 FROM creator_blocks b WHERE b.host_user_id=NEW.host_user_id AND b.viewer_user_id=follower_id) LOOP
    PERFORM record_notification(recipient,'live:'||NEW.id,NEW.host_user_id,'live',CASE WHEN NEW.required_gift_id IS NULL THEN 'Live now' ELSE 'Premium live' END,left(NEW.title,140),'/stream/'||NEW.channel_id);
   END LOOP;
  END IF;
 WHEN 'creator_videos' THEN
  IF NEW.status IN ('ready','failed') AND OLD.status IS DISTINCT FROM NEW.status THEN
   PERFORM record_notification(NEW.owner_user_id,'video-processing:'||NEW.id||':'||NEW.status,NULL,'videoProcessing',CASE WHEN NEW.status='ready' THEN 'Your video is ready' ELSE 'Video processing failed.' END,CASE WHEN NEW.status='ready' THEN 'Tap to preview your video and choose whether to show it in Discovery.' ELSE 'Open Your Video to remove it and try another upload.' END,'/go-live');
  END IF;
 END CASE;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS notification_history_capture ON direct_messages;
CREATE TRIGGER notification_history_capture AFTER INSERT ON direct_messages FOR EACH ROW EXECUTE FUNCTION capture_notification_history();
DROP TRIGGER IF EXISTS notification_history_capture ON follows;
CREATE TRIGGER notification_history_capture AFTER INSERT ON follows FOR EACH ROW EXECUTE FUNCTION capture_notification_history();
DROP TRIGGER IF EXISTS notification_history_capture ON post_comments;
CREATE TRIGGER notification_history_capture AFTER INSERT ON post_comments FOR EACH ROW EXECUTE FUNCTION capture_notification_history();
DROP TRIGGER IF EXISTS notification_history_capture ON post_reactions;
CREATE TRIGGER notification_history_capture AFTER INSERT ON post_reactions FOR EACH ROW EXECUTE FUNCTION capture_notification_history();
DROP TRIGGER IF EXISTS notification_history_capture ON coin_transactions;
CREATE TRIGGER notification_history_capture AFTER INSERT ON coin_transactions FOR EACH ROW EXECUTE FUNCTION capture_notification_history();
DROP TRIGGER IF EXISTS notification_history_capture ON direct_media_purchases;
CREATE TRIGGER notification_history_capture AFTER INSERT ON direct_media_purchases FOR EACH ROW EXECUTE FUNCTION capture_notification_history();
DROP TRIGGER IF EXISTS notification_history_capture ON live_stream_sessions;
CREATE TRIGGER notification_history_capture AFTER INSERT ON live_stream_sessions FOR EACH ROW EXECUTE FUNCTION capture_notification_history();
DROP TRIGGER IF EXISTS notification_history_capture ON creator_videos;
CREATE TRIGGER notification_history_capture AFTER UPDATE OF status ON creator_videos FOR EACH ROW EXECUTE FUNCTION capture_notification_history();
COMMIT;

BEGIN;
CREATE TABLE IF NOT EXISTS gift_collections (
 id text PRIMARY KEY, name text NOT NULL, sort_order integer NOT NULL DEFAULT 0,
 locked boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gift_assets (
 id text PRIMARY KEY, owner_clerk_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('thumbnail','animation','sound')),
 format text NOT NULL, object_path text NOT NULL UNIQUE, sha256 text NOT NULL, byte_size integer NOT NULL CHECK(byte_size>0),
 duration_ms integer, width integer, height integer, audio_asset_id text REFERENCES gift_assets(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS catalog_gifts (
 id text PRIMARY KEY, collection_id text NOT NULL REFERENCES gift_collections(id), sort_order integer NOT NULL DEFAULT 0,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 current_revision_id text, draft_revision_id text, legacy boolean NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS gift_revisions (
 id text PRIMARY KEY, gift_id text NOT NULL REFERENCES catalog_gifts(id), name text NOT NULL, emoji text NOT NULL DEFAULT '',
 coin_cost integer NOT NULL CHECK(coin_cost>0), thumbnail_asset_id text REFERENCES gift_assets(id),
 android_asset_id text REFERENCES gift_assets(id), ios_asset_id text REFERENCES gift_assets(id), sound_asset_id text REFERENCES gift_assets(id),
 framing jsonb NOT NULL DEFAULT '{"preset":"contained","scale":1,"x":0,"y":0}',
 created_by text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS gift_revision_publications (revision_id text PRIMARY KEY REFERENCES gift_revisions(id), published_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS gift_catalog_state (id integer PRIMARY KEY CHECK(id=1), version bigint NOT NULL DEFAULT 1);
ALTER TABLE gift_revisions ADD COLUMN IF NOT EXISTS collection_id text REFERENCES gift_collections(id);
ALTER TABLE gift_revisions ADD COLUMN IF NOT EXISTS sort_order integer;
INSERT INTO gift_catalog_state(id) VALUES(1) ON CONFLICT DO NOTHING;
INSERT INTO gift_collections(id,name,sort_order,locked,status) VALUES ('popular','Popular',0,true,'published'),('luxury','Luxury',1,false,'published') ON CONFLICT DO NOTHING;
INSERT INTO catalog_gifts(id,collection_id,sort_order,status,current_revision_id,legacy)
 SELECT id,collection_id,ord,'published',id||'_legacy_v1',true FROM (VALUES
 ('rose','popular',0),('heart','popular',1),('party','popular',2),('strawberry','popular',3),('diamond','popular',4),('lips','popular',5),('rocket','popular',6),('crown','popular',7),('kisses','luxury',0),('luxury_rocket','luxury',1),('dragon','luxury',2)) AS v(id,collection_id,ord) ON CONFLICT DO NOTHING;
INSERT INTO gift_revisions(id,gift_id,name,emoji,coin_cost,created_by,framing)
 SELECT id||'_legacy_v1',id,name,emoji,cost,'migration',CASE WHEN id='luxury_rocket' THEN '{"preset":"fullscreen","scale":1.12,"x":0,"y":-0.1}'::jsonb WHEN cost>500 THEN '{"preset":"fullscreen","scale":1,"x":0,"y":0}'::jsonb ELSE '{"preset":"contained","scale":1,"x":0,"y":0}'::jsonb END FROM (VALUES
 ('rose','Rose','🌹',1),('heart','Heart','❤️',5),('party','Party','🎉',10),('strawberry','Strawberry','🍓',49),('diamond','Diamond','💎',50),('lips','Lips','💋',99),('rocket','Rocket','🚀',100),('crown','Crown','👑',500),('kisses','Kisses','💋',1999),('luxury_rocket','Blast Off','🚀',4999),('dragon','Dragon','🐉',9999)) AS v(id,name,emoji,cost) ON CONFLICT DO NOTHING;
INSERT INTO gift_revision_publications(revision_id) SELECT current_revision_id FROM catalog_gifts WHERE current_revision_id IS NOT NULL ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION prevent_gift_revision_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Gift revisions and assets are immutable'; END $$;
DROP TRIGGER IF EXISTS gift_revisions_immutable ON gift_revisions;
CREATE TRIGGER gift_revisions_immutable BEFORE UPDATE OR DELETE ON gift_revisions FOR EACH ROW EXECUTE FUNCTION prevent_gift_revision_mutation();
DROP TRIGGER IF EXISTS gift_assets_immutable ON gift_assets;
CREATE TRIGGER gift_assets_immutable BEFORE UPDATE OR DELETE ON gift_assets FOR EACH ROW EXECUTE FUNCTION prevent_gift_revision_mutation();
COMMIT;

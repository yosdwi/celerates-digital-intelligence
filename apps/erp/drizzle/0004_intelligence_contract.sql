ALTER TABLE sales_opportunity_trackers ADD COLUMN intelligence_version bigint NOT NULL DEFAULT 1;
CREATE TABLE intelligence_record_grants (
  resource_id uuid PRIMARY KEY, enabled boolean NOT NULL DEFAULT true,
  granted_by uuid NOT NULL REFERENCES users(id), granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE intelligence_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), principal text NOT NULL,
  request_key text NOT NULL, request_hash text NOT NULL,
  resource_id uuid NOT NULL REFERENCES sales_opportunity_trackers(id), source_version bigint NOT NULL,
  manifest jsonb NOT NULL, manifest_sha256 text NOT NULL,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','approved','rejected','consumed')),
  reviewed_by uuid REFERENCES users(id), reviewed_at timestamptz, review_note text,
  expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(principal,request_key)
);
CREATE TABLE intelligence_commands (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), principal text NOT NULL,
  idempotency_key text NOT NULL, request_hash text NOT NULL, review_id uuid NOT NULL REFERENCES intelligence_reviews(id),
  resource_id uuid NOT NULL, receipt jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(principal,idempotency_key), UNIQUE(review_id)
);
CREATE TABLE intelligence_artifact_references (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), resource_id uuid NOT NULL REFERENCES sales_opportunity_trackers(id),
  review_id uuid NOT NULL UNIQUE REFERENCES intelligence_reviews(id), command_id uuid NOT NULL UNIQUE REFERENCES intelligence_commands(id) DEFERRABLE INITIALLY DEFERRED,
  run_id uuid NOT NULL, manifest_sha256 text NOT NULL, manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(resource_id,run_id)
);
CREATE TABLE intelligence_outbox (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, event_id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  event_type text NOT NULL, resource_id uuid NOT NULL, resource_version bigint NOT NULL,
  data jsonb NOT NULL DEFAULT '{}', occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_intelligence_reviews_pending ON intelligence_reviews(state,created_at);
CREATE INDEX idx_intelligence_outbox_resource ON intelligence_outbox(resource_id,sequence);
CREATE INDEX idx_intelligence_artifact_resource ON intelligence_artifact_references(resource_id,created_at);
-- Lock before sequence allocation and hold until commit. Consumers cannot skip a
-- lower uncommitted publication sequence; rollback gaps do not represent events.
CREATE FUNCTION intelligence_outbox_order() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN PERFORM pg_advisory_xact_lock(827342); RETURN NEW; END $$;
CREATE TRIGGER intelligence_outbox_order BEFORE INSERT ON intelligence_outbox
  FOR EACH STATEMENT EXECUTE FUNCTION intelligence_outbox_order();
CREATE FUNCTION intelligence_tracker_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='UPDATE' THEN NEW.intelligence_version:=OLD.intelligence_version+1; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER intelligence_tracker_version BEFORE UPDATE ON sales_opportunity_trackers
  FOR EACH ROW EXECUTE FUNCTION intelligence_tracker_version();
CREATE FUNCTION intelligence_tracker_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP='DELETE' THEN
    INSERT INTO intelligence_outbox(event_type,resource_id,resource_version) VALUES ('sales_opportunity.deleted.v1',OLD.id,OLD.intelligence_version+1);
    RETURN OLD;
  END IF;
  INSERT INTO intelligence_outbox(event_type,resource_id,resource_version) VALUES ('sales_opportunity.changed.v1',NEW.id,NEW.intelligence_version);
  RETURN NEW;
END $$;
CREATE TRIGGER intelligence_tracker_event AFTER INSERT OR UPDATE OR DELETE ON sales_opportunity_trackers
  FOR EACH ROW EXECUTE FUNCTION intelligence_tracker_event();

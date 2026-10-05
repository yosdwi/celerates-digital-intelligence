-- Sales Wave 1: enforce one downstream Requisition and one PQ Tracker per Sales Opportunity Tracker.
-- PostgreSQL unique indexes allow multiple NULL values, so direct/manual downstream rows without an upstream
-- sales_opportunity_tracker remain valid.

DO $$
BEGIN
  IF EXISTS (
    SELECT opportunity_id
    FROM requisitions
    WHERE opportunity_id IS NOT NULL
    GROUP BY opportunity_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce Sales handoff uniqueness: duplicate requisitions.opportunity_id found';
  END IF;

  IF EXISTS (
    SELECT opportunity_tracker_id
    FROM opportunities
    WHERE opportunity_tracker_id IS NOT NULL
    GROUP BY opportunity_tracker_id
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce Sales handoff uniqueness: duplicate opportunities.opportunity_tracker_id found';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_requisitions_opportunity
  ON requisitions(opportunity_id);

DROP INDEX IF EXISTS idx_opportunities_opportunity_tracker;
CREATE UNIQUE INDEX IF NOT EXISTS uq_opportunities_opportunity_tracker
  ON opportunities(opportunity_tracker_id);

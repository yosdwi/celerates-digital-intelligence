from datetime import datetime, timezone
from pathlib import Path

from .api import decide, review_pack
from .config import settings
from .contracts import Decision, ReviewPack
from .db import connect, json, one
from .documents import register
from .workflow import enqueue, execute

ROOT = Path(__file__).resolve().parents[3]


def seed():
    if settings().erp_mode != "demo":
        raise ValueError("Seed is available only with ERP_MODE=demo")
    stamp = datetime.now(timezone.utc).isoformat()
    data = {
        "opportunity": [
            {
                "id": "OPP-001",
                "title": "Digital operations workspace",
                "customer": "Nusantara Logistics",
                "owner": "Aditya · Pre-Sales",
                "stage": "Discovery",
                "status": "NEW",
                "timeline": "Phased pilot",
                "notes": "Unify service requests, delivery tracking and ERP context in one operational workspace.",
                "source": "Demo ERP",
            },
            {
                "id": "OPP-002",
                "title": "Talent capacity planning",
                "customer": "Aruna Financial Services",
                "owner": "Nadia · Pre-Sales",
                "stage": "Qualification",
                "status": "NEW",
                "timeline": "",
                "notes": "Visibility into allocation and capability gaps. Sales is collecting acceptance and integration details.",
                "source": "Demo ERP",
            },
            {
                "id": "OPP-003",
                "title": "Customer service intelligence",
                "customer": "Sagara Manufacturing",
                "owner": "Aditya · Pre-Sales",
                "stage": "Solution discussion",
                "status": "NEW",
                "timeline": "Discovery before delivery commitment",
                "notes": "A reviewed pilot proposal for evidence-backed service handling.",
                "source": "Demo ERP",
            },
        ],
        "capability": [
            {
                "id": "CAP-PY",
                "name": "Python integration",
                "available": 2,
                "constraint": "Subject to allocation confirmation by Delivery",
                "as_of": stamp,
            },
            {
                "id": "CAP-REACT",
                "name": "React web engineering",
                "available": 3,
                "constraint": "Shared with existing project commitments",
                "as_of": stamp,
            },
            {
                "id": "CAP-QA",
                "name": "Quality assurance",
                "available": 1,
                "constraint": "Pilot test window must be booked",
                "as_of": stamp,
            },
        ],
        "project": [
            {
                "id": "PRJ-ERP-01",
                "name": "Service operations portal",
                "domain": "Enterprise services",
                "skills": ["Python", "React", "ERP"],
                "lesson": "Agree record ownership and API contracts before integration delivery.",
            },
            {
                "id": "PRJ-DATA-02",
                "name": "Workforce reporting foundation",
                "domain": "Managed services",
                "skills": ["Python", "allocation", "dashboard"],
                "lesson": "Keep availability calculations traceable to current allocation records.",
            },
        ],
        "exception": [
            {
                "id": "EX-001",
                "title": "BAST approval overdue",
                "object": "Operations Portal · Milestone 2",
                "age_days": 12,
                "threshold_days": 10,
                "invoice_value": 370000000,
                "owner": "PMO / Finance",
                "state": "Escalation due",
                "severity": "High",
                "blocker": "Client approval is still pending.",
                "impact": "Rp370 million of invoicing is waiting on milestone acceptance.",
                "next_action": "PMO reviews acceptance evidence with the client PIC.",
                "evidence": "Demo ERP · BAST-024 · pending for 12 days",
                "history": ["Acceptance evidence submitted", "PMO follow-up recorded; no client response"],
                "escalation": "PMO Manager if unresolved in 2 days",
            },
            {
                "id": "EX-002",
                "title": "Contract renewal needs a decision",
                "object": "Managed Services · Aruna",
                "age_days": 0,
                "threshold_days": 30,
                "invoice_value": 0,
                "owner": "Talent / Account Lead",
                "state": "Needs action",
                "severity": "Medium",
                "blocker": "Renewal intent is not recorded.",
                "impact": "Service continuity and allocation planning remain uncertain.",
                "next_action": "Confirm client renewal intent and update the ERP contract record.",
                "evidence": "Demo ERP · CTR-017 · 21 days to expiry",
                "history": ["Renewal reminder prepared for internal review"],
                "escalation": "Account Lead review this week",
            },
            {
                "id": "EX-003",
                "title": "Timesheet evidence incomplete",
                "object": "September closing · Delivery team",
                "age_days": 2,
                "threshold_days": 1,
                "invoice_value": 0,
                "owner": "PMO",
                "state": "Needs action",
                "severity": "Medium",
                "blocker": "3 timesheets are missing project approval.",
                "impact": "Closing review cannot be completed for the affected records.",
                "next_action": "Review the three exceptions together and route to the project approvers.",
                "evidence": "Demo ERP · TS-101, TS-104, TS-108 · missing approvals",
                "history": ["Grouped exception generated"],
                "escalation": "Include in PMO daily digest",
            },
        ],
        "case": [
            {
                "id": "HS-001",
                "requester": "Raka · Engineering",
                "category": "Timesheet",
                "question": "My project approver changed. Who approves this month?",
                "status": "Awaiting PIC",
                "pic": "Talent Operations",
                "route": "Human review",
                "context": "Current project allocation has a new approver; the closing record still references the previous PIC.",
                "evidence": "Demo ERP · allocation AL-031 / timesheet TS-104",
                "policy": "Timesheet policy v2 · approval follows active assignment.",
                "draft": "We are confirming your active project approver with PMO. Your submitted timesheet remains recorded; no resubmission is requested yet.",
                "next_action": "Confirm approver mapping with PMO before responding.",
            },
            {
                "id": "HS-002",
                "requester": "Dina · Analyst",
                "category": "People service",
                "question": "Where can I find the reimbursement checklist?",
                "status": "Resolved",
                "pic": "HR Service",
                "route": "Routine answer",
                "context": "A general policy question; no personal financial data is needed.",
                "evidence": "Demo knowledge · reimbursement policy v3",
                "policy": "Submit the claim form, receipt and manager approval to the designated service channel.",
                "draft": "Please prepare the claim form, receipt and manager approval. HR Service can help check the documents before submission.",
                "next_action": "Record the policy reference and resolved outcome.",
            },
        ],
    }
    with connect() as conn:
        for kind, items in data.items():
            for item in items:
                conn.execute(
                    "INSERT INTO demo_erp.objects(kind,id,data) VALUES (%s,%s,%s) ON CONFLICT DO NOTHING",
                    (kind, item["id"], json(item)),
                )
        conn.execute(
            "INSERT INTO ingestion_audit(id,source,connector,state,accepted,detail) VALUES ('seed-erp','Demo ERP read models','Python demo ERP adapter','READY',%s,%s) ON CONFLICT DO NOTHING",
            (
                sum(map(len, data.values())),
                json({"source": "Synthetic demonstration data; not actual Celerates operational records"}),
            ),
        )
    for oid, filename in [
        ("OPP-001", "tor-digital-operations.md"),
        ("OPP-002", "tor-capacity-planning.md"),
        ("OPP-003", "tor-digital-operations.md"),
    ]:
        with connect() as conn:
            exists = one(conn, "SELECT 1 FROM documents WHERE opportunity_id=%s", (oid,))
        if not exists:
            body = (ROOT / "samples" / filename).read_text()
            if oid == "OPP-003":
                body = body.replace("Nusantara Logistics", "Sagara Manufacturing").replace(
                    "Digital Operations Workspace", "Customer Service Intelligence"
                )
            register(oid, filename, body.encode(), "text/markdown")
    for oid, outcome in [("OPP-002", "CLARIFICATION_REQUIRED"), ("OPP-003", "READY_FOR_SALES")]:
        with connect() as conn:
            existing = one(
                conn, "SELECT state FROM runs WHERE opportunity_id=%s ORDER BY created_at DESC LIMIT 1", (oid,)
            )
        if existing:
            if existing["state"] == "FAILED":
                raise RuntimeError(
                    f"Seed scenario {oid} has a failed run; inspect its error and retry before continuing."
                )
            continue
        run = enqueue(oid)
        execute(run["id"])
        if outcome == "READY_FOR_SALES":
            with connect() as conn:
                artifacts = conn.execute("SELECT id,version FROM artifacts WHERE run_id=%s", (run["id"],)).fetchall()
            review_pack(
                run["id"],
                ReviewPack(
                    versions={a["id"]: a["version"] for a in artifacts},
                    note="Seed scenario: human reviewed discussion draft; commercial terms remain unquoted.",
                ),
                user="Demo seed reviewer",
            )
        decide(
            run["id"],
            Decision(outcome=outcome, note="Seed scenario: reviewed and recorded for demonstration."),
            user="Demo seed reviewer",
        )
        execute(run["id"])
    print("Seed ready: new, clarification-required and approved opportunities. Existing work preserved.")


if __name__ == "__main__":
    seed()

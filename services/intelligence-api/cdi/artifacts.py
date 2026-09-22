"""Evidence-bound deterministic pack builder. Narrative is the only model-owned field."""

import re
from datetime import datetime, timezone

from .gateway import ModelGateway

KINDS = [
    ("brief", "Opportunity Brief"),
    ("requirements", "Requirement Matrix"),
    ("clarifications", "Clarification List"),
    ("experience", "Relevant Experience"),
    ("capability", "Capability & Capacity Fit"),
    ("risks", "Risk & Assumption Register"),
    ("solution", "Solution Outline"),
    ("scope", "Scope Draft"),
    ("effort", "BOQ / Effort Draft"),
    ("proposal", "Proposal Draft"),
    ("actions", "Next Actions"),
]


def build_pack(opportunity, documents, capabilities, projects, retrieved):
    requirements = []
    combined = "\n".join(d["extracted_text"] for d in documents)
    for document in documents:
        for number, line in enumerate(document["extracted_text"].splitlines(), 1):
            line = line.strip().lstrip("#*- ").strip()
            if len(line) > 15 and not line.lower().startswith(("title:", "customer:")):
                requirements.append(
                    {
                        "requirement": line[:800],
                        "category": "Source requirement",
                        "priority": "Confirm with customer",
                        "state": "Source stated",
                        "evidence": f"{document['name']} · line {number}",
                        "notes": "",
                    }
                )
    requirements = requirements[:30]
    clarifications = []
    for term, question, reason in [
        ("acceptance:", "What are the measurable acceptance criteria?", "Defines the delivery sign-off boundary."),
        (
            "timeline:",
            "What delivery timeline and milestones are confirmed?",
            "Avoids an unapproved delivery commitment.",
        ),
        ("integration:", "Which systems, owners and API access are in scope?", "Confirms integration dependencies."),
        (
            "budget:",
            "What budget and approved commercial inputs can Sales provide?",
            "No rate or price may be invented.",
        ),
    ]:
        if term not in combined.lower():
            clarifications.append(
                {
                    "question": question,
                    "why_it_matters": reason,
                    "source_gap": f"Missing {term[:-1]}",
                    "owner": "Sales",
                    "state": "Open",
                    "answer": "",
                }
            )
    narrative, generation = ModelGateway().narrative(opportunity, requirements)
    timestamp = datetime.now(timezone.utc).isoformat()
    # Matching is conservative and explicitly explained; no invented historical projects.
    tokens = set(re.findall(r"\w+", (opportunity["title"] + " " + combined).lower()))
    relevant = [p for p in projects if tokens.intersection({str(s).lower() for s in p.get("skills", [])})]
    fit = [
        {
            "capability": c["name"],
            "fit": "Validate allocation before commitment",
            "available_capacity": str(c["available"]) + " people in demo ERP"
            if opportunity.get("source") == "Demo ERP"
            else str(c["available"]) + " people in ERP",
            "constraint": c["constraint"],
            "evidence": c["id"],
            "observed_at": c.get("as_of", timestamp),
        }
        for c in capabilities
    ]
    risk_rows = [
        {
            "item": "Unconfirmed requirements",
            "type": "Risk",
            "impact": "High" if clarifications else "Medium",
            "rationale": f"{len(clarifications)} missing fields detected by source rules.",
            "mitigation": "Resolve clarification items before approving the pack.",
            "owner": opportunity["owner"],
        },
        {
            "item": "Commercial commitment",
            "type": "Assumption",
            "impact": "High",
            "rationale": "No approved rate card has been provided.",
            "mitigation": "Finance must validate pricing separately; this draft contains no price.",
            "owner": "Finance",
        },
    ]
    content = {
        "brief": {
            "summary": opportunity.get("notes") or opportunity["title"],
            "rows": [
                {"field": "Customer", "value": opportunity["customer"], "source": "ERP opportunity"},
                {"field": "Owner", "value": opportunity["owner"], "source": "ERP opportunity"},
                {"field": "Objective", "value": opportunity["title"], "source": "ERP opportunity"},
                {
                    "field": "Timeline",
                    "value": opportunity.get("timeline") or "Unconfirmed",
                    "source": "ERP opportunity",
                },
                {
                    "field": "Completeness",
                    "value": f"{len(clarifications)} open clarification items",
                    "source": "Document rules",
                },
            ],
        },
        "requirements": {
            "summary": "Source statements preserved for human classification. Extraction does not confirm contractual scope.",
            "rows": requirements,
        },
        "clarifications": {
            "summary": "Resolve each open item with an answer, or return this pack to Sales for clarification.",
            "rows": clarifications,
        },
        "experience": {
            "summary": "Approved project records matched by capability keywords; relevance is not a delivery guarantee.",
            "rows": [
                {
                    "project": p["name"],
                    "domain": p["domain"],
                    "matching_capabilities": ", ".join(p["skills"]),
                    "relevance": "Shared capability keywords in source requirements",
                    "evidence": p["id"],
                    "lesson": p["lesson"],
                }
                for p in relevant
            ]
            or [
                {
                    "project": "No matching approved experience",
                    "domain": "Unconfirmed",
                    "matching_capabilities": "None",
                    "relevance": "Request curation from delivery team",
                    "evidence": "ERP project query",
                    "lesson": "Do not claim unsupported experience",
                }
            ],
        },
        "capability": {
            "summary": "A timestamped ERP read, never an AI estimate. Availability must be revalidated before staffing.",
            "rows": fit,
        },
        "risks": {"summary": "Explicit risks and assumptions requiring a human decision.", "rows": risk_rows},
        "solution": {
            "summary": narrative["solution"],
            "rows": [
                {"area": "Business capability", "approach": opportunity["title"], "basis": "Opportunity objective"},
                {
                    "area": "Integration",
                    "approach": "Use controlled APIs with validation and traceable outcomes.",
                    "basis": "Proposed approach; confirm at discovery",
                },
                {
                    "area": "Security",
                    "approach": "Confirm identity, role access, audit and retention with customer.",
                    "basis": "Design proposal",
                },
                {
                    "area": "Delivery",
                    "approach": "Discovery → pilot → acceptance → rollout",
                    "basis": "Draft delivery approach",
                },
            ],
        },
        "scope": {
            "summary": "Discussion scope; no commercial or schedule commitment.",
            "rows": [
                {
                    "boundary": "In scope",
                    "description": "Discovery, requirement mapping, integration design and a demonstrable pilot.",
                    "state": "Draft",
                },
                {
                    "boundary": "Out of scope",
                    "description": "Production migration and licensing unless explicitly agreed.",
                    "state": "Draft",
                },
                {
                    "boundary": "Dependency",
                    "description": "Customer access, source documents and a named acceptance owner.",
                    "state": "Confirm",
                },
                {
                    "boundary": "Acceptance",
                    "description": "A jointly approved requirement matrix and demonstration evidence.",
                    "state": "Draft",
                },
            ],
        },
        "effort": {
            "summary": "Work packages for estimation. Effort is explicitly unestimated until delivery review; no fabricated rates or totals.",
            "rows": [
                {
                    "work_package": p,
                    "role": r,
                    "effort": "To estimate",
                    "dependency": d,
                    "assumption": "Subject to scope and delivery review",
                    "pricing_source": "Not supplied; Finance required",
                }
                for p, r, d in [
                    ("Discovery", "Business Analyst", "Customer workshops"),
                    ("Solution & integration", "Solution Architect", "API and security review"),
                    ("Pilot delivery", "Engineering", "Approved solution scope"),
                    ("Validation & handover", "QA / Delivery Lead", "Acceptance criteria"),
                ]
            ],
        },
        "proposal": {
            "summary": narrative["proposal"],
            "rows": [
                {"section": "Executive intent", "draft": opportunity["title"], "basis": "ERP opportunity"},
                {
                    "section": "Proposed engagement",
                    "draft": "Discovery, solution validation and an acceptance-led pilot.",
                    "basis": "Solution / Scope drafts; review required",
                },
                {
                    "section": "Commercial terms",
                    "draft": "Not quoted. Finance approval required.",
                    "basis": "No approved pricing source",
                },
                {
                    "section": "Readiness",
                    "draft": "Human review required before Sales use.",
                    "basis": "Review checkpoint",
                },
            ],
        },
        "actions": {
            "summary": "A clear route from evidence to a Sales discussion.",
            "rows": [
                {
                    "action": "Review requirements and resolve source gaps",
                    "owner": opportunity["owner"],
                    "urgency": "Before approval",
                    "blocking": "Yes",
                    "state": "Open",
                },
                {
                    "action": "Validate staffing and commercial inputs",
                    "owner": "Delivery / Finance",
                    "urgency": "Before commitment",
                    "blocking": "Yes",
                    "state": "Open",
                },
                {
                    "action": "Prepare Sales discussion from reviewed pack",
                    "owner": "Sales",
                    "urgency": "After pack approval",
                    "blocking": "No",
                    "state": "Open",
                },
            ],
        },
    }
    provenance = [{"type": "document", "id": d["id"], "name": d["name"], "sha256": d["sha256"]} for d in documents]
    provenance += [
        {
            "type": "erp",
            "id": opportunity["id"],
            "name": "Opportunity · authoritative ERP read",
            "observed_at": timestamp,
        }
    ]
    provenance += [
        {"type": "erp", "id": c["id"], "name": c["name"], "observed_at": c.get("as_of", timestamp)}
        for c in capabilities
    ]
    provenance += [{"type": "erp", "id": p["id"], "name": p["name"]} for p in relevant]
    return [
        {
            "kind": k,
            "title": title,
            "content": content[k],
            "provenance": provenance,
            "generation": {
                **generation,
                "content_mode": "AI-assisted narrative + deterministic facts"
                if k in {"solution", "proposal"}
                else "deterministic source rules",
                "retrieved_chunk_ids": [r["id"] for r in retrieved],
            },
        }
        for k, title in KINDS
    ]

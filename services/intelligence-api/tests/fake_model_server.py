"""OpenAI-compatible stand-in for a chat model, for the disposable cross-stack harness only.

It lets the real Agent path run end to end (LiteLLM → HTTP → JSON → validation → tools → ERP) without a provider.
Its "policy" is a few fixed rules over the prompt; it is not a model and is never used outside tests.
"""

import json
import re
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


def decide(messages):
    first = json.loads(messages[1]["content"])
    question = first["question"].lower()
    evidence = "\n".join(
        json.loads(m["content"]).get("evidence", "")
        for m in messages[2:]
        if m["role"] == "user" and "evidence" in m["content"]
    )
    document = first.get("document")
    if document and question.startswith("ringkas berkas"):
        need = re.search(r"(PT [A-Za-z ]+?) membutuhkan (\d+) ([A-Za-z ]+?) mulai", document["passages"])
        if need:
            return {
                "proposal": {
                    "title": f"Permintaan tenaga kerja {need.group(1)}",
                    "items": [
                        {
                            "kind": "requisition.create",
                            "target": None,
                            "params": {
                                "client_name": need.group(1),
                                "position_name": need.group(3),
                                "headcount_target": int(need.group(2)),
                            },
                        }
                    ],
                }
            }
        return {"answer": "Berkas ini tidak memuat permintaan kerja [D1].", "cite": ["D1"]}
    record = re.search(r"\b(req-[\w-]+)", question)
    if "task" in question and record:
        if not evidence:
            return {"calls": [{"tool": "erp_search", "args": {"query": record.group(1).upper()}}]}
        hit = re.search(r"search hit: requisition id=([0-9a-f-]{36})", evidence)
        if not hit:
            return {"answer": "Record tersebut tidak ditemukan di ERP.", "cite": []}
        return {
            "proposal": {
                "title": f"Follow up {record.group(1).upper()}",
                "items": [
                    {
                        "kind": "task.create",
                        "target": {"type": "requisition", "id": hit.group(1)},
                        "params": {"title": f"Follow up {record.group(1).upper()}", "due_date": first["today"][:10]},
                    }
                ],
            }
        }
    if "recruiter" in question or "ditugasi" in question:
        rule = re.search(r"(S\d+): rule unassigned-requisitions '[^']+' \(ta\): (\d+) requisition", first["rules"])
        if not evidence:
            return {"calls": [{"tool": "knowledge_search", "args": {"query": "TA PIC requisition"}}]}
        sop = re.search(r"(E\d+): approved knowledge", evidence)
        cite = [rule.group(1)] + ([sop.group(1)] if sop else [])
        text = f"Ada {rule.group(2)} requisition yang belum punya TA PIC (recruiter) [{rule.group(1)}]."
        if sop:
            text += f" SOP meminta TA PIC ditetapkan sebelum sourcing [{sop.group(1)}]."
        return {"answer": text, "cite": cite}
    if "angka" in question:
        return {"answer": "Ada 987654 requisition.", "cite": []}  # ungrounded on purpose
    return {"answer": "Saya belum menemukan bukti untuk pertanyaan itu.", "cite": []}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        reply = decide(body["messages"])
        payload = {
            "id": "chatcmpl-fake",
            "object": "chat.completion",
            "created": 0,
            "model": body.get("model", "fake"),
            "choices": [
                {"index": 0, "finish_reason": "stop", "message": {"role": "assistant", "content": json.dumps(reply)}}
            ],
            "usage": {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120},
        }
        data = json.dumps(payload).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), Handler).serve_forever()

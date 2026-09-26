import base64

from cdi import gateway
from cdi.config import settings


def test_cloudflare_workers_ai_transcription_uses_native_run_endpoint(monkeypatch):
    cfg = settings()
    monkeypatch.setattr(cfg, "generation_mode", "litellm")
    monkeypatch.setattr(cfg, "agent_transcribe_model", "@cf/openai/whisper-large-v3-turbo")
    monkeypatch.setattr(
        cfg,
        "model_api_base",
        "https://api.cloudflare.com/client/v4/accounts/test-account/ai/v1",
    )
    monkeypatch.setattr(cfg, "model_api_key", "test-secret")
    monkeypatch.setattr(cfg, "agent_transcribe_language", "id")
    seen = {}

    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"success": True, "result": {"text": "  Halo   Celerates  "}}

    def post(url, *, headers, json, timeout):
        seen.update(url=url, headers=headers, json=json, timeout=timeout)
        return Response()

    monkeypatch.setattr(gateway.httpx, "post", post)
    text, metadata = gateway.transcribe(b"\x00\x01\x02", "speech.webm")

    assert text == "Halo Celerates"
    assert seen["url"] == (
        "https://api.cloudflare.com/client/v4/accounts/test-account/ai/run/@cf/openai/whisper-large-v3-turbo"
    )
    assert seen["headers"] == {"Authorization": "Bearer test-secret"}
    assert seen["json"] == {
        "audio": base64.b64encode(b"\x00\x01\x02").decode("ascii"),
        "task": "transcribe",
        "language": "id",
    }
    assert seen["timeout"] == 30
    assert metadata["model"] == "@cf/openai/whisper-large-v3-turbo"

from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "postgresql://celerates:celerates@localhost:5432/celerates"
    storage_backend: str = "s3"
    storage_path: str = ".data/objects"
    s3_endpoint: str = "http://localhost:9000"
    s3_access_key: str = "celerates"
    s3_secret_key: str = "celerates-local-only"
    s3_bucket: str = "intelligence"
    erp_mode: str = "demo"
    erp_base_url: str = ""
    erp_token: str = ""
    erp_action_token: str = ""
    erp_environment: str = "erp-pilot"
    intelligence_principals_json: str = "[]"
    api_principal_name: str = "pilot-owner"
    model_mode: str = "demo"
    # Split switches (default: follow model_mode). Generation can be enabled without re-embedding knowledge.
    generation_mode: str = ""
    embedding_mode: str = ""
    # Agent reasoning model alias (LiteLLM model string). Empty: the Agent stays deterministic.
    agent_model: str = ""
    agent_fast_model: str = ""
    # Push-to-talk transcription model (LiteLLM, e.g. openai/whisper-1). Empty: no voice input (ADR-012).
    agent_transcribe_model: str = ""
    agent_transcribe_language: str = "id"
    reasoning_model: str = "openai/reasoning-strong"
    fallback_model: str = ""
    embedding_model: str = "openai/embedding-default"
    model_api_base: str | None = None
    model_api_key: str | None = None
    api_access_token: str = ""
    langfuse_enabled: bool = False
    n8n_enabled: bool = False
    max_upload_bytes: int = 10 * 1024 * 1024
    worker_poll_seconds: float = 1
    lease_seconds: int = 600
    # ADR-008: public keys only (kid -> PEM). Intelligence can verify ERP delegation, never mint it.
    erp_delegation_public_keys: str = "{}"
    agent_max_seconds: float = 60
    agent_workers: int = 4
    agent_dataset_days: int = 30  # uploaded Agent datasets (may contain personal data) are purged after this
    agent_turn_days: int = 90  # model turns (prompts with evidence) kept for audit and replay evaluation
    # Models a curator may evaluate against the saved cases (comma-separated LiteLLM names), besides AGENT_MODEL.
    agent_eval_models: str = ""

    @field_validator("model_api_base", "model_api_key", mode="before")
    @classmethod
    def empty_optional(cls, value):
        return value or None

    def validate_modes(self):
        if self.erp_mode not in {"demo", "http"} or self.model_mode not in {"demo", "litellm"}:
            raise ValueError("Unsupported ERP/model mode")
        self.generation_mode = self.generation_mode or self.model_mode
        self.embedding_mode = self.embedding_mode or self.model_mode
        if self.generation_mode not in {"demo", "litellm"} or self.embedding_mode not in {"demo", "litellm"}:
            raise ValueError("Unsupported generation/embedding mode")
        if self.storage_backend not in {"s3", "filesystem"}:
            raise ValueError("Unsupported storage backend")
        if self.erp_mode == "http" and (
            not self.erp_base_url
            or not self.erp_token
            or not self.erp_action_token
            or not (self.api_access_token or self.intelligence_principals_json != "[]")
        ):
            raise ValueError(
                "Connected ERP requires endpoint, separate read/action credentials and named workspace access"
            )


@lru_cache
def settings():
    value = Settings()
    value.validate_modes()
    return value

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
    model_mode: str = "demo"
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

    @field_validator("model_api_base", "model_api_key", mode="before")
    @classmethod
    def empty_optional(cls, value):
        return value or None

    def validate_modes(self):
        if self.erp_mode not in {"demo", "http"} or self.model_mode not in {"demo", "litellm"}:
            raise ValueError("Unsupported ERP/model mode")
        if self.storage_backend not in {"s3", "filesystem"}:
            raise ValueError("Unsupported storage backend")
        if self.erp_mode == "http" and (not self.erp_base_url or not self.api_access_token):
            raise ValueError("Connected ERP requires ERP_BASE_URL and API_ACCESS_TOKEN")


@lru_cache
def settings():
    value = Settings()
    value.validate_modes()
    return value

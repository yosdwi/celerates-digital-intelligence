from typing import Literal

from pydantic import BaseModel, Field, field_validator


class OpportunityCreate(BaseModel):
    title: str = Field(min_length=3, max_length=180)
    customer: str = Field(min_length=2, max_length=140)
    owner: str = Field(min_length=2, max_length=100)
    timeline: str = Field(default="", max_length=160)
    notes: str = Field(default="", max_length=5000)

    @field_validator("title", "customer", "owner")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Must not be blank")
        return value.strip()


class DocumentRegister(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    text: str = Field(min_length=20, max_length=500_000)
    source_url: str | None = Field(default=None, max_length=1500)

    @field_validator("source_url")
    @classmethod
    def safe_url(cls, value):
        if value and not value.startswith(("https://", "http://")):
            raise ValueError("Reference URL must use HTTP or HTTPS")
        return value


class ArtifactContent(BaseModel):
    summary: str = Field(max_length=20000)
    rows: list[dict[str, str]] = Field(max_length=200)

    @field_validator("rows")
    @classmethod
    def bounded_cells(cls, value):
        if any(len(row) > 15 or any(len(k) > 100 or len(v) > 10000 for k, v in row.items()) for row in value):
            raise ValueError("Artifact cells exceed limits")
        return value


class ArtifactEdit(BaseModel):
    version: int = Field(ge=1)
    content: ArtifactContent


class ReviewPack(BaseModel):
    versions: dict[str, int]
    note: str = Field(min_length=5, max_length=2000)


class Decision(BaseModel):
    outcome: Literal["READY_FOR_SALES", "CLARIFICATION_REQUIRED"]
    note: str = Field(min_length=5, max_length=2000)


class ContextQuery(BaseModel):
    question: str = Field(min_length=3, max_length=1000)

from pathlib import Path
from typing import Protocol

import boto3
from botocore.exceptions import ClientError

from .config import settings


class ObjectStorage(Protocol):
    def put(self, key: str, body: bytes, media_type: str): ...
    def get(self, key: str) -> bytes: ...
    def healthy(self) -> bool: ...


class FileStorage:
    def path(self, key):
        root = Path(settings().storage_path).resolve()
        path = (root / key).resolve()
        if not path.is_relative_to(root):
            raise ValueError("Invalid object key")
        return path

    def put(self, key, body, media_type):
        path = self.path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_bytes(body)
        temporary.replace(path)

    def get(self, key):
        return self.path(key).read_bytes()

    def healthy(self):
        path = Path(settings().storage_path)
        path.mkdir(parents=True, exist_ok=True)
        return path.is_dir()


class S3Storage:
    def __init__(self):
        cfg = settings()
        self.bucket = cfg.s3_bucket
        self.client = boto3.client(
            "s3",
            endpoint_url=cfg.s3_endpoint,
            aws_access_key_id=cfg.s3_access_key,
            aws_secret_access_key=cfg.s3_secret_key,
        )

    def ensure(self):
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError as exc:
            if str(exc.response["Error"]["Code"]) not in {"404", "NoSuchBucket"}:
                raise
            self.client.create_bucket(Bucket=self.bucket)

    def put(self, key, body, media_type):
        self.ensure()
        self.client.put_object(Bucket=self.bucket, Key=key, Body=body, ContentType=media_type)

    def get(self, key):
        return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

    def healthy(self):
        self.ensure()
        return True


def storage() -> ObjectStorage:
    return FileStorage() if settings().storage_backend == "filesystem" else S3Storage()

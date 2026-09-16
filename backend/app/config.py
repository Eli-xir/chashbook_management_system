from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CASHBOOK_", env_file=".env", extra="ignore")

    env: str = "local"
    db_dsn: str = "postgresql://postgres:cashbook_local@localhost:5433/cashbook_dev"
    session_ttl_minutes: int = 720
    upload_dir: str = "./local_uploads"
    state_dir: str = ""
    storage_backend: str = "local"
    s3_bucket: str = ""
    aws_region: str = ""
    s3_prefix: str = ""
    backup_prefix: str = "backups"
    sms_provider: str = "mock"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    # "lax" for same-origin web deployments; "none" when the app runs on the
    # Capacitor android origin (https://localhost) or another cross-site origin.
    cookie_samesite: str = "lax"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def sms_mock_allowed(self) -> bool:
        # The mock provider is only legal in local configuration.
        return self.env == "local"


settings = Settings()

if settings.env != "local":
    if settings.sms_provider not in ("disabled", "sns"):
        raise RuntimeError("Production SMS must be explicitly disabled or configured as sns")
    if not settings.state_dir:
        raise RuntimeError("CASHBOOK_STATE_DIR must point to persistent storage")
    if settings.storage_backend != "s3" or not settings.s3_bucket or not settings.aws_region:
        raise RuntimeError("Production requires private S3 storage, bucket and AWS region")
    if any(not origin.startswith("https://") for origin in settings.cors_origin_list):
        raise RuntimeError("Production origins must use HTTPS")

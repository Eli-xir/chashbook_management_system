from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CASHBOOK_", env_file=".env", extra="ignore")

    env: str = "local"
    db_dsn: str = "postgresql://postgres:cashbook_local@localhost:5433/cashbook_dev"
    session_ttl_minutes: int = 720
    upload_dir: str = "./local_uploads"
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

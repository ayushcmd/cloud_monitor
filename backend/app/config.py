import os
import urllib.parse

KNOWN_DEV_JWT_SECRET = "cloudmonitor_dev_jwt_secret_key_change_in_prod_at_least_32_chars"
KNOWN_DEV_DB_PASSWORD = "cloudmonitor_secret"

JWT_PLACEHOLDER_SUBSTRINGS = (
    "replace_with",
    "change_in_prod",
    "placeholder",
    "your-secret",
    "secret_key_change",
    "changeme",
)

DB_PLACEHOLDER_SUBSTRINGS = (
    "replace_with",
    "cloudmonitor_secret",
    "placeholder",
    "password_for_validation",
    "changeme",
)

SUPPORTED_POSTGRES_SCHEMES = (
    "postgresql",
    "postgresql+psycopg2",
)

class Settings:
    def __init__(self):
        self.APP_NAME: str = os.getenv("APP_NAME", "CloudMonitor-API")
        self.APP_VERSION: str = os.getenv("APP_VERSION", "1.0.0")
        self.ENVIRONMENT: str = os.getenv("APP_ENV", "development")
        self.PORT: int = int(os.getenv("PORT", "8000"))
        self.HOST: str = os.getenv("HOST", "0.0.0.0")
        self.PROMETHEUS_URL: str = os.getenv("PROMETHEUS_URL", "http://prometheus:9090")
        self.CORS_ORIGINS: list = [
            origin.strip()
            for origin in os.getenv(
                "CORS_ORIGINS",
                "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000,http://127.0.0.1:3000,http://localhost:80,http://127.0.0.1:80"
            ).split(",")
            if origin.strip()
        ]

        # Database Configuration (PostgreSQL)
        self.DATABASE_URL: str = os.getenv(
            "DATABASE_URL",
            "postgresql://cloudmonitor:cloudmonitor_secret@postgres:5432/cloudmonitor"
        )

        # JWT Authentication Configuration
        self.JWT_SECRET_KEY: str = os.getenv(
            "JWT_SECRET_KEY",
            KNOWN_DEV_JWT_SECRET
        )
        self.JWT_ALGORITHM: str = os.getenv("JWT_ALGORITHM", "HS256")
        self.ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "60"))

        if self.is_production:
            self.validate_production_configuration()

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.lower() == "production"

    def validate_production_configuration(self) -> None:
        """
        Validates security-critical configuration in production mode (SEC-HIGH-02).
        Fails closed with a clear RuntimeError if secrets are missing, weak, or match dev defaults.
        Never prints or logs secret values.
        """
        # 1. Validate JWT_SECRET_KEY
        jwt_secret = (self.JWT_SECRET_KEY or "").strip()
        if not jwt_secret:
            raise RuntimeError(
                "Production configuration error: JWT_SECRET_KEY is missing or empty. "
                "Configure a secure random string of at least 32 characters in production."
            )

        if jwt_secret == KNOWN_DEV_JWT_SECRET:
            raise RuntimeError(
                "Production configuration error: Insecure development default detected for JWT_SECRET_KEY. "
                "The development fallback secret cannot be used in production."
            )

        lower_jwt = jwt_secret.lower()
        for placeholder in JWT_PLACEHOLDER_SUBSTRINGS:
            if placeholder in lower_jwt:
                raise RuntimeError(
                    f"Production configuration error: JWT_SECRET_KEY contains placeholder pattern '{placeholder}'. "
                    "Generate a cryptographically secure random secret (e.g., via 'openssl rand -hex 32')."
                )

        if len(jwt_secret) < 32:
            raise RuntimeError(
                f"Production configuration error: JWT_SECRET_KEY length ({len(jwt_secret)} characters) "
                "is below the minimum required length of 32 characters."
            )

        # 2. Validate DATABASE_URL
        raw_db_url = (self.DATABASE_URL or "").strip()
        if not raw_db_url:
            raise RuntimeError(
                "Production configuration error: DATABASE_URL is missing or empty. "
                "Configure an authenticated PostgreSQL connection URL in production."
            )

        try:
            parsed = urllib.parse.urlparse(raw_db_url)
        except Exception:
            raise RuntimeError(
                "Production configuration error: DATABASE_URL is not a well-formed URL."
            )

        scheme = (parsed.scheme or "").lower()
        if not scheme:
            raise RuntimeError(
                "Production configuration error: DATABASE_URL scheme is missing, invalid, or malformed. "
                f"Production requires an explicit supported PostgreSQL scheme: {', '.join(SUPPORTED_POSTGRES_SCHEMES)}."
            )

        if scheme not in SUPPORTED_POSTGRES_SCHEMES:
            raise RuntimeError(
                f"Production configuration error: DATABASE_URL scheme '{scheme}' is invalid or unsupported. "
                f"Production requires an explicit supported PostgreSQL scheme: {', '.join(SUPPORTED_POSTGRES_SCHEMES)}."
            )

        if not parsed.hostname:
            raise RuntimeError(
                "Production configuration error: DATABASE_URL is missing a database host."
            )

        raw_password = parsed.password or ""
        if not raw_password:
            raise RuntimeError(
                "Production configuration error: DATABASE_URL does not specify a password. "
                "Unauthenticated database connections are forbidden in production."
            )

        decoded_password = urllib.parse.unquote(raw_password)
        lower_pw = raw_password.lower()
        lower_decoded_pw = decoded_password.lower()

        if lower_pw == KNOWN_DEV_DB_PASSWORD or lower_decoded_pw == KNOWN_DEV_DB_PASSWORD:
            raise RuntimeError(
                "Production configuration error: Insecure development default password detected in DATABASE_URL. "
                "Change POSTGRES_PASSWORD and update DATABASE_URL in production."
            )

        for placeholder in DB_PLACEHOLDER_SUBSTRINGS:
            if placeholder in lower_pw or placeholder in lower_decoded_pw:
                raise RuntimeError(
                    f"Production configuration error: DATABASE_URL password contains placeholder pattern '{placeholder}'. "
                    "Set a secure production database password."
                )

settings = Settings()

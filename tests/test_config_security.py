import os
import pytest
from app.config import (
    Settings,
    KNOWN_DEV_JWT_SECRET,
    KNOWN_DEV_DB_PASSWORD,
    JWT_PLACEHOLDER_SUBSTRINGS,
    DB_PLACEHOLDER_SUBSTRINGS,
    SUPPORTED_POSTGRES_SCHEMES,
)

VALID_PROD_JWT = "d9e8c7b6a5f43210e1d2c3b4a5968778a0b1c2d3e4f5061728394a5b6c7d8e9f"
# Proper RFC 3986 PostgreSQL connection URL with alphanumeric and safe symbols
VALID_PROD_DB = "postgresql://prod_app_user:Str0ng_Pr0d_P4ssw0rd_987654321@db-cluster.internal:5432/cloudmonitor_production"


class TestProductionConfigValidation:
    """
    Tests verifying fail-closed configuration validation for Issue #12 (SEC-HIGH-02).
    Ensures that in production (APP_ENV=production), weak, missing, or default
    secrets halt application startup immediately.
    """

    def test_missing_or_empty_jwt_secret_rejected(self, monkeypatch):
        """Production must reject an empty or whitespace-only JWT_SECRET_KEY."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", VALID_PROD_DB)
        monkeypatch.setenv("JWT_SECRET_KEY", "")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "JWT_SECRET_KEY is missing or empty" in str(exc_info.value)

    def test_jwt_whitespace_only_rejected(self, monkeypatch):
        """Production must reject whitespace-only JWT_SECRET_KEY."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", VALID_PROD_DB)
        monkeypatch.setenv("JWT_SECRET_KEY", "   \t  \n  ")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "JWT_SECRET_KEY is missing or empty" in str(exc_info.value)

    def test_known_dev_jwt_secret_rejected(self, monkeypatch):
        """Production must reject the hardcoded development JWT secret fallback."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", VALID_PROD_DB)
        monkeypatch.setenv("JWT_SECRET_KEY", KNOWN_DEV_JWT_SECRET)

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "Insecure development default detected for JWT_SECRET_KEY" in str(exc_info.value)

    @pytest.mark.parametrize("placeholder", JWT_PLACEHOLDER_SUBSTRINGS)
    def test_placeholder_jwt_secret_rejected(self, monkeypatch, placeholder):
        """Production must reject common placeholder patterns in JWT_SECRET_KEY."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", VALID_PROD_DB)
        placeholder_key = f"valid_length_prefix_{placeholder}_extra_random_entropy_suffix_12345"
        monkeypatch.setenv("JWT_SECRET_KEY", placeholder_key)

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert f"JWT_SECRET_KEY contains placeholder pattern '{placeholder}'" in str(exc_info.value)

    def test_short_jwt_secret_rejected(self, monkeypatch):
        """Production must reject JWT secret keys shorter than 32 characters."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", VALID_PROD_DB)
        monkeypatch.setenv("JWT_SECRET_KEY", "too_short_secret_under_32_ch")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "below the minimum required length of 32 characters" in str(exc_info.value)

    def test_jwt_boundary_length_31_rejected(self, monkeypatch):
        """Production must reject secret key with exactly 31 characters."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", VALID_PROD_DB)
        monkeypatch.setenv("JWT_SECRET_KEY", "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p")  # 31 chars

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "below the minimum required length of 32 characters" in str(exc_info.value)

    def test_jwt_boundary_length_exact_32_accepted(self, monkeypatch):
        """Production must accept valid secret key with exactly 32 characters."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("DATABASE_URL", VALID_PROD_DB)
        monkeypatch.setenv("JWT_SECRET_KEY", "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6")  # 32 chars

        settings = Settings()
        assert settings.JWT_SECRET_KEY == "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"

    def test_missing_or_empty_database_url_rejected(self, monkeypatch):
        """Production must reject an empty DATABASE_URL."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        monkeypatch.setenv("DATABASE_URL", "")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "DATABASE_URL is missing or empty" in str(exc_info.value)

    def test_non_postgres_database_scheme_rejected(self, monkeypatch):
        """Production must reject SQLite or non-PostgreSQL databases."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        monkeypatch.setenv("DATABASE_URL", "sqlite:///./prod.db")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "scheme 'sqlite' is invalid or unsupported" in str(exc_info.value)

    @pytest.mark.parametrize("unsupported_scheme", [
        "postgres",
        "postgresql+asyncpg",
        "postgresql+psycopg",
        "postgresql+fake",
        "postgres-bad",
    ])
    def test_unsupported_valid_driver_schemes_rejected(self, monkeypatch, unsupported_scheme):
        """Production must reject syntactically valid but unsupported PostgreSQL driver schemes."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        monkeypatch.setenv("DATABASE_URL", f"{unsupported_scheme}://prod_user:StrongPassword123!@db-host:5432/cloudmonitor")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert f"scheme '{unsupported_scheme}' is invalid or unsupported" in str(exc_info.value)

    @pytest.mark.parametrize("malformed_scheme", [
        "postgres_unsupported",
        "postgresql_fake",
        "postgresql_invalid",
    ])
    def test_malformed_url_schemes_rejected(self, monkeypatch, malformed_scheme):
        """Production must reject syntactically malformed URL schemes (e.g. containing underscores)."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        monkeypatch.setenv("DATABASE_URL", f"{malformed_scheme}://prod_user:StrongPassword123!@db-host:5432/cloudmonitor")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        # Malformed URI schemes return empty string from urlparse; production validation must fail closed
        assert "scheme is missing, invalid, or malformed" in str(exc_info.value) or "invalid or unsupported" in str(exc_info.value)

    def test_unauthenticated_database_rejected(self, monkeypatch):
        """Production must reject database connections without a password."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        monkeypatch.setenv("DATABASE_URL", "postgresql://cloudmonitor@postgres:5432/cloudmonitor")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "does not specify a password" in str(exc_info.value)

    def test_database_missing_hostname_rejected(self, monkeypatch):
        """Production must reject database connection URL lacking a hostname."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        monkeypatch.setenv("DATABASE_URL", "postgresql://cloudmonitor:valid_password_123@/cloudmonitor")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "DATABASE_URL is missing a database host" in str(exc_info.value)

    def test_known_dev_db_password_rejected(self, monkeypatch):
        """Production must reject the development default password 'cloudmonitor_secret'."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        monkeypatch.setenv("DATABASE_URL", f"postgresql://cloudmonitor:{KNOWN_DEV_DB_PASSWORD}@postgres:5432/cloudmonitor")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "Insecure development default password detected in DATABASE_URL" in str(exc_info.value)

    @pytest.mark.parametrize("placeholder", DB_PLACEHOLDER_SUBSTRINGS)
    def test_placeholder_db_password_rejected(self, monkeypatch, placeholder):
        """Production must reject database passwords containing template placeholder words."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        monkeypatch.setenv("DATABASE_URL", f"postgresql://cloudmonitor:prefix_{placeholder}_suffix@postgres:5432/cloudmonitor")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert f"DATABASE_URL password contains placeholder pattern '{placeholder}'" in str(exc_info.value)

    def test_percent_encoded_placeholder_db_password_rejected(self, monkeypatch):
        """Production must reject percent-encoded placeholder words in password."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        # %63hangeme decodes to changeme
        monkeypatch.setenv("DATABASE_URL", "postgresql://cloudmonitor:prefix_%63hangeme_suffix@postgres:5432/cloudmonitor")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "DATABASE_URL password contains placeholder pattern 'changeme'" in str(exc_info.value)

    def test_valid_production_configuration_accepted(self, monkeypatch):
        """Production settings initialize smoothly when strong, valid secrets are supplied."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        monkeypatch.setenv("DATABASE_URL", VALID_PROD_DB)

        settings = Settings()
        assert settings.is_production is True
        assert settings.ENVIRONMENT == "production"
        assert settings.JWT_SECRET_KEY == VALID_PROD_JWT
        assert settings.DATABASE_URL == VALID_PROD_DB

    @pytest.mark.parametrize("scheme", SUPPORTED_POSTGRES_SCHEMES)
    def test_production_driver_scheme_accepted(self, monkeypatch, scheme):
        """Production settings accept all whitelisted driver-qualified PostgreSQL URLs."""
        monkeypatch.setenv("APP_ENV", "production")
        monkeypatch.setenv("JWT_SECRET_KEY", VALID_PROD_JWT)
        driver_db = f"{scheme}://prod_user:StrongPassword123!@db-host:5432/cloudmonitor"
        monkeypatch.setenv("DATABASE_URL", driver_db)

        settings = Settings()
        assert settings.is_production is True
        assert settings.DATABASE_URL == driver_db

    def test_production_case_insensitivity(self, monkeypatch):
        """APP_ENV=PRODUCTION (uppercase) still triggers production security validation."""
        monkeypatch.setenv("APP_ENV", "PRODUCTION")
        monkeypatch.setenv("DATABASE_URL", VALID_PROD_DB)
        monkeypatch.setenv("JWT_SECRET_KEY", "")

        with pytest.raises(RuntimeError) as exc_info:
            Settings()
        assert "JWT_SECRET_KEY is missing or empty" in str(exc_info.value)

    def test_development_mode_preserves_defaults(self, monkeypatch):
        """Development mode (APP_ENV=development) retains fallbacks and does not throw."""
        monkeypatch.delenv("APP_ENV", raising=False)
        monkeypatch.delenv("JWT_SECRET_KEY", raising=False)
        monkeypatch.delenv("DATABASE_URL", raising=False)

        settings = Settings()
        assert settings.is_production is False
        assert settings.ENVIRONMENT == "development"
        assert settings.JWT_SECRET_KEY == KNOWN_DEV_JWT_SECRET
        assert KNOWN_DEV_DB_PASSWORD in settings.DATABASE_URL

    def test_test_environment_bypasses_production_checks(self, monkeypatch):
        """CI / Test mode (APP_ENV=test) allows lightweight sqlite URLs without error."""
        monkeypatch.setenv("APP_ENV", "test")
        monkeypatch.setenv("JWT_SECRET_KEY", "ci_test_secret_key_at_least_32_characters_long_for_tests")
        monkeypatch.setenv("DATABASE_URL", "sqlite:///./test.db")

        settings = Settings()
        assert settings.is_production is False
        assert settings.ENVIRONMENT == "test"

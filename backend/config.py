from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Load backend/.env regardless of the process's working directory.
_ENV_FILE = Path(__file__).parent / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    env: str = "development"
    log_level: str = "INFO"

    # Public-deployment guards (both disabled by default — see utils/guard.py).
    api_access_key: str = ""      # if set, callers must send X-API-Key
    rate_limit_per_min: int = 0   # if > 0, per-IP cap on expensive endpoints
    # Web dev + Capacitor app origins (Android: https://localhost, iOS: capacitor://localhost).
    cors_origins: str = "http://localhost:5173,https://localhost,capacitor://localhost,http://localhost"

    llm_provider: str = "ollama"

    anthropic_api_key: str = ""
    claude_model_quick: str = "claude-haiku-4-5-20251001"
    claude_model_agent: str = "claude-sonnet-4-6"
    claude_model_report: str = "claude-opus-4-7"

    ollama_host: str = "http://localhost:11434"
    ollama_model_quick: str = "llama3.1:8b"
    ollama_model_agent: str = "qwen2.5:7b"
    ollama_model_report: str = "llama3.1:8b"

    # OpenAI-compatible provider — works with Groq (default, free), Google Gemini,
    # OpenRouter, Together, HF router, etc. Best choice for a deployed server since
    # it needs no GPU. Set LLM_PROVIDER=openai_compat and fill openai_api_key.
    openai_base_url: str = "https://api.groq.com/openai/v1"
    openai_api_key: str = ""
    openai_model_quick: str = "llama-3.1-8b-instant"
    openai_model_agent: str = "llama-3.3-70b-versatile"
    openai_model_report: str = "llama-3.3-70b-versatile"

    # Google Gemini (free tier via AI Studio) — its own provider so you only set a key.
    # Uses Gemini's OpenAI-compatible endpoint. Set LLM_PROVIDER=gemini + gemini_api_key.
    gemini_base_url: str = "https://generativelanguage.googleapis.com/v1beta/openai"
    gemini_api_key: str = ""
    gemini_model_quick: str = "gemini-2.0-flash"
    gemini_model_agent: str = "gemini-2.0-flash"
    gemini_model_report: str = "gemini-2.5-flash"

    polygon_api_key: str = ""
    fmp_api_key: str = ""
    newsapi_key: str = ""
    alpha_vantage_key: str = ""
    unusual_whales_key: str = ""

    reddit_client_id: str = ""
    reddit_client_secret: str = ""
    reddit_user_agent: str = "marketmind/0.1"

    supabase_url: str = ""
    supabase_key: str = ""
    supabase_service_key: str = ""
    redis_url: str = "redis://localhost:6379/0"

    @property
    def cors_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()

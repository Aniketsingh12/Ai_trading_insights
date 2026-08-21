import logging
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# Load backend/.env regardless of the process's working directory.
_ENV_FILE = Path(__file__).parent / ".env"

# One deep-research run makes five model calls — four analysts plus the
# synthesis — so it draws five units of any AI allowance. Defined here rather
# than at the route so the limits below can be sanity-checked against it.
DEEP_RESEARCH_COST = 5


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=_ENV_FILE, extra="ignore")

    env: str = "development"
    log_level: str = "INFO"

    # Public-demo guards (all disabled by default — see utils/guard.py).
    api_access_key: str = ""       # owner passcode; bypasses every limit below
    visitor_llm_limit: int = 0     # if > 0, AI calls one anonymous visitor gets per UTC day
    daily_llm_limit: int = 0       # if > 0, ceiling across ALL visitors per UTC day
    rate_limit_per_min: int = 0    # if > 0, per-IP burst cap (data routes get 8x)
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

    # Together AI — its own provider so you only set a key (api.together.ai).
    # Tiering is deliberate: cheap models carry the frequent calls, and the
    # flagship is reserved for the one synthesis call that decides the verdict.
    together_base_url: str = "https://api.together.ai/v1"
    together_api_key: str = ""
    #
    # The `report` tier is the expensive one: a single synthesis call, but it
    # reads all four analyst outputs and runs on a flagship model, which works
    # out to roughly 85% of a deep-research run's cost. It is also the only call
    # whose output is machine-read (six section headings plus a VERDICT: line),
    # so downgrading it is worthwhile but must be checked, not assumed:
    #   .venv/Scripts/python.exe scripts/eval_report_model.py
    # `report` is set to gpt-oss-120b rather than the flagship DeepSeek-V4-Pro:
    # ~8x cheaper on that call, and it is the same family as the `quick` tier
    # already producing sectioned output reliably in this app — so the format
    # adherence the report parser depends on is a known quantity, unlike the
    # cheapest options. DeepSeek-V4-Flash is another 1.5x cheaper again but
    # advertises no structured-output support; run the eval before taking it.
    together_model_quick: str = "openai/gpt-oss-20b"                       # $0.05/$0.20
    together_model_agent: str = "deepseek-ai/DeepSeek-V4-Flash-0731"       # $0.14/$0.28
    together_model_report: str = "openai/gpt-oss-120b"                     # $0.15/$0.60

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


def _warn_about_unreachable_features() -> None:
    """
    Catch allowance settings that silently disable the demo's best feature.

    Deep research costs DEEP_RESEARCH_COST units. Set an allowance below that
    and the button never works for anyone — no error at deploy time, just a
    feature that always refuses. Worth a loud line in the logs.
    """
    log = logging.getLogger("marketmind.config")
    for name, value in (
        ("VISITOR_LLM_LIMIT", settings.visitor_llm_limit),
        ("DAILY_LLM_LIMIT", settings.daily_llm_limit),
    ):
        if 0 < value < DEEP_RESEARCH_COST:
            log.warning(
                "%s=%d is below the cost of one deep-research run (%d units), so that "
                "feature will always be refused. Raise it to at least %d.",
                name, value, DEEP_RESEARCH_COST, DEEP_RESEARCH_COST,
            )

    # Imported here, not at module scope: model_presets reads `settings`, which
    # does not exist until this module has finished executing.
    from utils import model_presets

    for preset in model_presets.PRESETS.values():
        if model_presets.is_redundant(preset):
            log.warning(
                "Model preset '%s' resolves to the same models as '%s', so it is hidden "
                "from the picker. TOGETHER_MODEL_REPORT=%s is already the premium model — "
                "set it to a cheaper one for the tiers to mean anything.",
                preset.id, model_presets.DEFAULT_PRESET, settings.together_model_report,
            )


_warn_about_unreachable_features()

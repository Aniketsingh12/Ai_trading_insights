from supabase import Client, create_client

from config import settings

_client: Client | None = None


def get_supabase() -> Client | None:
    global _client
    if _client is None and settings.supabase_url and settings.supabase_key:
        _client = create_client(settings.supabase_url, settings.supabase_key)
    return _client

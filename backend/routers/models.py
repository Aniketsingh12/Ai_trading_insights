from fastapi import APIRouter, Header

from utils import model_presets
from utils.guard import is_owner

router = APIRouter(prefix="/models", tags=["models"])


@router.get("")
async def list_models(x_api_key: str | None = Header(default=None)):
    """
    The model options the UI offers, with `locked` resolved for this caller.

    Owner-only presets are still listed rather than hidden: showing what the app
    can do, greyed out, says more than pretending it doesn't exist. Exposes
    model names and price hints only — never a provider key.
    """
    owner = is_owner(x_api_key)
    return {
        "default": model_presets.DEFAULT_PRESET,
        "options": model_presets.listing(owner),
    }

# Celery Tasks (Phase 2+)

- `daily_digest.py` — 9am ET watchlist digest
- `alert_monitor.py` — every 5 min, checks alert conditions
- `watchlist_refresh.py` — every 15 min, refreshes watchlist quotes
- `report_generation.py` — async CrewAI deep research

Requires Redis (`REDIS_URL` in `.env`). Start with:
```
celery -A tasks.celery_app worker --loglevel=info
celery -A tasks.celery_app beat --loglevel=info
```

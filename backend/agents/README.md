# Deep Research Agents (Phase 2 — BUILT)

The 5-agent deep research pipeline. Each agent maps 1:1 to the CrewAI agents in the
guide, but is implemented on the shared `utils/llm.py` abstraction so it runs on
**both** the Claude API and local Ollama models.

## Files
| File | Agent | LLM tier | Data sources (MCP) |
|------|-------|----------|--------------------|
| `research_agent.py` | ResearchAgent — fundamentals | `agent` | fundamentals-mcp |
| `technical_agent.py` | TechnicalAgent — price/indicators | `agent` | market-data-mcp |
| `sentiment_agent.py` | SentimentAgent — news/social/options | `agent` | news, social, options |
| `risk_agent.py` | RiskAgent — volatility/catalysts | `agent` | market-data, fundamentals, options |
| `report_agent.py` | ReportAgent — synthesis + verdict | `report` | (consumes the 4 above) |
| `crew.py` | Orchestrator | — | runs analysts concurrently → synthesis |
| `base.py` | Shared Agent base class | — | — |

## Why not CrewAI's autonomous tool-calling
Small OSS models (llama3.1:8b, qwen2.5:7b) have weak/inconsistent function-calling.
Letting them autonomously pick tools (CrewAI's default) is unreliable. Instead each
agent **deterministically** gathers its data in Python (`gather()`), then sends it to
the LLM for role-specialised reasoning (`reason()`). Same 5-role structure, reliable
on every provider. Swapping to CrewAI later only touches these files.

## Flow
```
ResearchAgent ┐
TechnicalAgent├─ asyncio.gather (concurrent)
SentimentAgent│
RiskAgent     ┘
      ▼
ReportAgent → structured report + VERDICT (STRONG BUY … STRONG SELL)
```

## Run
- API: `POST /analyze/deep/{ticker}` → returns `report_id`
- Poll: `GET /analyze/report/{report_id}` → live agent status + final report
- Job orchestration: `services/research_service.py` (in-memory, FastAPI BackgroundTasks)

Production path (optional): move the job store to Supabase and run `run_deep_research`
inside a Celery task — the crew code is unchanged. See `../tasks/README.md`.

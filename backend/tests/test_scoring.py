from utils import scoring


def test_trade_metrics_basic():
    m = scoring.trade_metrics(
        price=100, sma50=95, sma200=90, high_52w=120, low_52w=70, vol_annual=30
    )
    assert m["entry"] == 100
    assert m["target"] == 120          # 52w high is the resistance
    assert m["stop"] == 95             # nearest support below price = SMA50
    assert m["upside_pct"] == 20.0
    assert m["downside_pct"] == 5.0
    assert m["risk_reward"] == 4.0     # 20 / 5


def test_trade_metrics_at_new_high_projects_target():
    # price above 52w high -> target projected one monthly move up
    m = scoring.trade_metrics(
        price=130, sma50=110, sma200=100, high_52w=125, low_52w=80, vol_annual=24
    )
    assert m["target"] > 130
    assert "projected" in m["target_basis"]


def test_score_strong_buy():
    s = scoring.score(
        price=100, rsi=60, macd_hist=0.5, sma50=95, sma200=90,
        risk_reward=4.0, stocktwits_ratio=2.5,
    )
    assert s["label"] == "STRONG BUY"
    assert s["total"] >= 75
    assert len(s["breakdown"]) == 4


def test_score_downtrend_is_bearish():
    s = scoring.score(
        price=80, rsi=32, macd_hist=-0.4, sma50=90, sma200=100,
        risk_reward=0.5, stocktwits_ratio=0.4,
    )
    assert s["label"] in ("SELL", "STRONG SELL")
    assert s["total"] < 42


def test_indicators_from_closes_uptrend():
    closes = [100 + i for i in range(260)]   # strictly rising
    ind = scoring.indicators_from_closes(closes)
    assert ind["rsi"] == 100.0               # only gains
    assert ind["sma50"] > ind["sma200"]      # uptrend ordering
    assert ind["last_close"] == 359


def test_indicators_short_history_degrades():
    ind = scoring.indicators_from_closes([100, 101, 102])
    assert ind["sma50"] is None
    assert ind["sma200"] is None
    assert ind["last_close"] == 102


def test_range_52w_from_candles():
    candles = [{"high": 110, "low": 90, "close": 100},
               {"high": 120, "low": 95, "close": 115}]
    r = scoring.range_52w_from_candles(candles)
    assert r["high_52w"] == 120
    assert r["low_52w"] == 90
    assert r["current"] == 115


def test_expected_monthly_move():
    # annual vol / sqrt(12)
    assert scoring.expected_monthly_move(34.64) == round(34.64 / (12 ** 0.5), 2)
    assert scoring.expected_monthly_move(None) is None


def test_score_breakdown_points_within_max():
    s = scoring.score(
        price=100, rsi=50, macd_hist=0.1, sma50=98, sma200=96,
        risk_reward=1.8, stocktwits_ratio=1.0,
    )
    for b in s["breakdown"]:
        assert 0 <= b["points"] <= b["max"]

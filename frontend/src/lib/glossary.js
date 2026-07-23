// One-sentence, beginner-friendly explanations shown in ⓘ tooltips next to jargon.
// Keyed by short slugs AND by the exact factor names used in the score breakdown.
export const GLOSSARY = {
  rsi: 'Relative Strength Index (0–100): above ~70 can mean overbought (due for a dip), below ~30 oversold (due for a bounce).',
  macd: 'A momentum gauge — a positive histogram suggests upward momentum building, negative suggests downward.',
  sma50: 'The average price over the last 50 days — the medium-term trend line.',
  sma200: 'The average price over the last 200 days — the long-term trend line. Price above it = long-term uptrend.',
  risk_reward: 'How much you could gain vs lose. 3:1 means the target is 3× further away than the stop — higher is better.',
  expected_move: 'Roughly how far the price typically swings in a month, based on its recent volatility.',
  volatility: 'How much the price bounces around. Higher volatility = bigger swings = more risk.',
  beta: 'How much the stock moves compared to the whole market. Above 1 = jumpier than the market.',
  put_call: "Options traders' mood: above 1 leans bearish (more downside bets), below 1 leans bullish.",
  score: 'A 0–100 blend of trend, momentum, risk/reward and sentiment. Higher = a stronger setup right now.',
  verdict: 'The overall call, STRONG BUY → STRONG SELL. It is analysis to inform you — not advice, and nothing is bought automatically.',
  entry: 'The current price — roughly where a position would start.',
  target: 'A realistic price the stock could reach (a resistance level) — the reward side.',
  stop: 'A price where the idea is proven wrong and you would exit to limit losses — the risk side.',
  // exact factor names from the score breakdown
  Trend: 'Which way the price is heading, based on its moving averages (up, down, or sideways).',
  Momentum: 'How much force is behind the current move, read from RSI and MACD.',
  'Risk/Reward': 'How much you could gain vs lose. 3:1 means the target is 3× further than the stop — higher is better.',
  Sentiment: "The crowd's mood from social posts — bullish vs bearish chatter.",
};

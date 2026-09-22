# Local ranking experiment

Label source: **synthetic-policy**. Synthetic-policy distillation only. Not a trained LLM; no demonstrated human preference or business benefit. Do not enable in production.

| Held-out test metric | Existing rules | Learned ranker |
|---|---:|---:|
| NDCG@3 | 0.9162 | 0.9568 |
| Pairwise agreement (ties = 0.5) | 0.8661 | 0.9309 |

40 held-out buyer scenarios; 463 comparable pairs. Higher scores on synthetic labels mean closer agreement with the invented policy, not better real recommendations.

Training uses train only; L2 is chosen on validation; test is evaluated after selection. No IDs or raw descriptions enter model features. Source data hash: `f6b20d2c3b157cfb9db1ed3626eb468e71dfe1c952cdb4ff0d5d70e85e99c7c4`. Rerun with `npm run train:ranker`.

Production UI still uses the original rules. `prediction-example.json` demonstrates the experimental scorer after fresh hard-constraint filtering. Provider freshness and human approval must still be applied by the application's orchestrator before any future live integration.

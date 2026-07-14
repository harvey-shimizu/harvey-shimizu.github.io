# Harvey English Career Tracker

18か月（2026-07-15〜2028-01-14）のビジネス英語・資格・健康習慣を一元管理する、Mac／iPhone対応のレスポンシブWebアプリです。

## 主な機能

- 英語のハノン初級・中級・上級・統合と、各資格対策の日次タスク
- TOEIC S&W／L&R、Linguaskill Business、C1 Advanced、IELTS GTのロードマップ
- 日・週・月・18か月全体の達成率と残日数
- 未実施タスクを今日へ追加するリカバリーキュー
- 毎日5分プランク、腕立て・スクワット10→30回の段階目標
- 土日のどちらか一日で10,000歩を達成する週末ウォーキング記録
- ブラウザ内自動保存、JSONバックアップ／復元、進捗サマリーのコピー

## ローカル開発

```bash
npm ci
npm run dev
```

## GitHub Pages

`harvey-shimizu.github.io` リポジトリの `main` ブランチへ配置すると、`.github/workflows/deploy-pages.yml` が静的サイトをビルドして公開します。GitHubのリポジトリ設定で Pages の Source を `GitHub Actions` にしてください。

```bash
npm run build:github
```

静的成果物は `out/` に生成されます。記録はブラウザの `localStorage` に保存されるため端末ごとに独立します。MacとiPhone間は画面のデータ管理からJSONを書き出し／読み込みできます。

# Gemini API 混雑モニター

Gemini APIの時間帯別混雑状況を自動測定・可視化するWebアプリです。

## 構成

```
gemini-monitor/
├── index.html       # フロントエンド（GitHub Pages）
├── gas/
│   └── Code.gs      # GASバックエンド（測定実行・データ保存・API）
└── README.md
```

## セットアップ手順

### 1. GitHubリポジトリ作成 & GitHub Pages有効化

```bash
git init
git add .
git commit -m "initial commit"
git remote add origin https://github.com/gurii-gabreh/gemini-monitor.git
git push -u origin main
```

GitHub → Settings → Pages → Source: `main` ブランチ

---

### 2. Google スプレッドシート & GAS作成

1. [Google Sheets](https://sheets.google.com) で新規スプレッドシートを作成
2. メニュー「拡張機能」→「Apps Script」を開く
3. `gas/Code.gs` の内容を貼り付ける
4. `CONFIG.GEMINI_API_KEY` に [Google AI Studio](https://aistudio.google.com/apikey) で取得したAPIキーを入力

---

### 3. GASの初期セットアップ実行

1. GASエディタで `initialSetup` 関数を選択して実行
2. 権限の許可ダイアログで「許可」をクリック
3. `measurementsシート作成完了` がログに表示されればOK

---

### 4. GAS WebアプリとしてDeployする

1. GASエディタ右上「デプロイ」→「新しいデプロイ」
2. 種類：「ウェブアプリ」を選択
3. 設定：
   - 説明：`Gemini Monitor API`
   - 次のユーザーとして実行：`自分`
   - アクセスできるユーザー：`全員`
4. 「デプロイ」をクリック → **WebアプリURLをコピー**

---

### 5. フロントエンドにGAS URLを設定

1. GitHub Pagesの `index.html` を開く（`https://gurii-gabreh.github.io/gemini-monitor/`）
2. 画面上部の入力欄にコピーしたGAS URLを貼り付けて「保存」

---

## 測定仕様

| 規模 | プロンプト概要 | 想定トークン |
|------|--------------|-------------|
| 小   | `1+1=?`       | ~10         |
| 中   | 日本の四季説明  | ~300        |
| 大   | AI歴史・技術詳説 | ~3000      |

### 対象モデルと無料枠（2026年6月時点）

| モデル | 無料RPM | 無料RPD | 備考 |
|--------|---------|---------|------|
| gemini-3.5-flash | 15 | 1,500 | 最新・高性能 |
| gemini-3.1-flash-lite | 30 | 1,500 | 最新・軽量 |
| gemini-2.5-flash | 10 | 250 | 前世代Flash |
| gemini-2.5-flash-lite | 15 | 1,000 | 前世代軽量 |
| gemini-2.5-pro | 5 | 100 | ⚠️ 小のみ測定 |

> **注意**: gemini-2.5-pro はRPD制限が100のため、自動的に「小」サイズのみ測定します

---

## グラフ機能

- **時間帯別ヒートマップ**：0〜23時（JST）の成功率を色で可視化
- **時系列成功率**：モデル別の成功率推移
- **平均レイテンシ推移**：小プロンプト基準のレイテンシ
- **規模別成功率**：小・中・大プロンプトの比較
- **エラー種別分布**：429/503/その他の内訳

期間切替：24時間 / 7日 / 月 / 年

---

## 設定（画面右上「⚙ 設定」）

- 測定対象モデルのON/OFF切替
- 測定規模（小・中・大）の選択
- 測定間隔（1〜24時間）

設定変更はGASトリガーに即時反映されます。

---

## ライセンス

MIT

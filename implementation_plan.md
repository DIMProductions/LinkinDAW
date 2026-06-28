# Web-DAW Connector (LinkinDAW) 実装計画 Phase 3: Axionの統合

ご提案ありがとうございます！
すでに「Axion (Fully Synthesized Percussion Engine)」という非常に高度なWASMオーディオエンジン（`arcana_core.wasm`）とリッチなシーケンサーUIが存在しているのですね。

ゼロから808エンジンを作り直すのではなく、この**Axionエンジンを今回の LinkinDAW WebApp プロジェクトに移植・統合**し、WebSocket経由でDAWから制御できるようにするのが最も効率的で強力なアプローチです。

## 💡 アーキテクチャと設計方針

既存の `Axion` のアセットとロジックを、現在構築中の `Vite + React` プロジェクト（`WebApp`）に統合します。

### 1. WASM & AudioWorklet の移植
- Axionのコアである `arcana_core.wasm` と `arcana-processor.js` (AudioWorklet) を `WebApp/public` ディレクトリにコピーします。
- これにより、サンプリングデータに依存しない完全なシンセサイズ・パーカッション（808ベース等含む）が即座に利用可能になります。

### 2. UIコンポーネントとロジックのReact化（またはマウント）
- 現在の `index.html` および `axion-app.js` のUIロジックを、Reactコンポーネント（`App.tsx`）に移植、もしくは統合します。
- 既存の `axion.css` をReactアプリに組み込み、Glassmorphismの美しいUIをそのまま利用します。

### 3. MIDIとWebSocketのブリッジ
- DAW（LinkinDAW.vst3）から送られてくるWebSocketのMIDIメッセージ（Note On / Note Off / CC）を、Axionエンジンのトリガーシステムに直結させます。
- これにより、DAW上のMIDIトラックでAxionをリアルタイムに演奏（ポルタメント・ベロシティ・パラメータ制御）できるようになります。

---

## 📝 実行計画（Proposed Changes）

以下の手順でAxionの統合を実施します。

### 1. アセットのコピー
`C:\Users\Davinci\Desktop\DIMP-Site\dimp-web\public\axion` から以下の重要なリソースを `LinkinDAW/WebApp` にコピーします。
- **WASMコア**: `wasm/arcana_core.wasm`
- **AudioWorklet**: `src/axion/arcana-processor.js`
- **スタイル**: `src/styles/axion.css`
- **画像・SVG等**: `assets/` フォルダ内の画像群

### 2. React (App.tsx) への組み込み
#### [MODIFY] [WebApp/src/App.tsx](file:///c:/Users/Davinci/Documents/LinkinDAW/WebApp/src/App.tsx)
現在テスト用に作ったサイン波のオシレーター接続ロジックを破棄し、Axionの初期化フロー（`audio-engine.js` の処理）とDAWのWebSocket接続（`Socket.ts`）を結合します。

### 3. MIDI信号のマッピング
#### [MODIFY] [WebApp/src/network/Socket.ts](file:///c:/Users/Davinci/Documents/LinkinDAW/WebApp/src/network/Socket.ts)
DAWから受信したノート情報を、Axion側のAPI（`triggerNote` 等）にマッピングします。

---

## ⚠️ User Review Required

> [!IMPORTANT]
> **「Axion」のアセットを全面的に採用し、今回のWeb-DAWコネクターのフロントエンドとして統合する** という方針で進めてよろしいでしょうか？
> 
> ※Axionの `axion-app.js` は巨大（約62KB）なため、UIすべてをReactのJSXに書き換えるか、あるいはAxionの既存UI（Vanilla JSのDOM）をそのままReact内にマウントするかで作業コストが変わります。
> 今回は**「Axionのオーディオエンジン（WASM）の統合と、MIDIによる外部制御」を最優先**とし、UIはAxionのものをマウントする形で進める予定です。

よろしければ「承認（Proceed）」をお願いします。Axionの移植作業を開始します！

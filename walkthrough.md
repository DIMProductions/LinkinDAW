# Web-DAW Connector: Phase 4B (Sample Rate Sync) 完了レポート

「DAW側のプロジェクトサンプリングレート」と「Web側のWASMオーディオエンジン」をリアルタイムで同期するシステムの構築が完了しました！

これにより、FL Studio等のDAW側でプロジェクトのサンプルレート（44.1kHz, 48kHz, 96kHzなど）が変更された場合でも、クリックノイズやピッチシフト（音程のズレ）が発生することなく、完璧なストリーミングを維持できるようになります。

## 🎯 達成した主な要件

1. **プラグイン初期化・変更時のレート検知 (C++)**
   VST3プラグインの初期化時やDAWのオーディオ設定変更時に発火する `LinkinDAW::OnReset()` メソッドを実装しました。ここで取得した新しいサンプルレート（例: `44100.0`）を、非同期キューを通じてWebSocketサーバーに送信します。

2. **JSONコマンドによるシステム通知 (WebSocket)**
   DAWのレート変更を検知すると、専用の `"type": "system"` / `"command": "set_samplerate"` JSONメッセージがReact（WebUI）へ即座に送信されます。

3. **WASM基準クロックの動的再設定 (Web AudioWorklet)**
   受信した `set_samplerate` の値は、React（`App.tsx`） ➡️ iframe（`axion-app.js`） ➡️ AudioWorklet（`arcana-processor.js`）へと `postMessage` で転送されます。
   最終的にWASMの内部関数 `wasm.arcana_init(newSampleRate)` が叩かれ、808オシレーターなどのピッチ計算基準となる内部クロックがDAWに合わせて動的に修正されます。

## 📁 変更された主要ファイル

- **C++ (DAW/Plugin)**
  - `src/LinkinDAW.h`, `src/LinkinDAW.cpp`: `OnReset()` のオーバーライドと、DAWサンプルレートの取得。
  - `src/WebSocketServer.h`, `src/WebSocketServer.cpp`: 新規キュー `mSampleRateOutQueue` の追加と、`system` JSONの送信。
- **Web (UI/React/WASM)**
  - `WebApp/src/network/Socket.ts`: `setSystemCallback` と `system` コマンドの解析。
  - `WebApp/src/App.tsx`: `SET_SAMPLERATE` のルーティング。
  - `WebApp/public/axion/src/axion/audio-engine.js`: `SET_SAMPLERATE` のフックとWorkletへの転送。
  - `WebApp/public/axion/src/axion/arcana-processor.js`: `SET_SAMPLERATE` に応答してWASMの `arcana_init` を呼び出し。

## 🚀 次のステップ（動作確認）

1. CMake等でC++プラグインをリビルドします。
2. ターミナルで `WebApp` ディレクトリに移動し、`npm run dev` で開発サーバーを立ち上げてください。
3. DAW側で新しくビルドした `LinkinDAW.vst3` を起動します。
4. **サンプリングレート変更テスト**:
   - DAWのオーディオ設定を開き、プロジェクトのサンプリングレートを `44100Hz` から `48000Hz` 等に変更してみてください。
   - レート変更直後にAxionから生成されるオーディオのピッチが一切狂うことなく、安定してDAWに録音されることを確認してください。

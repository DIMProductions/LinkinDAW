importScripts('wasm/audio_engine.js');

class AudioEngineWorklet extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.wasmReady = false;
        this.wasmModule = null;
        
        // GCを回避するためのTransferable Objectsプール
        this.bufferPool = [];
        for (let i = 0; i < 10; i++) {
            this.bufferPool.push(new ArrayBuffer(128 * 4)); // 128 samples * 4 bytes (Float32)
        }
        
        createAudioEngineModule({
            locateFile: (path) => 'wasm/' + path
        }).then((Module) => {
            this.wasmModule = Module;
            this.wasmModule._init_engine(sampleRate);
            this.wasmReady = true;
            this.port.postMessage({ type: 'WASM_READY' });
        });

        this.port.onmessage = (event) => {
            const { type, payload } = event.data;

            if (type === 'RETURN_BUFFER') {
                // メインスレッドから返却されたArrayBufferをプールに戻す (Zero GC)
                this.bufferPool.push(event.data.buffer);
            } else if (!this.wasmReady) {
                return;
            } else if (type === 'NOTE_ON') {
                this.wasmModule._note_on(payload.note, payload.velocity);
            } else if (type === 'NOTE_OFF') {
                this.wasmModule._note_off(payload.note);
            } else if (type === 'SET_FREQ') {
                this.wasmModule._set_frequency(payload.freq);
            }
        };
    }

    process(inputs, outputs, parameters) {
        if (!this.wasmReady) return true;

        // C++の_process_audio()はポインタを返す
        const ptr = this.wasmModule._process_audio();
        if (ptr === 0) return true;

        // WASMメモリへのビューを作成 (直接送れないのでコピーが必要)
        const wasmBuffer = new Float32Array(this.wasmModule.HEAPF32.buffer, ptr, 128);

        // ローカルでのモニタリング出力
        const output = outputs[0];
        if (output && output[0]) {
            output[0].set(wasmBuffer);
            if (output[1]) {
                output[1].set(wasmBuffer);
            }
        }

        // メインスレッドへの転送 (GC回避のためプールを利用)
        if (this.bufferPool.length > 0) {
            const buffer = this.bufferPool.pop();
            const view = new Float32Array(buffer);
            view.set(wasmBuffer);
            
            // 所有権をメインスレッドへ転送 (Zero Copy)
            this.port.postMessage({
                type: 'AUDIO_BUFFER',
                buffer: buffer
            }, [buffer]); 
        }

        return true;
    }
}

registerProcessor('audio-engine-worklet', AudioEngineWorklet);

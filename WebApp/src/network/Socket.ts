type MessageHandler = (data: any) => void;
type ConnectionHandler = (connected: boolean) => void;

export class DAWConnection {
    private ws: WebSocket | null = null;
    private onMidiCallback: MessageHandler | null = null;
    private onParamCallback: MessageHandler | null = null;
    private onSystemCallback: MessageHandler | null = null;
    private onConnectionCallback: ConnectionHandler | null = null;
    private workletPort: MessagePort | null = null;
    public isConnected: boolean = false;

    constructor() {}

    public connect(url: string = 'ws://127.0.0.1:8080') {
        this.ws = new WebSocket(url);
        this.ws.binaryType = 'arraybuffer';

        this.ws.onopen = () => {
            console.log('Connected to DAW');
            this.isConnected = true;
            this.onConnectionCallback?.(true);
        };

        this.ws.onmessage = (event) => {
            if (typeof event.data === 'string') {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'midi' && this.onMidiCallback) {
                        this.onMidiCallback(data);
                    } else if (data.type === 'param' && this.onParamCallback) {
                        this.onParamCallback(data);
                    } else if (data.type === 'system' && this.onSystemCallback) {
                        this.onSystemCallback(data);
                    }
                } catch (e) {}
            }
        };

        this.ws.onclose = () => {
            console.log('Disconnected from DAW');
            this.isConnected = false;
            this.onConnectionCallback?.(false);
            setTimeout(() => this.connect(url), 2000);
        };
    }

    public setMidiCallback(callback: MessageHandler) {
        this.onMidiCallback = callback;
    }

    public setParamCallback(callback: MessageHandler) {
        this.onParamCallback = callback;
    }

    public setSystemCallback(callback: MessageHandler) {
        this.onSystemCallback = callback;
    }

    public setConnectionCallback(callback: ConnectionHandler) {
        this.onConnectionCallback = callback;
        callback(this.isConnected);
    }

    public sendAudio(buffer: ArrayBuffer) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(buffer);
        }
    }

    public sendParam(id: string, value: number) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'param', id, value, source: 'web' }));
        }
    }

    public sendSystem(command: string, value: unknown) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type: 'system', command, value }));
        }
    }

    public setWorkletPort(port: MessagePort) {
        this.workletPort = port;
        
        // Listen for buffers from AudioWorklet
        this.workletPort.onmessage = (event) => {
            if (event.data.type === 'AUDIO_BUFFER') {
                const buffer = event.data.buffer as ArrayBuffer;
                
                // Send to DAW using WebSocket
                if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                    this.ws.send(buffer);
                }
                
                // Transfer back to worklet pool (Zero GC loop completion)
                this.workletPort?.postMessage({
                    type: 'RETURN_BUFFER',
                    buffer: buffer
                }, [buffer]);
            }
        };
    }
}

export const dawConnection = new DAWConnection();

import { useEffect, useRef } from 'react';
import { dawConnection } from './network/Socket';
import './index.css';

function App() {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dawSampleRateRef = useRef<number | null>(null);
  const engineStatusRef = useRef<string>('waiting');
  const pendingAxionProjectRef = useRef<unknown | null>(null);
  const lastAxionProjectRef = useRef<unknown | null>(null);

  const params = new URLSearchParams(window.location.search);
  const appName = params.get('app') === 'enigma' ? 'enigma' : 'axion';
  const iframeSrc = appName === 'enigma' ? '/enigma/index.html' : '/axion/index.html';
  const iframeTitle = appName === 'enigma' ? 'ENIGMA Engine' : 'Axion Engine';

  const linkinDawStateProject = (project: unknown) => {
    if (!project || typeof project !== 'object') return project;
    const candidate = project as { tracks?: unknown };
    if (!Array.isArray(candidate.tracks)) return project;
    const stateTrackIds = new Set(['kick', 'snare', 'hat']);
    return {
      ...candidate,
      linkindawStateScope: 'axion-pattern-v1',
      tracks: candidate.tracks.filter((track) => (
        !!track
        && typeof track === 'object'
        && stateTrackIds.has((track as { id?: unknown }).id as string)
      )),
    };
  };

  const postProjectToIframe = (project: unknown) => {
    pendingAxionProjectRef.current = project;

    const post = () => {
      if (!iframeRef.current?.contentWindow || !pendingAxionProjectRef.current) return;
      iframeRef.current.contentWindow.postMessage(
        { type: 'LOAD_AXION_PROJECT', project: pendingAxionProjectRef.current },
        '*'
      );
    };

    post();
    window.setTimeout(post, 250);
    window.setTimeout(post, 1000);
    window.setTimeout(post, 2000);
    window.setTimeout(() => {
      pendingAxionProjectRef.current = null;
    }, 2500);
  };

  const requestProjectFromIframe = () => {
    const post = () => {
      if (pendingAxionProjectRef.current) return;
      iframeRef.current?.contentWindow?.postMessage({ type: 'GET_AXION_PROJECT' }, '*');
    };

    window.setTimeout(post, 1000);
    window.setTimeout(post, 2000);
  };

  const postSampleRateToIframe = () => {
    const sampleRate = dawSampleRateRef.current;
    if (sampleRate && iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { type: 'SET_SAMPLERATE', value: sampleRate },
        '*'
      );
    }
  };

  const postMonitorStateToIframe = (dawConnected: boolean) => {
    const post = () => {
      iframeRef.current?.contentWindow?.postMessage(
        { type: 'SET_LOCAL_MONITOR', enabled: !dawConnected },
        '*'
      );
    };
    post();
    window.setTimeout(post, 250);
    window.setTimeout(post, 1000);
  };

  const getIframeTitle = () => {
    try {
      return iframeRef.current?.contentDocument?.title?.trim() || 'Unknown';
    } catch {
      return 'Unknown';
    }
  };

  const sendWebAppTitle = () => {
    if (dawConnection.isConnected) {
      dawConnection.sendSystem('app_title', getIframeTitle());
    }
  };

  useEffect(() => {
    // 1. WebSocket接続の初期化
    const linkinDawUrl = params.get('linkindaw') || 'ws://127.0.0.1:8080';
    dawConnection.connect(linkinDawUrl);

    // 2. DAWからのMIDIメッセージとパラメータをIframeへ転送
    dawConnection.setMidiCallback((data) => {
      console.log('[LinkinDAW MIDI -> iframe]', data);
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage(
          { type: 'MIDI_MESSAGE', payload: data }, 
          '*'
        );
      }
    });

    dawConnection.setParamCallback((data) => {
      if (iframeRef.current && iframeRef.current.contentWindow && data.source === 'daw') {
        iframeRef.current.contentWindow.postMessage(
          { type: 'SET_PARAM', id: data.id, value: data.value }, 
          '*'
        );
      }
    });

    dawConnection.setSystemCallback((data) => {
      if (!iframeRef.current?.contentWindow) return;

      if (data.command === 'set_samplerate') {
        dawSampleRateRef.current = Number(data.value);
        postSampleRateToIframe();
      } else if (data.command === 'transport') {
        iframeRef.current.contentWindow.postMessage(
          { type: 'DAW_TRANSPORT', value: data.value },
          '*'
        );
      } else if (data.command === 'load_axion_state') {
        try {
          const project = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
          postProjectToIframe(project);
        } catch (error) {
          console.warn('Failed to load Axion state from DAW', error);
        }
      }
    });

    dawConnection.setConnectionCallback((connected) => {
      postMonitorStateToIframe(connected);
      if (connected) {
        dawConnection.sendSystem('engine_status', engineStatusRef.current);
        sendWebAppTitle();
        if (lastAxionProjectRef.current) {
          dawConnection.sendSystem('save_axion_state', linkinDawStateProject(lastAxionProjectRef.current));
        }
        requestProjectFromIframe();
      }
    });

    // 3. Iframeからのメッセージ受信
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.type === 'AUDIO_BUFFER') {
        const buffer = event.data.buffer;
        
        // DAWへオーディオを送信
        if (dawConnection.isConnected) {
          dawConnection.sendAudio(buffer);
        }

        // ゼロコピーのためのバッファ返却
        if (iframeRef.current && iframeRef.current.contentWindow) {
          iframeRef.current.contentWindow.postMessage(
            { type: 'RETURN_BUFFER', buffer: buffer },
            '*',
            [buffer]
          );
        }
      } else if (event.data && event.data.type === 'PARAM_CHANGED') {
        // Iframe(Axion)からのパラメータ変更をDAWへ送信
        const { id, value } = event.data;
        if (dawConnection.isConnected) {
          dawConnection.sendParam(id, value);
        }
      } else if (event.data && event.data.type === 'AXION_ENGINE_STATUS') {
        engineStatusRef.current = event.data.value || 'waiting';
        if (dawConnection.isConnected) {
          dawConnection.sendSystem('engine_status', engineStatusRef.current);
          sendWebAppTitle();
        }
      } else if (event.data && event.data.type === 'AXION_PROJECT_STATE') {
        lastAxionProjectRef.current = linkinDawStateProject(event.data.project);
        if (dawConnection.isConnected) {
          dawConnection.sendSystem('save_axion_state', lastAxionProjectRef.current);
        }
      }
    };

    window.addEventListener('message', handleMessage);

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', overflow: 'hidden', backgroundColor: '#0b0c10' }}>
      <iframe 
        ref={iframeRef}
        src={iframeSrc} 
        style={{ width: '100%', height: '100%', border: 'none' }}
        title={iframeTitle}
        onLoad={() => {
          postSampleRateToIframe();
          postMonitorStateToIframe(dawConnection.isConnected);
          sendWebAppTitle();
          window.setTimeout(sendWebAppTitle, 250);
          if (pendingAxionProjectRef.current) {
            postProjectToIframe(pendingAxionProjectRef.current);
          }
          requestProjectFromIframe();
        }}
      />
    </div>
  );
}

export default App;

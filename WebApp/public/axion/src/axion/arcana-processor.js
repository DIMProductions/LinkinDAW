class ArcanaWasmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.drum = null;
    this.bass = null;
    this.phaseLockFrame = 0;
    this.debugHatParamLogged = false;
    this.debugStereoLogged = false;
    this.debugMonoFallbackLogged = false;
    this.debugRealtimeVoiceParamsLogged = false;
    
    this.audioReturnFrames = 512;
    this.audioReturnWriteIndex = 0;
    this.audioReturnBuffer = new ArrayBuffer(this.audioReturnFrames * 2 * 4);
    this.bufferPool = [];
    for (let i = 0; i < 8; i++) {
        this.bufferPool.push(new ArrayBuffer(this.audioReturnFrames * 2 * 4));
    }

    this.port.onmessage = async (e) => {
      if (e.data.type === 'RETURN_BUFFER') {
        if (e.data.buffer?.byteLength === this.audioReturnFrames * 2 * 4) this.bufferPool.push(e.data.buffer);
      } else if (e.data.type === 'SET_SAMPLERATE') {
        if (this.drum && this.drum.wasm.arcana_init) {
          this.drum.wasm.arcana_init(e.data.value);
        }
        if (this.bass && this.bass.wasm.arcana_init) {
          this.bass.wasm.arcana_init(e.data.value);
        }
      } else if (e.data.type === 'load' || e.data.type === 'load_wasm') {
        const bassBinary = e.data.wasmBinary || e.data.data;
        const drumBinary = e.data.drumWasmBinary || bassBinary;
        this.drum = await this.instantiateCore(drumBinary);
        this.bass = await this.instantiateCore(bassBinary);
        const drumBuildId = this.drum.wasm.arcana_build_id ? this.drum.wasm.arcana_build_id() : 0;
        const bassBuildId = this.bass.wasm.arcana_build_id ? this.bass.wasm.arcana_build_id() : 0;
        this.port.postMessage({ type: 'ready', buildId: bassBuildId, drumBuildId, bassBuildId });
        this.port.postMessage({
          type: 'axion_debug',
          message: '[AXION] Dual WASM routing active',
          detail: {
            drumBuildId,
            bassBuildId,
            drumBytes: drumBinary?.byteLength || 0,
            bassBytes: bassBinary?.byteLength || 0,
            drumStereo: typeof this.drum.wasm.arcana_process_stereo === 'function',
            bassStereo: typeof this.bass.wasm.arcana_process_stereo === 'function',
            bassStem: !!this.bass.bassLPtr && !!this.bass.bassRPtr,
          }
        });
      } else if (e.data.type === 'trig' && this.drum && this.bass) {
        let uType = e.data.unitType;
        if (uType === undefined) {
          if (e.data.unit === 'KICK') uType = 0;
          else if (e.data.unit === 'SNARE') uType = 1;
          else if (e.data.unit === 'HAT') uType = 3;
          else uType = 2;
        }
        const core = uType === 2 ? this.bass : this.drum;
        this.writeParams(core, e.data, uType);
        if (core.wasm.arcana_dbg_set_seed) core.wasm.arcana_dbg_set_seed(e.data.seed || 12345);
        core.wasm.arcana_trigger(uType);
      } else if (e.data.type === 'note_on_808' && this.bass) {
        this.writeParams(this.bass, e.data, 2);
        if (this.bass.wasm.arcana_dbg_set_seed) this.bass.wasm.arcana_dbg_set_seed(e.data.seed || 12345);
        const velocityGain = Math.max(0, Math.min(1, e.data.velocity ?? 1));
        const outputGain = Math.max(0, Math.min(1, (e.data.params?.[22] ?? 1) * velocityGain));
        if (typeof this.bass.wasm.arcana_set_mix_param === 'function') {
          this.bass.wasm.arcana_set_mix_param(2, 22, outputGain);
        }
        this.port.postMessage({ type: 'axion_debug', message: '[AXION worklet note_on_808]', detail: { midi: e.data.midi || 33, velocity: velocityGain, outputGain, retrig: e.data.retrig !== false } });
        this.bass.wasm.arcana_note_on_808(e.data.midi || 33, e.data.retrig === false ? 0 : 1);
      } else if (e.data.type === 'glide_808' && this.bass) {
        this.writeParams(this.bass, e.data, 2);
        this.port.postMessage({ type: 'axion_debug', message: '[AXION worklet glide_808]', detail: { midi: e.data.midi || 33, targetHz: 440 * Math.pow(2, (Number(e.data.midi || 33) - 69) / 12), glideMs: e.data.glideMs || 120, outputGain: e.data.params?.[22], hasGlideTo808: typeof this.bass.wasm.arcana_glide_to_808 === 'function', curve: e.data.curve || 1 } });
        this.bass.wasm.arcana_glide_to_808(e.data.midi || 33, e.data.glideMs || 120, e.data.curve || 1);
      } else if (e.data.type === 'note_off_808' && this.bass) {
        this.bass.wasm.arcana_note_off_808(e.data.isChoke ? 1 : 0);
      } else if (e.data.type === 'set_unit_params' && this.drum && this.bass) {
        const unitType = e.data.unitType || 0;
        const core = unitType === 2 ? this.bass : this.drum;
        const hasUpdateVoiceParams = typeof core.wasm.arcana_update_voice_params === 'function';
        this.writeParams(core, e.data, unitType);
        this.port.postMessage({
          type: 'axion_debug',
          message: '[AXION worklet set_unit_params]',
          detail: { unitType, hasUpdateVoiceParams }
        });
        if (hasUpdateVoiceParams) {
          core.wasm.arcana_update_voice_params(unitType);
          if (!this.debugRealtimeVoiceParamsLogged) {
            this.debugRealtimeVoiceParamsLogged = true;
            this.port.postMessage({
              type: 'axion_debug',
              message: '[AXION] realtime voice params update enabled',
              detail: { unitType }
            });
          }
        }
      } else if (e.data.type === 'set_param' && this.drum && this.bass) {
        const unitType = e.data.unitType || 0;
        const core = unitType === 2 ? this.bass : this.drum;
        if (core.wasm.arcana_set_param) {
          core.wasm.arcana_set_param(unitType, e.data.paramType || 0, e.data.value || 0);
        }
      } else if (e.data.type === 'set_mix_param' && this.drum && this.bass) {
        for (const core of [this.drum, this.bass]) {
          if (core.wasm.arcana_set_mix_param) {
            core.wasm.arcana_set_mix_param(e.data.unitType || 0, e.data.paramType || 0, e.data.value || 0);
          }
        }
      }
    };
  }

  async instantiateCore(wasmBinary) {
    const imports = {
      env: { emscripten_notify_memory_growth: () => {} },
      wasi_snapshot_preview1: { proc_exit: () => {} },
    };
    const { instance } = await WebAssembly.instantiate(wasmBinary, imports);
    const wasm = instance.exports;
    if (typeof wasm._initialize === 'function') wasm._initialize();
    wasm.arcana_init(sampleRate || 48000);
    return {
      wasm,
      outPtr: wasm.arcana_get_out_buffer(),
      outLPtr: typeof wasm.arcana_get_out_l_buffer === 'function' ? wasm.arcana_get_out_l_buffer() : null,
      outRPtr: typeof wasm.arcana_get_out_r_buffer === 'function' ? wasm.arcana_get_out_r_buffer() : null,
      bassLPtr: typeof wasm.arcana_get_bass_l_buffer === 'function' ? wasm.arcana_get_bass_l_buffer() : null,
      bassRPtr: typeof wasm.arcana_get_bass_r_buffer === 'function' ? wasm.arcana_get_bass_r_buffer() : null,
      paramPtr: wasm.arcana_get_param_buffer(),
    };
  }

  writeParams(core, data, unitType) {
    if (!core || !data.params || !core.paramPtr) return;
    const wasmParamView = new Float32Array(core.wasm.memory.buffer, core.paramPtr, 64);
    wasmParamView.set(data.params);
    if (unitType === 3 && !this.debugHatParamLogged) {
      this.debugHatParamLogged = true;
      this.port.postMessage({
        type: 'axion_debug',
        message: '[AXION] Worklet wrote Hat params to drum WASM buffer',
        detail: {
          meta: data.meta || null,
          paramPan17: wasmParamView[17],
          paramWidth18: wasmParamView[18],
          paramChoke19: wasmParamView[19],
          paramSpread20: wasmParamView[20],
          paramLevel4: wasmParamView[4],
        }
      });
    }
  }

  processCore(core, frames) {
    if (!core) return null;
    const stereo = core.outLPtr && core.outRPtr && typeof core.wasm.arcana_process_stereo === 'function';
    if (stereo) {
      core.wasm.arcana_process_stereo(frames);
      return {
        l: new Float32Array(core.wasm.memory.buffer, core.outLPtr, frames),
        r: new Float32Array(core.wasm.memory.buffer, core.outRPtr, frames),
      };
    }
    core.wasm.arcana_process(frames);
    const mono = new Float32Array(core.wasm.memory.buffer, core.outPtr, frames);
    return { l: mono, r: mono };
  }

  process(inputs, outputs) {
    if (!this.drum || !this.bass) return true;
    const output = outputs[0];
    const bassOutput = outputs[1];
    const left = output[0];
    const right = output[1] || output[0];
    const frames = left.length;

    if (!this.debugStereoLogged) {
      this.debugStereoLogged = true;
      this.port.postMessage({
        type: 'axion_debug',
        message: '[AXION] dual core render path',
        detail: {
          channels: output.length,
          drumStereo: !!this.drum.outLPtr && !!this.drum.outRPtr,
          bassStereo: !!this.bass.outLPtr && !!this.bass.outRPtr,
          bassStem: !!this.bass.bassLPtr && !!this.bass.bassRPtr,
        }
      });
    }

    const drumOut = this.processCore(this.drum, frames);
    const bassOut = this.processCore(this.bass, frames);

    for (let i = 0; i < frames; i++) {
      left[i] = (drumOut?.l[i] || 0) + (bassOut?.l[i] || 0);
      if (right && right !== left) {
        right[i] = (drumOut?.r[i] || 0) + (bassOut?.r[i] || 0);
      }
    }

    if (bassOutput?.[0]) {
      if (this.bass.bassLPtr && this.bass.bassRPtr) {
        const bassL = new Float32Array(this.bass.wasm.memory.buffer, this.bass.bassLPtr, frames);
        const bassR = new Float32Array(this.bass.wasm.memory.buffer, this.bass.bassRPtr, frames);
        bassOutput[0].set(bassL);
        if (bassOutput[1]) bassOutput[1].set(bassR);
      } else {
        bassOutput[0].set(bassOut?.l || new Float32Array(frames));
        if (bassOutput[1]) bassOutput[1].set(bassOut?.r || bassOutput[0]);
      }
    }

    this.phaseLockFrame = (this.phaseLockFrame + 1) & 15;
    const phaseCore = this.bass?.wasm;
    if (this.phaseLockFrame === 0 && typeof phaseCore?.dp_wasm_get_locked === 'function') {
      const value = phaseCore.dp_wasm_get_locked();
      const fSmooth = typeof phaseCore.dp_wasm_get_f_smooth === 'function'
        ? phaseCore.dp_wasm_get_f_smooth()
        : 0;
      this.port.postMessage({ type: 'phase_lock', value, fSmooth });
    }

    if (this.audioReturnBuffer) {
        let view = new Float32Array(this.audioReturnBuffer);
        for (let i = 0; i < frames; i++) {
          const dst = (this.audioReturnWriteIndex + i) * 2;
          view[dst] = left[i] || 0;
          view[dst + 1] = (right && right !== left ? right[i] : left[i]) || 0;
        }
        this.audioReturnWriteIndex += frames;
        if (this.audioReturnWriteIndex >= this.audioReturnFrames) {
          const buffer = this.audioReturnBuffer;
          this.audioReturnBuffer = this.bufferPool.pop() || new ArrayBuffer(this.audioReturnFrames * 2 * 4);
          this.audioReturnWriteIndex = 0;
          this.port.postMessage({
              type: 'AUDIO_BUFFER',
              buffer: buffer
          }, [buffer]);
        }
    }

    return true;
  }
}

registerProcessor('arcana-processor', ArcanaWasmProcessor);

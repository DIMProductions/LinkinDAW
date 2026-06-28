@echo off
if not exist "..\public\wasm" mkdir "..\public\wasm"

emcc audio_engine.cpp -o ..\public\wasm\audio_engine.js ^
    -O3 ^
    -s WASM=1 ^
    -s EXPORTED_RUNTIME_METHODS="['ccall', 'cwrap']" ^
    -s EXPORTED_FUNCTIONS="['_init_engine', '_set_frequency', '_note_on', '_note_off', '_process_audio']" ^
    -s MODULARIZE=1 ^
    -s EXPORT_NAME="createAudioEngineModule" ^
    --no-entry

echo WASM build complete.

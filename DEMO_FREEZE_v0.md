# Demo Freeze v0

This document defines the minimum demo scope for the current LinkinDAW + Axion Public Alpha.

The demo goal is to show that a cloud-hosted Web Audio app can be controlled from FL Studio through LinkinDAW VST3, using WebRTC for the staging route.

## Demo Positioning

Demo Freeze v0 is not a product beta.

It demonstrates:

- Cloud WebApp launch from the VST3
- WebRTC connection through cloud signaling
- DAW MIDI / tempo / transport delivery to Axion
- Bidirectional VST3 parameter sync
- Axion drum sequencer workflow synced to DAW transport
- Axion Native 808 workflow through Audio Return and WAV stem export

Stereo Audio Return is now part of the current Axion staging demo path, but it should still be described as Axion-specific until broader compatibility is tested.

## Required Demo Flow

### 1. Open Web App From FL Studio

Expected behavior:

- Insert LinkinDAW VST3 in FL Studio.
- Click `Open Web App`.
- Google Chrome opens the staging Axion URL:

```text
https://dim.productions/linkindaw-axion-probe/?linkindaw=webrtc&room=<roomId>
```

- The WebRTC adapter starts.
- The LinkinDAW UI shows the WebApp connection state.

Pass condition:

- Chrome opens the staging route from the VST3.
- WebRTC reaches connected/open state.

### 2. FL Studio To Axion

Expected behavior:

- FL Studio Play / Stop reaches Axion.
- FL Studio BPM reaches Axion.
- MIDI Note On / Note Off reaches Axion.
- Velocity reaches Axion.

Pass condition:

- Axion responds to DAW transport and MIDI events.

### 3. Axion To FL Studio Parameter Sync

Required parameters:

- 808 Decay
- 808 Dirt
- 808 Glide

Expected behavior:

- Moving these controls in Axion updates the corresponding LinkinDAW VST3 parameters in FL Studio.
- Moving or automating these VST3 parameters in FL Studio updates Axion.

Pass condition:

- Parameter sync works in both directions for all three parameters.

### 4. Axion Drums

Expected behavior:

- Kick, Snare, and Hat are driven by the Axion step sequencer.
- The drum sequencer runs from FL Studio transport and BPM.

Pass condition:

- Pressing Play in FL Studio advances the Axion drum pattern in sync.

### 5. 808 Workflow

Use the Axion Native 808 path.

Axion Native 808 path:

- Create an Axion internal 808 pattern with slide / glide behavior.
- Preserve Slide / GLI / CHK / END in Axion.
- Return Axion Master audio to FL Studio through LinkinDAW Audio Return.
- Optionally export the same 808 pattern with `808 WAV` and import `808.wav` into FL Studio as a fallback or stem workflow.

Pass condition:

- Axion Native 808 plays from DAW transport.
- Axion-specific slide behavior is preserved through Audio Return or `808.wav` stem export.

## Optional Demo Segment

### Stereo Audio Return

Show this for the current Axion staging demo, while noting that broader Web instrument compatibility still needs testing.

Expected behavior:

- Axion Master audio returns to one stereo FL Mixer channel through LinkinDAW.

Pass condition:

- No obvious noise, crackle, dropout, or silence.

If instability reappears in a later build, describe it as a regression and do not generalize Audio Return beyond the current Axion staging setup.

## Not In Demo Freeze v0

Do not present these as completed demo features:

- Multi-Out: Kick / Snare / Hat / 808 separate outputs
- Production `/axion/*` deployment
- Installer
- macOS / AU support
- Auth / payment
- Exact FL Studio slide note compatibility for Axion 808
- General compatibility with arbitrary Web Audio apps

## Demo Completion Criteria

Demo Freeze v0 is complete when the following can be shown in one FL Studio session:

- `Open Web App` opens staging Axion in Chrome.
- WebRTC connects.
- FL Play / Stop / BPM / MIDI reaches Axion.
- Axion and FL Studio sync 808 Decay / Dirt / Glide in both directions.
- Axion Kick / Snare / Hat run from DAW transport.
- Axion Native 808 plays from DAW transport.
- Axion internal 808 slide behavior is preserved through Audio Return, with `808.wav` stem export available as fallback.
- Audio Return is stable in the current Axion staging setup.
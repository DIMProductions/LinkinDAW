#include <emscripten.h>
#include <cmath>
#include <vector>

const float PI = 3.14159265358979323846f;

class AudioEngine {
public:
    AudioEngine(float sampleRate) : mSampleRate(sampleRate), mPhase(0.0f), mFrequency(440.0f), mIsPlaying(false) {
        mBuffer.resize(128, 0.0f);
    }

    void setFrequency(float freq) {
        mFrequency = freq;
    }

    void noteOn(int note, int velocity) {
        if (velocity > 0) {
            mFrequency = 440.0f * std::pow(2.0f, (note - 69.0f) / 12.0f);
            mIsPlaying = true;
        } else {
            mIsPlaying = false;
        }
    }

    void noteOff(int note) {
        mIsPlaying = false;
    }

    float* process() {
        float phaseInc = 2.0f * PI * mFrequency / mSampleRate;
        for (int i = 0; i < 128; ++i) {
            if (mIsPlaying) {
                // Simple sine wave oscillator
                mBuffer[i] = std::sin(mPhase);
                mPhase += phaseInc;
                if (mPhase >= 2.0f * PI) {
                    mPhase -= 2.0f * PI;
                }
            } else {
                mBuffer[i] = 0.0f;
            }
        }
        return mBuffer.data();
    }

private:
    float mSampleRate;
    float mPhase;
    float mFrequency;
    bool mIsPlaying;
    std::vector<float> mBuffer;
};

AudioEngine* gEngine = nullptr;

extern "C" {

EMSCRIPTEN_KEEPALIVE
void init_engine(float sampleRate) {
    if (gEngine) delete gEngine;
    gEngine = new AudioEngine(sampleRate);
}

EMSCRIPTEN_KEEPALIVE
void set_frequency(float freq) {
    if (gEngine) gEngine->setFrequency(freq);
}

EMSCRIPTEN_KEEPALIVE
void note_on(int note, int velocity) {
    if (gEngine) gEngine->noteOn(note, velocity);
}

EMSCRIPTEN_KEEPALIVE
void note_off(int note) {
    if (gEngine) gEngine->noteOff(note);
}

EMSCRIPTEN_KEEPALIVE
float* process_audio() {
    if (gEngine) return gEngine->process();
    return nullptr;
}

}

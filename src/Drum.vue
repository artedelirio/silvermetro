<template>
  <v-card class="ma-4 pa-3">
    <div class="d-flex align-center justify-space-between mb-3">
      <div class="d-flex align-center" style="gap:8px;">
        <v-btn
          :color="isPlaying ? 'error' : 'primary'"
          :prepend-icon="isPlaying ? 'mdi-stop' : 'mdi-play'"
          @click="togglePlay"
        >
          {{ isPlaying ? 'Stop' : 'Play' }}
        </v-btn>
        <v-btn variant="text" prepend-icon="mdi-delete" @click="clearAll" :disabled="isPlaying">Clear</v-btn>
        <v-btn variant="text" prepend-icon="mdi-dice-5" @click="randomize" :disabled="isPlaying">Random</v-btn>
      </div>
      <div class="d-flex align-center" style="gap:12px; min-width: 280px;">
        <div class="text-medium-emphasis" style="width:64px; text-align:right;">{{ Math.round(tempo) }} BPM</div>
        <v-slider v-model="tempo" :min="60" :max="200" :step="1" show-ticks tick-size="2" style="width:180px;"/>
      </div>
    </div>

    <v-divider class="mb-3" />

    <!-- Tracks -->
    <div class="tracks">
      <div v-for="(track, rIdx) in tracks" :key="track.id" class="track-row">
        <div class="track-label">
          <v-icon :color="track.color" size="small" class="mr-1">mdi-circle</v-icon>
          <span>{{ track.name }}</span>
        </div>
        <div class="step-grid">
          <v-btn
            v-for="sIdx in steps"
            :key="sIdx-1"
            :class="['step',
              { active: track.pattern[sIdx-1], current: isPlaying && (sIdx-1) === currentStep },
              ((sIdx-1) % 4 === 0) ? 'bar' : ''
            ]"
            :style="{ '--accent': track.color }"
            size="small"
            variant="tonal"
            @click="toggleCell(rIdx, sIdx-1)"
          />
        </div>
        <div class="vol">
          <v-slider v-model="track.volume" :min="0" :max="1" :step="0.01" density="compact" hide-details style="width: 90px;" />
        </div>
      </div>
    </div>

    <div class="mt-3 d-flex align-center justify-end" style="gap:12px;">
      <v-switch v-model="swingOn" color="primary" hide-details label="Swing" density="comfortable" />
      <v-slider v-model="swing" :min="0" :max="0.25" :step="0.01" :disabled="!swingOn" density="compact" hide-details style="max-width:160px;" />
      <v-switch v-model="limiterOn" color="primary" hide-details label="Limiter" density="comfortable" />
      <div class="d-flex align-center" style="gap:12px; min-width: 220px;">
        <div class="text-medium-emphasis" style="width:64px; text-align:right;">Master</div>
        <v-slider v-model="masterVolume" :min="0" :max="1" :step="0.01" density="compact" hide-details style="width: 160px;" />
      </div>
    </div>
  </v-card>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, reactive, ref, watch } from 'vue'

type Track = {
  id: string
  name: string
  color: string
  pattern: boolean[]
  volume: number
  play: (time: number) => void
}

const steps = 16
const tempo = ref(120)
const swingOn = ref(false)
const swing = ref(0.12) // fraction of a 16th note added to off-beats

const isPlaying = ref(false)
const currentStep = ref(0)
const masterVolume = ref(0.9)
const limiterOn = ref(false)

let ctx: AudioContext | null = null
let lookaheadTimer: number | null = null
let nextNoteTime = 0 // in AudioContext time
let masterOut: GainNode | null = null
let compressor: DynamicsCompressorNode | null = null

// Noise buffer (shared)
let noiseBuffer: AudioBuffer | null = null

function ensureAudio() {
  if (!ctx) {
    ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  }
  if (ctx.state === 'suspended') {
    ctx.resume()
  }
}

function createNoiseBuffer(context: AudioContext) {
  const bufferSize = context.sampleRate
  const buffer = context.createBuffer(1, bufferSize, context.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1
  }
  return buffer
}

function makeKick(track: Track) {
  track.play = (time: number) => {
    if (!ctx) return
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const out = ctx.createGain()
    out.gain.value = track.volume

    osc.type = 'sine'
    osc.frequency.setValueAtTime(130, time)
    osc.frequency.exponentialRampToValueAtTime(45, time + 0.1)

    gain.gain.setValueAtTime(1.0, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.25)

    const target = masterOut ?? ctx.destination
    osc.connect(gain).connect(out).connect(target)
    osc.start(time)
    osc.stop(time + 0.3)
  }
}

function makeSnare(track: Track) {
  track.play = (time: number) => {
    if (!ctx || !noiseBuffer) return
    const noise = ctx.createBufferSource()
    noise.buffer = noiseBuffer
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'bandpass'
    noiseFilter.frequency.value = 1800
    const noiseGain = ctx.createGain()
    noiseGain.gain.setValueAtTime(0.8, time)
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.15)

    const toneOsc = ctx.createOscillator()
    toneOsc.type = 'triangle'
    toneOsc.frequency.setValueAtTime(220, time)
    const toneGain = ctx.createGain()
    toneGain.gain.setValueAtTime(0.7, time)
    toneGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1)

    const out = ctx.createGain()
    out.gain.value = track.volume

    noise.connect(noiseFilter).connect(noiseGain).connect(out)
    toneOsc.connect(toneGain).connect(out)
    const target = masterOut ?? ctx.destination
    out.connect(target)

    noise.start(time)
    noise.stop(time + 0.2)
    toneOsc.start(time)
    toneOsc.stop(time + 0.2)
  }
}

function makeHiHat(track: Track) {
  track.play = (time: number) => {
    if (!ctx || !noiseBuffer) return
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer

    // Filtering: allow more mid-high energy and add a slight presence bump
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 3500

    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'
    bp.frequency.value = 10000
    bp.Q.value = 0.8

    const shelf = ctx.createBiquadFilter()
    shelf.type = 'highshelf'
    shelf.frequency.value = 2000
    shelf.gain.value = 5

    // Envelope slightly longer + louder so it cuts through
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(1.0, time)
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.11)

    const out = ctx.createGain()
    out.gain.value = track.volume

    const target = masterOut ?? ctx.destination
    src.connect(hp).connect(bp).connect(shelf).connect(gain).connect(out).connect(target)
    src.start(time)
    src.stop(time + 0.14)
  }
}

const tracks = reactive<Track[]>([
  { id: 'kick', name: 'Kick', color: '#7E57C2', volume: 0.9, pattern: Array(steps).fill(false), play: () => {} },
  { id: 'snare', name: 'Snare', color: '#42A5F5', volume: 0.9, pattern: Array(steps).fill(false), play: () => {} },
  { id: 'hihat', name: 'Hi-Hat', color: '#26A69A', volume: 0.85, pattern: Array(steps).fill(false), play: () => {} },
])

// Default starter pattern
tracks[0].pattern[0] = true
tracks[0].pattern[8] = true
tracks[1].pattern[4] = true
tracks[1].pattern[12] = true
for (let i = 2; i < steps; i += 2) tracks[2].pattern[i] = true

function schedule() {
  if (!ctx) return
  const secondsPerBeat = 60.0 / tempo.value
  const sixteenth = secondsPerBeat / 4
  const ahead = 0.12 // seconds to schedule ahead

  while (nextNoteTime < ctx.currentTime + ahead) {
    const step = currentStep.value

    // Apply swing: delay off-beats slightly
    let stepTime = nextNoteTime
    if (swingOn.value && step % 2 === 1) {
      stepTime += swing.value * sixteenth
    }

    // Trigger tracks with active step
    tracks.forEach((t) => {
      if (t.pattern[step]) t.play(stepTime)
    })

    // Advance to next step
    nextNoteTime += sixteenth
    currentStep.value = (currentStep.value + 1) % steps
  }
}

function schedulerTick() {
  schedule()
}

function start() {
  ensureAudio()
  if (!ctx) return
  if (!noiseBuffer) noiseBuffer = createNoiseBuffer(ctx)

  // Master bus setup
  if (!masterOut) {
    masterOut = ctx.createGain()
    masterOut.gain.value = masterVolume.value
  }
  if (!compressor) {
    compressor = ctx.createDynamicsCompressor()
    compressor.threshold.value = -8
    compressor.knee.value = 18
    compressor.ratio.value = 3
    compressor.attack.value = 0.003
    compressor.release.value = 0.15
  }
  try { masterOut.disconnect() } catch {}
  if (limiterOn.value) {
    masterOut.connect(compressor)
    compressor.connect(ctx.destination)
  } else {
    masterOut.connect(ctx.destination)
  }

  // Attach synths
  makeKick(tracks[0])
  makeSnare(tracks[1])
  makeHiHat(tracks[2])

  const now = ctx.currentTime
  nextNoteTime = now + 0.05
  isPlaying.value = true
  // run every 25ms
  lookaheadTimer = window.setInterval(schedulerTick, 25)
}

function stop() {
  if (lookaheadTimer) {
    clearInterval(lookaheadTimer)
    lookaheadTimer = null
  }
  isPlaying.value = false
  currentStep.value = 0
}

function togglePlay() {
  if (isPlaying.value) stop()
  else start()
}

function toggleCell(row: number, col: number) {
  const tr = tracks[row]
  tr.pattern[col] = !tr.pattern[col]
}

function clearAll() {
  tracks.forEach((t) => t.pattern.fill(false))
}

function randomize() {
  tracks.forEach((t) => {
    t.pattern = t.pattern.map((_, idx) => Math.random() < (t.id === 'kick' ? 0.25 : t.id === 'snare' ? 0.2 : 0.45))
  })
}

// --- Persistence ---
const STORAGE_KEY = 'silverMetronome:state:v1'
type Persisted = {
  tempo: number
  swingOn: boolean
  swing: number
  tracks: Array<{ id: string; volume: number; pattern: boolean[] }>
}

function saveState() {
  const data: Persisted = {
    tempo: tempo.value,
    swingOn: swingOn.value,
    swing: swing.value,
    tracks: tracks.map(t => ({ id: t.id, volume: t.volume, pattern: [...t.pattern] })),
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch {}
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw) as Persisted
    if (typeof data.tempo === 'number') tempo.value = data.tempo
    if (typeof data.swingOn === 'boolean') swingOn.value = data.swingOn
    if (typeof data.swing === 'number') swing.value = data.swing
    if (Array.isArray(data.tracks)) {
      data.tracks.forEach(saved => {
        const tr = tracks.find(t => t.id === saved.id)
        if (!tr) return
        if (typeof saved.volume === 'number') tr.volume = saved.volume
        if (Array.isArray(saved.pattern) && saved.pattern.length === steps) {
          tr.pattern = saved.pattern.slice(0, steps)
        }
      })
    }
  } catch {}
}

// If tempo changes while playing, no action needed; scheduler uses latest value
watch(tempo, () => { saveState() })
watch([swingOn, swing], () => { saveState() })
watch(tracks, () => { saveState() }, { deep: true })
watch(masterVolume, (v) => { if (masterOut) masterOut.gain.value = v })
watch(limiterOn, (v) => {
  if (!ctx || !masterOut) return
  try { masterOut.disconnect() } catch {}
  if (v) {
    if (!compressor) {
      compressor = ctx.createDynamicsCompressor()
    }
    masterOut.connect(compressor)
    compressor!.connect(ctx.destination)
  } else {
    try { compressor?.disconnect() } catch {}
    masterOut.connect(ctx.destination)
  }
})

onMounted(() => {
  // Load saved state
  loadState()
  // Safety cleanup on page hide
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && isPlaying.value) stop()
  })
})

onUnmounted(() => {
  stop()
  if (ctx) {
    ctx.close().catch(() => {})
    ctx = null
    masterOut = null
    compressor = null
  }
})
</script>

<style scoped>
.tracks {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.track-row {
  display: grid;
  grid-template-columns: 120px 1fr 110px;
  align-items: center;
  gap: 10px;
}
.track-label {
  display: flex;
  align-items: center;
  font-weight: 500;
}
.step-grid {
  display: grid;
  grid-template-columns: repeat(16, minmax(18px, 1fr));
  gap: 6px;
}
.step.v-btn {
  min-width: 0;
  width: 100%;
  height: 26px;
  padding: 0;
}
.step.active {
  background: color-mix(in srgb, var(--accent) 55%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent) 85%, black 10%);
}
.step.current {
  outline: 2px solid #ffca28;
}
.step.bar {
  box-shadow: inset 0 0 0 1px rgba(100,100,100,0.35);
}
.vol { display: flex; justify-content: end; }
</style>

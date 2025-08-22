<template>
  <v-app>
    <!-- <v-app-bar density="comfortable" flat>
      <v-app-bar-title></v-app-bar-title>
      <v-spacer />
      <v-btn icon="mdi-plus" @click="openDialogForNew" :disabled="isPlaying" :title="'Aggiungi canzone'" />
    </v-app-bar> -->

    <v-main>
      <v-container class="pa-0 ma-0" fluid style="max-width: 100vw;">
                <v-list lines="two" density="comfortable">
                  <v-list-item
                    v-for="(song, index) in songs"
                    :key="song.id"
                    :active="selected?.id === song.id"
                    :class="{ 'selected-song': selected?.id === song.id }"
                    @click="selectSong(song)"
                  >
                    <!-- <template #prepend>
                      <v-avatar size="32">
                        <v-icon>mdi-music</v-icon>
                      </v-avatar>
                    </template> -->
                    <v-list-item-title class="font-medium">{{ song.title }}</v-list-item-title>
                    <v-list-item-subtitle>
                      {{ song.bpm }} BPM • {{ song.beats }}/{{ song.noteValue }}
                    </v-list-item-subtitle>
                    <template #append>
                      <div class="d-flex align-center">
                        <!-- Se questa riga è espansa, mostra i pulsanti -->
                        <template v-if="expandedRowId === song.id">
                          <v-btn
                            :disabled="isPlaying || index===0"
                            icon="mdi-arrow-up"
                            variant="text"
                            class="mr-1"
                            @click.stop="moveUp(index)"
                          />
                          <v-btn
                            :disabled="isPlaying || index===songs.length-1"
                            icon="mdi-arrow-down"
                            variant="text"
                            class="mr-1"
                            @click.stop="moveDown(index)"
                          />
                          <v-btn
                            icon="mdi-pencil"
                            variant="text"
                            @click.stop="openDialogForEdit(song)"
                          />
                          <v-btn
                            icon="mdi-delete"
                            variant="text"
                            color="error"
                            @click.stop="confirmRemove(song.id)"
                          />
                          <!-- pulsante per richiudere -->
                          <v-btn
                            icon="mdi-close"
                            variant="text"
                            class="ml-1"
                            @click.stop="expandedRowId = null"
                          />
                        </template>

                        <!-- Altrimenti mostra solo i tre puntini -->
                        <v-btn
                          v-else
                          icon="mdi-dots-vertical"
                          variant="text"
                          @click.stop="expandedRowId = song.id"
                        />
                      </div>
                    </template>


                  </v-list-item>
                </v-list>
                <template v-if="!songs.length">
                  <div class="pa-6 text-medium-emphasis">Nessuna canzone. Clicca “+” per aggiungerne una.</div>
                </template>
              <v-divider />
              <v-card-actions>
                <v-btn block prepend-icon="mdi-plus" @click="openDialogForNew" :disabled="isPlaying">Aggiungi</v-btn>
              </v-card-actions>
      </v-container>
    </v-main>

    <!-- Dialog nuova/modifica canzone -->
    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title>{{ editTarget ? 'Modifica canzone' : 'Nuova canzone' }}</v-card-title>
        <v-card-text>
          <v-form ref="formRef" @submit.prevent="saveSong">
            <v-text-field v-model="form.title" label="Titolo" required />
            <v-text-field v-model.number="form.bpm" type="number" label="BPM" :min="20" :max="300" required />
            <v-text-field v-model.number="form.beats" type="number" label="Beats (sopra)" :min="1" :max="12" required />
            <v-select v-model="form.noteValue" :items="noteItems" item-title="label" item-value="value" label="Nota (sotto)" required />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="dialog=false">Annulla</v-btn>
          <v-btn color="primary" @click="saveSong">Salva</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Dialog conferma eliminazione -->
    <v-dialog v-model="confirmDialog" max-width="400">
      <v-card>
        <v-card-title>Conferma eliminazione</v-card-title>
        <v-card-text>Vuoi davvero eliminare questa canzone?</v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="confirmDialog=false">Annulla</v-btn>
          <v-btn color="error" @click="doRemove">Elimina</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
<!-- Pannello fisso inferiore: metronomo & editor -->
<v-footer app elevation="15" class="fixed-panel">
  <div class="w-100">
    <!-- Riga compatta -->
    <div class="d-flex align-center justify-space-between flex-wrap gap-2 px-3 py-2">
      <div class="d-flex align-center gap-3 w-100">
        <v-icon class="mr-1">mdi-timer</v-icon>
        <div>
          <div class="text-subtitle-2" v-if="selected">{{ selected.title }}</div>
          <div class="text-medium-emphasis">{{ Math.round(currentBpm) }} BPM</div>
        </div>
        <v-spacer />
        <div class="d-flex align-center justify-center" style="min-width:48px;">
          <v-btn
            :icon="isPlaying ? 'mdi-stop' : 'mdi-play'"
            density="default"
            :color="isPlaying ? 'error' : 'success'"
            @click="toggle"
            class="mx-auto"
          />
        </div>
      </div>

      <v-row class="w-100" align="center" no-gutters>
        <v-col cols="6" class="d-flex align-center">
          <v-switch
        v-model="accentFirst"
        :disabled="isPlaying"
        prepend-icon="mdi-music-circle"
        class="ma-0 pa-0"
          />
        </v-col>
        <v-col cols="6" class="d-flex justify-end align-center">
          <v-btn icon variant="text" @click="panelOpen = !panelOpen">
        <v-icon>{{ panelOpen ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
          </v-btn>
        </v-col>
        <!-- Indicatore battute -->
        <v-col cols="12" class="d-flex justify-center align-center">
          <div
            class="d-flex justify-center align-center flex-wrap w-100"
            style="gap: 12px; min-height: 20px;"
          >
            <div
              v-for="n in beats"
              :key="n"
              class="beat-dot"
              :class="{
                active: isPlaying && (currentBeat === n - 1),
                accent: (n === 1)
              }"
            />
          </div>
        </v-col>

      </v-row>
    </div>

    <!-- Editor espandibile -->
    <v-expand-transition>
      <div v-show="panelOpen" class="px-3 pb-3">
        <v-divider class="mb-3" />
        <v-row class="mt-1" align="center" justify="center">
          <v-col cols="12" md="3">
            <v-text-field type="number" label="BPM" v-model.number="bpm" :min="20" :max="300" :disabled="isPlaying" hide-details />
          </v-col>
          <v-col cols="6" md="3">
            <v-text-field type="number" label="Beats (sopra)" v-model.number="beats" :min="1" :max="12" :disabled="isPlaying" hide-details />
          </v-col>
          <v-col cols="6" md="3">
            <v-select :items="noteItems" item-title="label" item-value="value" label="Nota (sotto)" v-model="noteValue" :disabled="isPlaying" hide-details />
          </v-col>
          <v-col cols="12" md="3" class="d-flex align-center">
            <v-btn block prepend-icon="mdi-content-save" :disabled="!selected || isPlaying" @click="saveEdits">Salva</v-btn>
          </v-col>
        </v-row>
      </div>
    </v-expand-transition>
  </div>
</v-footer>


  </v-app>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { StatusBar, Style } from '@capacitor/status-bar'

// Helpers
const ensureId = (s) => ({ ...s, id: s?.id ?? (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())) })
const expandedRowId = ref(null)

// --- Persistenza semplice con localStorage ---
const STORAGE_KEY = 'metronome_songs_v1'
const loadSongs = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
}
const saveSongs = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))

// Dati principali (migrazione: assegna id mancanti)
const songs = ref(loadSongs().map(ensureId))
saveSongs(songs.value)
const selected = ref(songs.value[0] || null)

// Stato metronomo
const bpm = ref(selected.value?.bpm || 100)
const beats = ref(selected.value?.beats || 4)
const noteValue = ref(selected.value?.noteValue || 4)
const accentFirst = ref(true)
const isPlaying = ref(false)
const currentBeat = ref(0) // 0-based
const currentBpm = ref(bpm.value)
const panelOpen = ref(false)
// AudioContext e scheduling
let audioCtx = null
let nextNoteTime = 0 // quando suonerà la prossima nota (in AudioContext time)
let current16thNote = 0 // conta i 16esimi dal principio della battuta
let schedulerTimer = null

// Calcolo intervallo tra battiti in secondi (in base al BPM e al denominatore del tempo)
const secondsPerBeat = computed(() => {
  return (60.0 / bpm.value) * (4 / noteValue.value)
})

// Selezione canzone
function selectSong(song) {
  const wasPlaying = isPlaying.value
  selected.value = song
  bpm.value = song.bpm
  beats.value = song.beats
  noteValue.value = song.noteValue

  if (wasPlaying && audioCtx) {
    current16thNote = 0
    currentBeat.value = 0
    nextNoteTime = audioCtx.currentTime + 0.1
  }
}

// Salvataggio modifiche sulla canzone selezionata
function saveEdits() {
  if (!selected.value) return
  const clean = (n, min, max, fallback) => Number.isFinite(+n) ? Math.min(max, Math.max(min, +n)) : fallback
  selected.value.bpm = clean(bpm.value, 20, 300, 100)
  selected.value.beats = clean(beats.value, 1, 12, 4)
  selected.value.noteValue = [1,2,4,8,16].includes(+noteValue.value) ? +noteValue.value : 4
  saveSongs(songs.value)
}

// Riordino con pulsanti su/giù (senza dipendenze)
function moveUp(i){ if (i<=0) return; const arr=songs.value; const [m]=arr.splice(i,1); arr.splice(i-1,0,m); saveSongs(arr) }
function moveDown(i){ if (i>=songs.value.length-1) return; const arr=songs.value; const [m]=arr.splice(i,1); arr.splice(i+1,0,m); saveSongs(arr) }

// Riproduzione click
function playClick(accent = false, when = 0) {
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.frequency.value = accent ? 1800 : 1200
  gain.gain.value = 0.0001
  osc.connect(gain).connect(audioCtx.destination)
  osc.start(when)
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(0.8, when + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03)
  osc.stop(when + 0.05)
}

// Scheduling
const lookahead = 25;
const scheduleAheadTime = 0.1;

function nextNote() {
  const spb = secondsPerBeat.value
  nextNoteTime += spb
  current16thNote++
  if (current16thNote >= beats.value) {
    current16thNote = 0
  }
}

function scheduler() {
  while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
    const isAccent = accentFirst.value && current16thNote === 0
    playClick(isAccent, nextNoteTime)
    const beatIndex = current16thNote
    const delay = Math.max(0, (nextNoteTime - audioCtx.currentTime) * 1000)
    setTimeout(() => { currentBeat.value = beatIndex }, delay)

    nextNote()
  }
}

function start() {
  try { KeepAwake.keepAwake(); } catch (e) {}
  if (isPlaying.value) return
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)()
  } else if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }

  isPlaying.value = true
  current16thNote = 0
  currentBeat.value = 0
  nextNoteTime = audioCtx.currentTime + 0.1

  schedulerTimer = setInterval(() => {
    scheduler()
  }, lookahead)
}

function stop() {
  try { KeepAwake.allowSleep(); } catch (e) {}
  if (!isPlaying.value) return

  isPlaying.value = false

  if (schedulerTimer) {
    clearInterval(schedulerTimer)
    schedulerTimer = null
  }
  if (audioCtx && audioCtx.state !== 'closed') {
    audioCtx.suspend()
  }
}

function toggle() {
  isPlaying.value ? stop() : start()
}

let bpmMonitor = null
onMounted(async() => {
  try {
    // Colore di sfondo (nero, puoi metterlo come il tema di Vuetify)
    await StatusBar.setBackgroundColor({ color: '#000000' })

    // Stile delle icone (Dark = testo nero, Light = testo bianco)
    await StatusBar.setStyle({ style: Style.Light })

    // Assicurati che la status bar sia visibile
    await StatusBar.show()
  } catch (err) {
    console.warn('StatusBar plugin non disponibile sul web:', err)
  }
  if (!songs.value.length) {
    songs.value = [
      { id: crypto.randomUUID(), title: 'Brano di esempio', bpm: 100, beats: 4, noteValue: 4 },
    ]
    saveSongs(songs.value)
    selected.value = songs.value[0]
  }

  bpmMonitor = setInterval(() => {
    currentBpm.value = bpm.value
  }, 500)
})

onBeforeUnmount(() => {
  try { KeepAwake.allowSleep(); } catch (e) {}
  if (schedulerTimer) clearInterval(schedulerTimer)
  if (bpmMonitor) clearInterval(bpmMonitor)
  if (audioCtx && audioCtx.state !== 'closed') audioCtx.close()
})

watch(songs, saveSongs, { deep: true })

// Dialog gestione canzone
const dialog = ref(false)
const formRef = ref(null)
const form = reactive({ title: '', bpm: 100, beats: 4, noteValue: 4 })
const editTarget = ref(null)

const noteItems = [
  { label: '1 (semibreve)', value: 1 },
  { label: '2 (minima)', value: 2 },
  { label: '4 (semiminima)', value: 4 },
  { label: '8 (croma)', value: 8 },
  { label: '16 (semicroma)', value: 16 },
]

function openDialogForNew() {
  editTarget.value = null
  Object.assign(form, { title: '', bpm: 100, beats: 4, noteValue: 4 })
  dialog.value = true
}
function openDialogForEdit(song) {
  editTarget.value = song
  Object.assign(form, { title: song.title, bpm: song.bpm, beats: song.beats, noteValue: song.noteValue })
  dialog.value = true
}
function saveSong() {
  const clean = (n, min, max, fallback) => Number.isFinite(+n) ? Math.min(max, Math.max(min, +n)) : fallback
  const data = {
    title: (form.title || '').trim() || 'Senza titolo',
    bpm: clean(form.bpm, 20, 300, 100),
    beats: clean(form.beats, 1, 12, 4),
    noteValue: [1,2,4,8,16].includes(+form.noteValue) ? +form.noteValue : 4,
  }
  if (editTarget.value) {
    Object.assign(editTarget.value, data)
  } else {
    songs.value.push({ id: crypto.randomUUID(), ...data })
  }
  saveSongs(songs.value)
  if (!selected.value) selected.value = songs.value[0]
  dialog.value = false
}

// Conferma eliminazione
const confirmDialog = ref(false)
const songToRemove = ref(null)

function confirmRemove(id) {
  songToRemove.value = id
  confirmDialog.value = true
}
function doRemove() {
  if (isPlaying.value) return
  const id = songToRemove.value
  const idx = songs.value.findIndex(s => s.id === id)
  if (idx >= 0) {
    const wasSelected = selected.value?.id === id
    songs.value.splice(idx, 1)
    saveSongs(songs.value)
    if (wasSelected) selected.value = songs.value[0] || null
  }
  confirmDialog.value = false
}
</script>

<style scoped>
.beat-dot {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 2px solid currentColor;
  opacity: 0.35;
}
.beat-dot.active {
  transform: scale(1.2);
  opacity: 1;
}
.beat-dot.accent {
  border-width: 3px;
}
.selected-song {
  background-color: rgba(20,180,180,0.05) !important;
}
</style>

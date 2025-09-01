<template>
  <v-app>
    <!-- App Bar con gestione playlist -->
    <v-app-bar density="comfortable">
      <v-app-bar-title>
        <v-icon class="mr-2" color="primary">mdi-music</v-icon>
      </v-app-bar-title>
      <!-- Selettore playlist -->
      <v-select
        v-model="selectedPlaylistId"
        :items="playlists"
        item-title="name"
        item-value="id"
        density="comfortable"
        hide-details
        variant="outlined"
        style="max-width: 240px"
        class="mr-2"
      />

      <!-- Azioni playlist -->
      <v-btn icon="mdi-playlist-plus" title="Nuova playlist" @click="addPlaylist()" />
      <v-menu>
        <template #activator="{ props }">
          <v-btn v-bind="props" icon="mdi-cog" title="Gestisci playlist" />
        </template>
        <v-list>
          <v-list-item :disabled="!selectedPlaylistId" @click="onRenamePlaylist">
            <v-list-item-title>Rinomina</v-list-item-title>
          </v-list-item>
          <v-list-item :disabled="!selectedPlaylistId" @click="selectedPlaylistId && duplicatePlaylist(selectedPlaylistId)">
            <v-list-item-title>Duplica</v-list-item-title>
          </v-list-item>
          <v-list-item :disabled="playlists.length<=1 || !selectedPlaylistId" @click="selectedPlaylistId && removePlaylist(selectedPlaylistId)">
            <v-list-item-title class="text-error">Elimina</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>

    <!-- Lista canzoni -->
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
            <v-list-item-title class="font-medium">{{ song.title }}</v-list-item-title>
            <v-list-item-subtitle>
              {{ song.bpm }} BPM • {{ song.beats }}/{{ song.noteValue }}
            </v-list-item-subtitle>

            <template #append>
              <div class="d-flex align-center">
                <template v-if="expandedRowId === song.id">
                  <v-btn :disabled="isPlaying || index===0" icon="mdi-arrow-up" variant="text" class="mr-1" @click.stop="moveUp(index)" />
                  <v-btn :disabled="isPlaying || index===songs.length-1" icon="mdi-arrow-down" variant="text" class="mr-1" @click.stop="moveDown(index)" />
                  <v-btn icon="mdi-pencil" variant="text" @click.stop="openDialogForEdit(song)" />
                  <v-btn icon="mdi-delete" variant="text" color="error" @click.stop="confirmRemove(song.id)" />
                  <v-btn icon="mdi-close" variant="text" class="ml-1" @click.stop="expandedRowId = null" />
                </template>
                <v-btn v-else icon="mdi-dots-vertical" variant="text" @click.stop="expandedRowId = song.id" />
              </div>
            </template>
          </v-list-item>
        </v-list>

        <template v-if="!songs.length">
          <div class="pa-6 text-medium-emphasis">Nessuna canzone. Clicca “+” per aggiungerne una.</div>
        </template>

        <v-divider />
        <v-card-actions>
          <v-btn block prepend-icon="mdi-plus" @click="openDialogForNew" :disabled="isPlaying">Aggiungi Brano</v-btn>
        </v-card-actions>
      </v-container>
    </v-main>

    <!-- Dialog nuova/modifica canzone -->
    <v-dialog v-model="dialog" max-width="520">
      <v-card>
        <v-card-title>{{ editTarget ? 'Modifica brano' : 'Aggiungi brano' }}</v-card-title>
        <v-card-text>
          <v-divider class="my-4" />
          <v-select
            v-if="!editTarget"
            v-model="form.existingSongIds"
            :items="otherSongsOptions"
            item-title="label"
            item-value="value"
            label="Brani da altre playlist"
            hint="Seleziona uno o più brani da copiare nella playlist corrente"
            density="compact"
              :menu-props="{
              maxHeight: '400px',
              minWidth: '300px',
              offsetY: true,
              contentClass: 'custom-select-menu'
              }"
            multiple
            chips
          />
          <v-divider class="my-4" />
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
              <div class="d-flex justify-center align-center flex-wrap w-100" style="gap: 12px; min-height: 20px;">
                <div
                  v-for="n in beats"
                  :key="n"
                  class="beat-dot"
                  :class="{ active: isPlaying && (currentBeat === n - 1), accent: (n === 1) }"
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
import { Capacitor } from '@capacitor/core'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { StatusBar, Style } from '@capacitor/status-bar'

// Helpers
const ensureId = (s) => ({ ...s, id: s?.id ?? (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())) })
const expandedRowId = ref(null)

// --- Modello Playlist ---
const STORAGE_KEY = 'metronome_playlists_v1'
const OLD_KEY = 'metronome_songs_v1'

function loadPlaylists() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (Array.isArray(data)) {
        // Caso 1: già playlist corrette (hanno .songs)
        if (data.length === 0 || data[0]?.songs) {
          return data
        }
        // Caso 2: array di canzoni salvato per errore (shape flat)
        if (data[0]?.title || data[0]?.bpm) {
          return [{ id: crypto.randomUUID(), name: 'Importata', songs: data.map(ensureId) }]
        }
      }
    }
    // Migrazione dal vecchio storage
    const old = JSON.parse(localStorage.getItem(OLD_KEY) || '[]')
    const migrated = [{ id: crypto.randomUUID(), name: 'Default', songs: (old || []).map(ensureId) }]
    localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated))
    return migrated
  } catch {
    return []
  }
}

function savePlaylists(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
}
// Helper unico di persistenza
const persist = () => savePlaylists(playlists.value)

// Stato principale
const playlists = ref(loadPlaylists())
const selectedPlaylistId = ref(playlists.value[0]?.id || null)

const currentPlaylist = computed(() => playlists.value.find(p => p.id === selectedPlaylistId.value) || null)

const songs = computed({
  get: () => currentPlaylist.value?.songs || [],
  set: (val) => { if (currentPlaylist.value) { currentPlaylist.value.songs = val; persist() } },
})

// Canzone selezionata
const selected = ref(songs.value[0] || null)

// Cambi playlist → reset canzone
watch(selectedPlaylistId, () => {
  const first = songs.value[0] || null
  selected.value = first
  if (first) { bpm.value = first.bpm; beats.value = first.beats; noteValue.value = first.noteValue }
})

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
let nextNoteTime = 0
let current16thNote = 0
let schedulerTimer = null

// Calcolo intervallo tra battiti (supporta 7/8, 6/16, ...)
const secondsPerBeat = computed(() => (60.0 / bpm.value) * (4 / noteValue.value))

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
  persist()
}

// Riordino con pulsanti su/giù (senza dipendenze)
function moveUp(i){ if (i<=0) return; const arr=songs.value; const [m]=arr.splice(i,1); arr.splice(i-1,0,m); persist() }
function moveDown(i){ if (i>=songs.value.length-1) return; const arr=songs.value; const [m]=arr.splice(i,1); arr.splice(i+1,0,m); persist() }

// Riproduzione click
function playClick(accent = false, when = 0) {
  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()
  osc.frequency.value = accent ? 1900 : 1200
  gain.gain.value = 0.0001
  osc.connect(gain).connect(audioCtx.destination)
  osc.start(when)
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(accent ? 1.0 : 0.8, when + 0.001)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.05)
  osc.stop(when + 0.07)
}

function onRenamePlaylist() {
  if (!selectedPlaylistId.value) return
  const name = prompt('Nuovo nome playlist') || ''
  renamePlaylist(selectedPlaylistId.value, name)
}

// Scheduling
const lookahead = 25
const scheduleAheadTime = 0.1

function nextNote() {
  const spb = secondsPerBeat.value
  nextNoteTime += spb
  current16thNote++
  if (current16thNote >= beats.value) current16thNote = 0
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
  try { KeepAwake.keepAwake() } catch (e) {}
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
  schedulerTimer = setInterval(() => { scheduler() }, lookahead)
}

function stop() {
  try { KeepAwake.allowSleep() } catch (e) {}
  if (!isPlaying.value) return
  isPlaying.value = false
  if (schedulerTimer) { clearInterval(schedulerTimer); schedulerTimer = null }
  if (audioCtx && audioCtx.state !== 'closed') { audioCtx.suspend() }
}

function toggle() { isPlaying.value ? stop() : start() }

let bpmMonitor = null
onMounted(async () => {
  // Status bar solo su device
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setOverlaysWebView({ overlay: false })
      await StatusBar.setBackgroundColor({ color: '#000000' })
      await StatusBar.setStyle({ style: Style.Light })
      await StatusBar.show()
    } catch (err) { console.warn('StatusBar non disponibile:', err) }
  }

  // Se non ci sono canzoni nella playlist corrente, crea un esempio
  if (!songs.value.length) {
    songs.value = [ { id: crypto.randomUUID(), title: 'Brano di esempio', bpm: 100, beats: 4, noteValue: 4 } ]
    persist()
    selected.value = songs.value[0]
  }

  bpmMonitor = setInterval(() => { currentBpm.value = bpm.value }, 500)
})

onBeforeUnmount(() => {
  try { KeepAwake.allowSleep() } catch (e) {}
  if (schedulerTimer) clearInterval(schedulerTimer)
  if (bpmMonitor) clearInterval(bpmMonitor)
  if (audioCtx && audioCtx.state !== 'closed') audioCtx.close()
})

// Persistenza profonda di ogni modifica a qualunque playlist/canzone
watch(playlists, savePlaylists, { deep: true })

// Dialog gestione canzone
const dialog = ref(false)
const formRef = ref(null)
const form = reactive({ title: '', bpm: 100, beats: 4, noteValue: 4, existingSongIds: [] })
const editTarget = ref(null)

const noteItems = [
  { label: '1 (semibreve)', value: 1 },
  { label: '2 (minima)', value: 2 },
  { label: '4 (semiminima)', value: 4 },
  { label: '8 (croma)', value: 8 },
  { label: '16 (semicroma)', value: 16 },
]

const otherSongsOptions = computed(() => {
  const curId = selectedPlaylistId.value
  const out = []
  playlists.value.forEach(p => {
    if (p.id === curId) return
    p.songs.forEach(s => {
      out.push({
        label: `${p.name} — ${s.title} (${s.bpm} BPM • ${s.beats}/${s.noteValue})`,
        value: `${p.id}:${s.id}`,
      })
    })
  })
  return out
})


function openDialogForNew() {
  editTarget.value = null
  Object.assign(form, { title: '', bpm: 100, beats: 4, noteValue: 4, existingSongIds: [] })
  dialog.value = true
}
function openDialogForEdit(song) {
  editTarget.value = song
  Object.assign(form, { title: song.title, bpm: song.bpm, beats: song.beats, noteValue: song.noteValue, existingSongIds: [] })
  dialog.value = true
}
function saveSong() {
  const clean = (n, min, max, fallback) => Number.isFinite(+n) ? Math.min(max, Math.max(min, +n)) : fallback

  // 1) Copia brani selezionati da altre playlist
  if (Array.isArray(form.existingSongIds) && form.existingSongIds.length) {
    form.existingSongIds.forEach(key => {
      const [pid, sid] = String(key).split(':')
      const pl = playlists.value.find(p => p.id === pid)
      const src = pl?.songs.find(s => s.id === sid)
      if (src) {
        songs.value.push({
          id: crypto.randomUUID(),
          title: src.title,
          bpm: clean(src.bpm, 20, 300, 100),
          beats: clean(src.beats, 1, 12, 4),
          noteValue: [1,2,4,8,16].includes(+src.noteValue) ? +src.noteValue : 4,
        })
      }
    })
  }

  // 2) Crea/aggiorna nuovo brano se c'è un titolo
  const hasNewTitle = (form.title || '').trim().length > 0
  if (hasNewTitle) {
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
  } else if (editTarget.value) {
    // in modifica, aggiorna almeno i campi numerici
    const data = {
      title: editTarget.value.title,
      bpm: clean(form.bpm, 20, 300, 100),
      beats: clean(form.beats, 1, 12, 4),
      noteValue: [1,2,4,8,16].includes(+form.noteValue) ? +form.noteValue : 4,
    }
    Object.assign(editTarget.value, data)
  }

  persist()
  if (!selected.value && songs.value.length) selected.value = songs.value[0]
  dialog.value = false
}


// Conferma eliminazione
const confirmDialog = ref(false)
const songToRemove = ref(null)

function confirmRemove(id) { songToRemove.value = id; confirmDialog.value = true }
function doRemove() {
  if (isPlaying.value) return
  const id = songToRemove.value
  const idx = songs.value.findIndex(s => s.id === id)
  if (idx >= 0) {
    const wasSelected = selected.value?.id === id
    songs.value.splice(idx, 1)
    persist()
    if (wasSelected) selected.value = songs.value[0] || null
  }
  confirmDialog.value = false
}

// Playlist CRUD
function addPlaylist(name = 'Nuova playlist') {
  const p = { id: crypto.randomUUID(), name, songs: [] }
  playlists.value.push(p)
  selectedPlaylistId.value = p.id
  persist()
}
function renamePlaylist(id, name) {
  const p = playlists.value.find(x => x.id === id); if (!p) return
  p.name = (name || '').trim() || p.name
  persist()
}
function duplicatePlaylist(id) {
  const src = playlists.value.find(x => x.id === id); if (!src) return
  const copy = { id: crypto.randomUUID(), name: `${src.name} (copia)`, songs: src.songs.map(s => ({ ...s, id: crypto.randomUUID() })) }
  playlists.value.push(copy)
  selectedPlaylistId.value = copy.id
  persist()
}
function removePlaylist(id) {
  if (playlists.value.length <= 1) return
  const idx = playlists.value.findIndex(x => x.id === id); if (idx < 0) return
  const removingCurrent = selectedPlaylistId.value === id
  playlists.value.splice(idx, 1)
  if (removingCurrent) selectedPlaylistId.value = playlists.value[0]?.id || null
  persist()
}
</script>

<style scoped>
.fixed-panel { backdrop-filter: saturate(140%) blur(6px); }
@media (max-width: 600px) { .fixed-panel { padding-bottom: env(safe-area-inset-bottom); } }

.beat-dot { width: 18px; height: 18px; border-radius: 999px; border: 2px solid currentColor; opacity: 0.35; }
.beat-dot.active { transform: scale(1.2); opacity: 1; }
.beat-dot.accent { border-width: 3px; }

.selected-song { background-color: rgba(20,180,180,0.06) !important; }
</style>

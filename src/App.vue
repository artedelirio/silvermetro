<template>

  <v-app :style="appStyle">
    <!-- App Bar con gestione playlist -->
    <v-app-bar density="comfortable">
      <v-app-bar-title>
        <v-icon class="mr-2" color="primary">mdi-music</v-icon>
      </v-app-bar-title>

      <!-- Selettore playlist (solo da Firestore) -->
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
        :disabled="!cloudReady"
      />

      <!-- Azioni playlist -->
      <v-menu>
        <template #activator="{ props }">
          <v-btn v-bind="props" icon="mdi-playlist-plus" title="Gestisci playlist" :disabled="!cloudReady" />
        </template>
        <v-list>
          <v-list-item @click="addPlaylist()" :disabled="!cloudReady">
        <v-list-item-title>Nuova playlist</v-list-item-title>
          </v-list-item>
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

      <!-- Import JSON in playlist corrente -->
      <!-- <v-btn icon="mdi-file-import" title="Importa brani da JSON" :disabled="!cloudReady || !selectedPlaylistId" @click="fileInput && fileInput.click()" />
      <input ref="fileInput" type="file" accept="application/json" class="d-none" @change="onImportFile"/>

      <v-spacer /> -->

      <!-- Stato cloud: solo icona colorata -->
      <v-icon
        class="mr-2"
        :color="!cloudReady ? 'grey' : (!cloudSynced ? 'amber' : 'green')"
        title="Stato cloud"
      >
        mdi-cloud
      </v-icon>
    </v-app-bar>

    <!-- Lista canzoni -->
    <v-main>
      <v-container class="pa-0 ma-0" fluid style="max-width: 100vw;">
        <v-skeleton-loader v-if="!cloudReady" type="list-item-two-line@6" class="ma-4" />

        <v-list v-else lines="two" density="comfortable">
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

        <template v-if="cloudReady && !songs.length">
          <div class="pa-6 text-medium-emphasis">Nessuna canzone. Clicca “+” per aggiungerne una.</div>
        </template>

        <v-divider />
        <v-card-actions>
          <v-btn block prepend-icon="mdi-plus" @click="openDialogForNew" :disabled="isPlaying || !cloudReady">Aggiungi Brano</v-btn>
        </v-card-actions>
      </v-container>
    </v-main>

    <!-- Dialog nuova/modifica canzone -->
    <v-dialog v-model="dialog" fullscreen scrollable>
      <v-card>
        <v-card-title>{{ editTarget ? 'Modifica brano' : 'Aggiungi brano' }}</v-card-title>
        <v-card-text>
          <v-select
            v-if="!editTarget"
            v-model="form.existingSongIds"
            :items="otherSongsOptions"
            item-title="label"
            item-value="value"
            label="Brani da altre playlist"
            hint="Seleziona uno o più brani da copiare nella playlist corrente"
            density="compact"
            :menu-props="{ maxHeight: '400px', minWidth: '300px', offsetY: true, contentClass: 'custom-select-menu' }"
            multiple
            chips
          />
          <v-form ref="formRef" @submit.prevent="saveSong">
            <v-text-field v-model="form.title" label="Titolo" required />
            <v-text-field v-model.number="form.bpm" type="number" label="BPM" :min="20" :max="300" required />
            <v-row>
              <v-col cols="6">
                <v-text-field
                  v-model.number="form.beats"
                  type="number"
                  :min="1"
                  :max="12"
                  required
                  hide-details
                  density="compact"
                  style="margin-bottom:0"
                />
              </v-col>
              <v-col cols="1" class="d-flex align-center justify-center px-0" style="max-width:24px;">
                <span style="font-size: 1.4em; font-weight: 500;">/</span>
              </v-col>
              <v-col cols="5">
                <v-select
                  v-model="form.noteValue"
                  :items="noteItems"
                  item-title="label"
                  item-value="value"
                  required
                  hide-details
                  density="compact"
                  style="margin-bottom:0"
                />
              </v-col>
            </v-row>
            <div style="margin-bottom: 12px;"></div>
            <v-textarea
              v-model="form.lyrics"
              class="mono-textarea"
              label="Testo"
              auto-grow
              rows="6"
              hint="Usa testo monospaziato per allineare gli accordi"
            />
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
	<v-footer app elevation="15" class="fixed-panel pa-1">
	  <div class="w-100">
		<!-- Riga compatta -->
		<div class="d-flex align-center justify-space-between flex-wrap gap-2 px-3 py-2">
		  <div class="d-flex align-center gap-3 w-100">
			<v-btn
			  icon
			  class="mr-1"
			  :color="metronomeEnabled ? 'red' : 'grey'"
			  @click="metronomeEnabled = !metronomeEnabled"
			  :title="metronomeEnabled ? 'Metronomo attivo' : 'Metronomo disattivato'"
			>
			  <v-icon>{{ metronomeEnabled ? 'mdi-timer' : 'mdi-timer-off' }}</v-icon>
			</v-btn>
			<div>
        <div
          class="text-subtitle-2"
          v-if="selected"
          style="max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
          :title="selected.title"
        >
          {{ selected.title }}
        </div>
			  <div class="text-medium-emphasis">{{ Math.round(currentBpm) }} BPM</div>
			</div>
			<v-spacer />
			<div class="d-flex align-right" style="min-width:120px; gap:4px;">
			  <v-btn
				:disabled="!selected || songs.length <= 1 || (selected && songs[0]?.id === selected.id)"
				icon="mdi-skip-previous"
				density="default"
				variant="text"
				@click="goPrevSong"
				title="Brano precedente"
			  />
			  <v-btn
				:icon="isPlaying ? 'mdi-stop' : 'mdi-play'"
				density="default"
				:color="isPlaying ? 'error' : 'success'"
				@click="toggle"
				class="mx-auto"
				title="Play/Stop"
			  />
			  <v-btn
				:disabled="!selected || songs.length <= 1 || (selected && songs[songs.length-1]?.id === selected.id)"
				icon="mdi-skip-next"
				density="default"
				variant="text"
				@click="goNextSong"
				title="Brano successivo"
			  />
			</div>
		  </div>

		  <v-row class="w-100" align="center" no-gutters>
			<v-col cols="6" class="d-flex align-center" style="gap: 12px;">
			  <v-switch
				v-model="accentFirst"
				:disabled="isPlaying"
				prepend-icon="mdi-music-circle"
				class="ma-0 pa-0"
			  />
			  <v-switch
				v-model="italianChords"
				:disabled="!selected"
				:prepend-icon="italianChords ? 'mdi-translate-variant' : 'mdi-translate-off'"
				class="ma-0 pa-0"
			  />
			</v-col>
			<v-col cols="6" class="d-flex justify-end align-center" style="gap:4px;">
			  <v-btn icon @click="panelOpen = !panelOpen" :title="panelOpen ? 'Chiudi editor' : 'Apri editor'">
				<v-icon>{{ panelOpen ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
			  </v-btn>
			  <v-btn icon @click="panelFullscreen = true" title="Apri a tutto schermo">
				<v-icon>mdi-arrow-expand</v-icon>
			  </v-btn>
			</v-col>
			<!-- Indicatore battute -->
			<v-col cols="4" class="d-flex justify-center align-center">
			  <!-- <div class="d-flex justify-center align-center flex-wrap w-100" style="gap: 12px; min-height: 20px;">
				<div
				  v-for="n in beats"
				  :key="n"
				  class="beat-dot"
				  :class="{ active: isPlaying && (currentBeat === n - 1), accent: (n === 1) }"
				/>
			  </div> -->
			</v-col>
      </v-row>
      <v-row class="align-center" no-gutters>
        <!-- Slider velocità nel pannellino -->
        <v-col cols="6" v-if="selected" class="d-flex align-center">
          <v-slider
        v-model.number="scrollMultiplierModel"
        :min="0.1"
        :max="2"
        :step="0.1"
        :thumb-label="false"
        @end="saveSharedFlush"
        @change="saveSharedFlush"
          />
        </v-col>
        <v-col cols="2" class="d-flex align-center justify-end pr-3" v-if="selected">
          <div class="text-caption text-medium-emphasis">
        {{ scrollMultiplierModel.toFixed(1) }}×
          </div>
        </v-col>
      </v-row>
		</div>

		<!-- Editor espandibile -->
<v-expand-transition> <div v-show="panelOpen" class="pa-0">
<div
  v-if="selected && selected.lyrics"
  ref="lyricsPanelEl"
  class="lyrics-viewer mt-2 ma-0 mb-5"
  style="max-height: 20vh; overflow-y: auto; font-family: ui-monospace, monospace; font-size: 0.98em; background: #f8f8f8; border-radius: 6px; padding: 8px 12px; white-space: pre-wrap;"
  @pointerdown="onUserScrollStart"
  @touchstart.passive="onUserScrollStart"
  @wheel.passive="onUserScrollStart"
  @scroll.passive="onUserScrollActivity"
>
  <pre class="lyrics-pre">{{ displayLyrics }}</pre>
</div>
</div> </v-expand-transition>
	  </div>
	</v-footer>
	<!-- Fullscreen Panel -->
<!-- Fullscreen Panel -->
  <v-dialog v-model="panelFullscreen" fullscreen scrollable transition="dialog-bottom-transition">
    <v-card class="d-flex flex-column" style="height: 100vh;">
      <v-toolbar density="comfortable">
        <v-btn icon="mdi-close" variant="text" @click="panelFullscreen=false"/>
        <v-toolbar-subtitle>{{ selected?.title || 'Nessun brano' }}</v-toolbar-subtitle>
        <v-spacer />
        <!-- Font size controls for fullscreen lyrics -->
        <v-btn
          icon="mdi-format-font-size-decrease"
          variant="text"
          :disabled="!selected"
          @click="decreaseFullscreenFont"
          title="Testo -"
        />
        <v-btn
          icon="mdi-format-font-size-increase"
          variant="text"
          :disabled="!selected"
          @click="increaseFullscreenFont"
          title="Testo +"
        />
        <v-btn
          :disabled="!selected || songs.length <= 1 || (selected && songs[0]?.id === selected.id)"
          icon="mdi-skip-previous"
          variant="text"
          @click="goPrevSong"
        />
        <v-btn :icon="isPlaying ? 'mdi-stop' : 'mdi-play'" 
               :color="isPlaying ? 'error' : 'success'" 
               @click="toggle" />
        <v-btn
          :disabled="!selected || songs.length <= 1 || (selected && songs[songs.length-1]?.id === selected.id)"
          icon="mdi-skip-next"
          variant="text"
          @click="goNextSong"
        />
      </v-toolbar>
      
      <div v-if="selected" class="px-4 pt-2 pb-3">
        <v-slider
          v-model.number="scrollMultiplierModel"
          :min="0.1"
          :max="2"
          :step="0.1"
          :thumb-label="false"
          label="Velocità"
          class="mb-2"
          @end="saveSharedFlush"
          @change="saveSharedFlush"
        />
        <div class="text-caption text-medium-emphasis text-center">
          {{ scrollMultiplierModel.toFixed(1) }}×
        </div>
      </div>
      
      <v-card-text class="pa-0 flex-grow-1" style="min-height: 0; overflow: hidden;">
        <div 
          ref="lyricsFullscreenEl" 
          class="lyrics-fullscreen-container"
          style="height: 100%; overflow-y: auto; padding: 16px;"
          @pointerdown="onUserScrollStart"
          @touchstart.passive="onUserScrollStart"
          @wheel.passive="onUserScrollStart"
          @scroll.passive="onUserScrollActivity"
        >
          <pre 
            class="lyrics-pre" 
            :style="{ minHeight: '100%', fontSize: fullscreenFontScale + 'em' }"
          >{{ displayLyrics || '— Nessun testo —' }}</pre>
        </div>
      </v-card-text>
    </v-card>
  </v-dialog>

  </v-app>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Capacitor } from '@capacitor/core'
import { KeepAwake } from '@capacitor-community/keep-awake'
import { StatusBar, Style } from '@capacitor/status-bar'
import { initializeApp, getApps } from 'firebase/app'
import { getFirestore, doc, getDoc, setDoc, onSnapshot, runTransaction, serverTimestamp } from 'firebase/firestore'
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth'
import Drum from './Drum.vue'


const lyricsPanelEl = ref(null)
const lyricsFullscreenEl = ref(null)
// Helpers
const ensureId = (s) => ({ ...s, id: s?.id ?? (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())) })
const expandedRowId = ref(null)

// Config da .env (Vite)
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FB_API_KEY,
  authDomain: import.meta.env.VITE_FB_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FB_PROJECT_ID,
  appId: import.meta.env.VITE_FB_APP_ID,
}

// Inizializza una volta
const appFb = getApps().length ? getApps()[0] : initializeApp(firebaseConfig)
const db = getFirestore(appFb)
const auth = getAuth(appFb)

// Riferimento al documento condiviso (singolo)
const sharedRef = doc(db, 'shared', 'global')

// Stato cloud
const cloudReady = ref(false)   // auth + primo fetch completati
const cloudSynced = ref(false)  // ultimo write o snapshot applicato
let lastLocalRev = 0            // rev dell'ultimo write locale

// --- MODELLO CLOUD ---
// Struttura doc: { playlists: Playlist[], selectedId: string|null, rev: number, updatedAt: Timestamp }

// Stato principale (solo RAM, nessun localStorage)
const playlists = ref([])
const selectedPlaylistId = ref(null)

const currentPlaylist = computed(() => playlists.value.find(p => p.id === selectedPlaylistId.value) || null)

const songs = computed({
  get: () => currentPlaylist.value?.songs || [],
  set: (val) => { if (currentPlaylist.value) { currentPlaylist.value.songs = val; saveSharedDebounced() } },
})

// Canzone selezionata
const selected = ref(null)

// Cambi playlist → reset canzone
watch(selectedPlaylistId, () => {
  const first = songs.value[0] || null
  const wasPlaying = isPlaying.value
  selected.value = first
  if (first) { bpm.value = first.bpm; beats.value = first.beats; noteValue.value = first.noteValue }
  // When playlist changes, also reset lyrics scroll
  nextTick(() => {
    stopAutoScroll()
    resetAutoScroll()
    if (wasPlaying && Number(selected.value?.scrollSpeed || 0) > 0) {
      startAutoScroll()
    }
  })
  saveSharedDebounced()
})

// Stato metronomo
const bpm = ref(100)
const beats = ref(4)
const noteValue = ref(4)
const accentFirst = ref(true)
const isPlaying = ref(false)
const currentBeat = ref(0) // 0-based
const currentBpm = ref(bpm.value)
const panelOpen = ref(false)
const panelFullscreen = ref(false)
const metronomeEnabled = ref(true)
// Fullscreen lyrics font size (per-device)
const fullscreenFontScale = ref(1)
// Toggle rendering chords in Italian notation
const italianChords = ref(false)

// AudioContext e scheduling
let audioCtx = null
let nextNoteTime = 0
let current16thNote = 0
let schedulerTimer = null

// Calcolo intervallo tra battiti
const secondsPerBeat = computed(() => (60.0 / bpm.value) * (4 / noteValue.value))

// Selezione canzone
function selectSong(song) {
  const wasPlaying = isPlaying.value
  selected.value = song
  bpm.value = song.bpm
  beats.value = song.beats
  noteValue.value = song.noteValue
  if (selected.value && typeof selected.value.scrollSpeed === 'undefined') {
    selected.value.scrollSpeed = 0          // ← default
  }
  if (selected.value && typeof selected.value.scrollMultiplier === 'undefined') {
    selected.value.scrollMultiplier = 1      // ← default
  }
  if (wasPlaying && audioCtx) {
    current16thNote = 0
    currentBeat.value = 0
    nextNoteTime = audioCtx.currentTime + 0.1
  }
  // Reset scrolling lyrics on song change
  nextTick(() => {
    stopAutoScroll()
    resetAutoScroll()
    if (wasPlaying && getEffectiveScrollSpeed() > 0) {
      startAutoScroll()
    }
  })
}



// Salvataggio modifiche sulla canzone selezionata
function saveEdits() {
  if (!selected.value) return
  const clean = (n, min, max, fallback) => Number.isFinite(+n) ? Math.min(max, Math.max(min, +n)) : fallback
  selected.value.bpm = clean(bpm.value, 20, 300, 100)
  selected.value.beats = clean(beats.value, 1, 12, 4)
  selected.value.noteValue = [1,2,4,8,16].includes(+noteValue.value) ? +noteValue.value : 4
  saveSharedDebounced()
}

// Riordino con pulsanti su/giù
function moveUp(i){ if (i<=0) return; const arr=songs.value; const [m]=arr.splice(i,1); arr.splice(i-1,0,m); saveSharedDebounced() }
function moveDown(i){ if (i>=songs.value.length-1) return; const arr=songs.value; const [m]=arr.splice(i,1); arr.splice(i+1,0,m); saveSharedDebounced() }

// Riproduzione click
function playClick(accent = false, when = 0) {
  if (!metronomeEnabled.value) return
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
  if (getEffectiveScrollSpeed() > 0) startAutoScroll()
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
  stopAutoScroll()
}

function toggle() { isPlaying.value ? stop() : start() }

let bpmMonitor = null

// --- FIREBASE AUTH + SYNC ---
onMounted(async () => {
  // Preferenza locale: metronomo on/off
  try {
    const raw = localStorage.getItem('silverMetronome:metronomeEnabled')
    if (raw !== null) metronomeEnabled.value = raw === '1' || raw === 'true'
  } catch {}
  // Preferenza locale: fullscreen font scale
  try {
    const rawFs = localStorage.getItem('silverMetronome:fullscreenFontScale')
    if (rawFs !== null) {
      const n = Number(rawFs)
      if (!Number.isNaN(n)) fullscreenFontScale.value = Math.min(2, Math.max(0.6, n))
    }
  } catch {}
  // Preferenza locale: accordi italiani on/off
  try {
    const rawIta = localStorage.getItem('silverMetronome:italianChords')
    if (rawIta !== null) italianChords.value = rawIta === '1' || rawIta === 'true'
  } catch {}
  // Status bar solo su device
  if (Capacitor.isNativePlatform()) {
    try {
      await StatusBar.setOverlaysWebView({ overlay: false })
      await StatusBar.setBackgroundColor({ color: '#000000' })
      await StatusBar.setStyle({ style: Style.Light })
      await StatusBar.show()
    } catch (err) { console.warn('StatusBar non disponibile:', err) }
  }

  bpmMonitor = setInterval(() => { currentBpm.value = bpm.value }, 500)

  try {
    // Login anonimo
    await signInAnonymously(auth)
    onAuthStateChanged(auth, (u) => { /* opzionale: mostrare uid */ })

    // Primo fetch + bootstrap documento, se non esiste
    await runTransaction(db, async (trx) => {
      const snap = await trx.get(sharedRef)
      if (!snap.exists()) {
        const initial = {
          playlists: [ { id: crypto.randomUUID(), name: 'Default', songs: [] } ],
          selectedId: null,
          rev: 1,
          updatedAt: serverTimestamp(),
        }
        trx.set(sharedRef, initial)
        playlists.value = initial.playlists
        selectedPlaylistId.value = initial.playlists[0].id
        lastLocalRev = initial.rev
      } else {
        const data = snap.data() || {}
        playlists.value = Array.isArray(data.playlists) ? data.playlists : []
        selectedPlaylistId.value = data.selectedId || playlists.value[0]?.id || null
        lastLocalRev = Number(data.rev || 0)
      }
    })

    // Realtime listener con protezione anti-echo
    onSnapshot(sharedRef, (snap) => {
      if (!snap.exists()) return
      const data = snap.data() || {}
      const remoteRev = Number(data.rev || 0)
      if (remoteRev < lastLocalRev) {
        // snapshot vecchio (echo di write non ancora consolidati): ignora
        return
      }
      const cloudPlaylists = Array.isArray(data.playlists) ? data.playlists : []
      const cloudSelected = data.selectedId || cloudPlaylists[0]?.id || null

      const localJson = JSON.stringify(playlists.value)
      const cloudJson = JSON.stringify(cloudPlaylists)
      if (localJson !== cloudJson || selectedPlaylistId.value !== cloudSelected) {
        playlists.value = cloudPlaylists
        selectedPlaylistId.value = cloudSelected
      }
      cloudSynced.value = true
      cloudReady.value = true
    })

    cloudReady.value = true
    cloudSynced.value = true
  } catch (e) {
    console.warn('Firestore offline o auth fallita:', e)
    cloudReady.value = false
  }
})

// Salva preferenza metronomo in localStorage (per-device)
watch(metronomeEnabled, (v) => {
  try { localStorage.setItem('silverMetronome:metronomeEnabled', v ? '1' : '0') } catch {}
})

// Salva preferenza dimensione testo fullscreen
watch(fullscreenFontScale, (v) => {
  try { localStorage.setItem('silverMetronome:fullscreenFontScale', String(v)) } catch {}
})

function increaseFullscreenFont() {
  fullscreenFontScale.value = Math.min(2, +(fullscreenFontScale.value + 0.1).toFixed(2))
}
function decreaseFullscreenFont() {
  fullscreenFontScale.value = Math.max(0.6, +(fullscreenFontScale.value - 0.1).toFixed(2))
}

// Salva preferenza accordi italiani
watch(italianChords, (v) => {
  try { localStorage.setItem('silverMetronome:italianChords', v ? '1' : '0') } catch {}
})

// --- Chord conversion EN->IT ---
function convertNoteToItalian(root, acc) {
  // Normalize accidentals
  const a = (acc || '').replaceAll('♯', '#').replaceAll('♭', 'b')
  const key = `${root.toUpperCase()}${a}`
  const lut = {
    'C': 'Do', 'C#': 'Do#', 'Db': 'Reb',
    'D': 'Re', 'D#': 'Re#', 'Eb': 'Mib',
    'E': 'Mi', 'E#': 'Fa', 'Fb': 'Mi',
    'F': 'Fa', 'F#': 'Fa#', 'Gb': 'Solb',
    'G': 'Sol', 'G#': 'Sol#', 'Ab': 'Lab',
    'A': 'La', 'A#': 'La#', 'Bb': 'Sib',
    'B': 'Si', 'Cb': 'Si', 'B#': 'Do',
  }
  return lut[key] || root + a
}

function convertChordsToItalian(text) {
  if (!text) return text
  // Match chord roots with optional accidental, ensuring we don't eat into words
  // Preceded by start or a non-chord char; followed by typical chord continuations or separators
  // Only uppercase A–G as valid chord roots (avoid converting plain 'a')
  const rootRe = /(^|[^A-Za-z0-9#b♯♭])([A-G])([#b♯♭]?)(?=(?:maj|min|dim|aug|sus|add|m|M|°|\+)?(?:\d{0,2})?(?:\/|[\s\)\]\-,\.;:]|$))/g
  let converted = text.replace(rootRe, (m, pre, r, a) => pre + convertNoteToItalian(r, a))
  // Slash-bass parts: /X or /X# or /Xb
  const slashRe = /(\/)([A-G])([#b♯♭]?)/g
  converted = converted.replace(slashRe, (m, slash, r, a) => `${slash}${convertNoteToItalian(r, a)}`)
  return converted
}

const displayLyrics = computed(() => {
  const raw = selected.value?.lyrics || ''
  return italianChords.value ? convertChordsToItalian(raw) : raw
})

onBeforeUnmount(() => {
  try { KeepAwake.allowSleep() } catch (e) {}
  if (schedulerTimer) clearInterval(schedulerTimer)
  if (bpmMonitor) clearInterval(bpmMonitor)
  if (audioCtx && audioCtx.state !== 'closed') audioCtx.close()
})

// Debounce salvataggi per non chattare troppo col cloud
let _tCloud = null
function saveSharedDebounced() {
  clearTimeout(_tCloud)
  cloudSynced.value = false
  _tCloud = setTimeout(() => { saveSharedNow().catch(() => {}) }, 700)
}

function saveSharedFlush() {
  clearTimeout(_tCloud)
  cloudSynced.value = false
  // Piccolo nextTick per assicurare l'ultimo v-model sia commitato
  nextTick(() => { saveSharedNow().catch(() => {}) })
}

async function saveSharedNow() {
  // Normalizza: garantisci id per tutte le entità
  const cleaned = (playlists.value || []).map(p => ({
    id: p.id || crypto.randomUUID(),
    name: p.name || 'Senza nome',
    songs: (p.songs || []).map(ensureId)
  }))

  // rev++ per anti-echo semplice
  const nextRev = lastLocalRev + 1
  await setDoc(sharedRef, {
    playlists: cleaned,
    selectedId: selectedPlaylistId.value || null,
    rev: nextRev,
    updatedAt: serverTimestamp(),
  }, { merge: true })
  lastLocalRev = nextRev
  cloudSynced.value = true
}

// ---- IMPORT JSON ----
const fileInput = ref(null)

function normalizeSongsFromJson(data) {
  // accetta array o oggetto-lookup
  let arr = []
  if (Array.isArray(data)) arr = data
  else if (data && typeof data === 'object') arr = Object.values(data)

  const clampNum = (n, min, max, fallback) => Number.isFinite(+n) ? Math.min(max, Math.max(min, +n)) : fallback

  return arr
    .filter(s => s && (s.title || s.name || s.Titolo))
    .map(s => ({
      id: crypto.randomUUID(),
      title: String(s.title ?? s.name ?? s.Titolo ?? 'Senza titolo'),
      bpm: clampNum(s.bpm ?? s.BPM ?? s.tempo, 20, 300, 100),
      beats: clampNum(s.beats ?? s.timeSigTop ?? s.misure, 1, 12, 4),
      noteValue: [1,2,4,8,16].includes(+(s.noteValue ?? s.timeSigBottom)) ? +(s.noteValue ?? s.timeSigBottom) : 4,
      lyrics: typeof s.lyrics === 'string' ? s.lyrics : '',
      scrollSpeed: Math.max(0, Number(s.scrollSpeed || 0)),
    }))
}

async function onImportFile(ev) {
  const file = ev?.target?.files?.[0]
  try {
    if (!file) return
    if (!selectedPlaylistId.value) { alert('Seleziona una playlist prima di importare.'); return }
    const text = await file.text()
    const json = JSON.parse(text)
    const list = normalizeSongsFromJson(json)
    if (!list.length) { alert('Nessun brano valido trovato nel JSON.'); return }
    const pl = playlists.value.find(p => p.id === selectedPlaylistId.value)
    if (!pl) { alert('Playlist non trovata.'); return }
    pl.songs = [...(pl.songs || []), ...list]
    saveSharedDebounced()
  } catch (e) {
    console.error('Import JSON error', e)
    alert('JSON non valido o errore durante l\'import. Controlla la console.')
  } finally {
    if (ev?.target) ev.target.value = '' // reset input
  }
}

// Dialog gestione canzone
const dialog = ref(false)
const formRef = ref(null)
const form = reactive({ title: '', bpm: 100, beats: 4, noteValue: 4, existingSongIds: [], lyrics: '', scrollSpeed: 0, scrollMultiplier: 1 })
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
    ;(p.songs || []).forEach(s => {
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
  Object.assign(form, { title: '', bpm: 100, beats: 4, noteValue: 4, existingSongIds: [], lyrics: '', scrollSpeed: 0, scrollMultiplier: 1 })
  dialog.value = true
}
function openDialogForEdit(song) {
  editTarget.value = song
  Object.assign(form, { title: song.title, bpm: song.bpm, beats: song.beats, noteValue: song.noteValue, existingSongIds: [], lyrics: song.lyrics || '', scrollSpeed: song.scrollSpeed || 0, scrollMultiplier: typeof song.scrollMultiplier==='number'? song.scrollMultiplier: 1 })
  dialog.value = true
}
function saveSong() {
  const clean = (n, min, max, fallback) =>
    Number.isFinite(+n) ? Math.min(max, Math.max(min, +n)) : fallback

  // 1) Copia brani selezionati da altre playlist (inclusi eventuali lyrics)
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
          lyrics: typeof src.lyrics === 'string' ? src.lyrics : '',
          scrollSpeed: typeof src.scrollSpeed === 'number' ? src.scrollSpeed : 0,
          scrollMultiplier: typeof src.scrollMultiplier === 'number' ? src.scrollMultiplier : 1,
        })
      }
    })
  }

  // 2) Crea/aggiorna nuovo brano (includi lyrics dal form se presenti)
  const hasNewTitle = (form.title || '').trim().length > 0
  if (hasNewTitle) {
    const data = {
      title: (form.title || '').trim() || 'Senza titolo',
      bpm: clean(form.bpm, 20, 300, 100),
      beats: clean(form.beats, 1, 12, 4),
      noteValue: [1,2,4,8,16].includes(+form.noteValue) ? +form.noteValue : 4,
      lyrics: (form.lyrics || '').toString(),
      scrollSpeed: Math.max(0, Number(form.scrollSpeed || 0)),
      scrollMultiplier: Math.min(2, Math.max(0.1, Number(form.scrollMultiplier || 1))),
    }
    if (editTarget.value) {
      Object.assign(editTarget.value, data)
    } else {
      songs.value.push({ id: crypto.randomUUID(), ...data })
    }
  } else if (editTarget.value) {
    // in modifica, aggiorna almeno i campi numerici (+ lyrics se forniti)
    const data = {
      title: editTarget.value.title,
      bpm: clean(form.bpm, 20, 300, 100),
      beats: clean(form.beats, 1, 12, 4),
      noteValue: [1,2,4,8,16].includes(+form.noteValue) ? +form.noteValue : 4,
      scrollSpeed: Math.max(0, Number(form.scrollSpeed || 0)),
      scrollMultiplier: Math.min(2, Math.max(0.1, Number(form.scrollMultiplier || 1))),
    }
    if (typeof form.lyrics === 'string') {
      data.lyrics = form.lyrics
    }
    Object.assign(editTarget.value, data)
  }

  saveSharedDebounced()
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
    if (wasSelected) selected.value = songs.value[0] || null
    saveSharedDebounced()
  }
  confirmDialog.value = false
}

// Playlist CRUD (solo cloud)
function addPlaylist(name = 'Nuova playlist') {
  const p = { id: crypto.randomUUID(), name, songs: [] }
  playlists.value.push(p)
  selectedPlaylistId.value = p.id
  saveSharedDebounced()
}
function renamePlaylist(id, name) {
  const p = playlists.value.find(x => x.id === id); if (!p) return
  p.name = (name || '').trim() || p.name
  saveSharedDebounced()
}
function duplicatePlaylist(id) {
  const src = playlists.value.find(x => x.id === id); if (!src) return
  const copy = { id: crypto.randomUUID(), name: `${src.name} (copia)`, songs: src.songs.map(s => ({ ...s, id: crypto.randomUUID() })) }
  playlists.value.push(copy)
  selectedPlaylistId.value = copy.id
  saveSharedDebounced()
}
function removePlaylist(id) {
  if (playlists.value.length <= 1) return
  const idx = playlists.value.findIndex(x => x.id === id)
  if (idx < 0) return
  const playlistName = playlists.value[idx]?.name || 'questa playlist'
  if (!confirm(`Vuoi davvero eliminare "${playlistName}"?`)) return
  const removingCurrent = selectedPlaylistId.value === id
  playlists.value.splice(idx, 1)
  if (removingCurrent) selectedPlaylistId.value = playlists.value[0]?.id || null
  saveSharedDebounced()
}

// UI: safe areas
const appStyle = computed(() => {
  if (Capacitor.isNativePlatform()) {
    return {
      'padding-top': 'env(safe-area-inset-top)',
      'padding-left': 'env(safe-area-inset-left)',
      'padding-right': 'env(safe-area-inset-right)'
    }
  }
  return {}
})

function onRenamePlaylist() {
  if (!selectedPlaylistId.value) return
  const name = prompt('Nuovo nome playlist') || ''
  renamePlaylist(selectedPlaylistId.value, name)
}



function toggleFullscreen(){
panelFullscreen.value = !panelFullscreen.value
}


function goPrevSong(){
if(!selected.value || songs.value.length < 2) return
const idx = songs.value.findIndex(s => s.id === selected.value.id)
if(idx > 0) selectSong(songs.value[idx-1])
}


function goNextSong(){
if(!selected.value || songs.value.length < 2) return
const idx = songs.value.findIndex(s => s.id === selected.value.id)
if(idx >= 0 && idx < songs.value.length-1) selectSong(songs.value[idx+1])
}

let _rafId = null
let _lastTs = 0
// Mantiene l'offset di scorrimento (in px) applicato via transform per ciascun elemento
const _scrollRemainders = new WeakMap()
// Pausa l'autoscroll quando l'utente interagisce manualmente
const userAdjustingScroll = ref(false)
let _userScrollTimer = null

// Base di fallback se il brano non ha ancora uno scrollSpeed definito su Firestore
const DEFAULT_SCROLL_SPEED = 40 // px/sec

function getEffectiveScrollSpeed() {
  if (!selected.value) return 0
  const base = Number(selected.value.scrollSpeed || 0)
  if (base > 0) return base
  // fallback: se ci sono lyrics, usa una velocità predefinita per far partire lo scroll
  const hasLyrics = typeof selected.value.lyrics === 'string' && selected.value.lyrics.trim().length > 0
  return hasLyrics ? DEFAULT_SCROLL_SPEED : 0
}

function onUserScrollStart() {
  userAdjustingScroll.value = true
  if (_userScrollTimer) clearTimeout(_userScrollTimer)
  _userScrollTimer = setTimeout(() => { userAdjustingScroll.value = false }, 600)
  // azzera trasformazioni e residui per evitare micro-scatti durante l'interazione
  getScrollTargets().forEach(el => {
    const content = el.querySelector('.lyrics-pre') || el.firstElementChild
    // consolida solo la parte intera dell'offset virtuale nello scrollTop
    // e conserva la frazione per riprendere senza scatti visibili
    const offset = _scrollRemainders.get(el) || 0
    const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight)
    const whole = Math.floor(offset)
    const frac = offset - whole
    if (whole > 0) {
      el.scrollTop = Math.min(maxScroll, el.scrollTop + whole)
    }
    if (content) content.style.transform = ''
    _scrollRemainders.set(el, frac)
  })
}
function onUserScrollActivity() {
  onUserScrollStart()
}

function getScrollTargets() {
  const els = []
  if (panelOpen.value && lyricsPanelEl.value) els.push(lyricsPanelEl.value)
  if (panelFullscreen.value && lyricsFullscreenEl.value) els.push(lyricsFullscreenEl.value)
  return els
}

function _step(ts) {
  if (!isPlaying.value) { stopAutoScroll(); return }
  const speed = getEffectiveScrollSpeed()
  if (speed <= 0) { stopAutoScroll(); return }

  // Se l'utente sta regolando manualmente la posizione, non forziamo l'autoscroll
  if (userAdjustingScroll.value) {
    // mantieni il clock in sync per evitare salti quando riprende
    _lastTs = ts
    _rafId = requestAnimationFrame(_step)
    return
  }

  const dt = _lastTs ? (ts - _lastTs) / 1000 : 0
  _lastTs = ts

  const els = getScrollTargets()
  if (els.length) {
    els.forEach(el => {
      const distance = Math.max(0, el.scrollHeight - el.clientHeight)
      let offset = _scrollRemainders.get(el) || 0
      // avanza offset in base alla velocità effettiva (base * moltiplicatore)
      const base = getEffectiveScrollSpeed()
      const mult = Number(selected.value?.scrollMultiplier ?? 1)
      const effSpeed = Math.max(0, base * mult)
      offset = Math.min(distance, offset + (effSpeed * dt))
      _scrollRemainders.set(el, offset)
      const content = el.querySelector('.lyrics-pre') || el.firstElementChild
      if (content) {
        content.style.willChange = 'transform'
        content.style.transform = `translateY(-${offset}px)`
      }
    })
  }

  _rafId = requestAnimationFrame(_step)
}

function startAutoScroll() {
  stopAutoScroll()
  _lastTs = 0
  if (lyricsPanelEl.value) {
    lyricsPanelEl.value.scrollTop = 0
    _scrollRemainders.set(lyricsPanelEl.value, 0)
  }
  if (lyricsFullscreenEl.value) {
    lyricsFullscreenEl.value.scrollTop = 0
    _scrollRemainders.set(lyricsFullscreenEl.value, 0)
  }
  _rafId = requestAnimationFrame(_step)
}

function stopAutoScroll() {
  if (_rafId) cancelAnimationFrame(_rafId)
  _rafId = null
  _lastTs = 0
  // Ripristina eventuali trasformazioni
  getScrollTargets().forEach(el => {
    const content = el.querySelector('.lyrics-pre') || el.firstElementChild
    if (content) content.style.transform = ''
  })
}

function resetAutoScroll() {
  // Reset scroll position for both containers when present
  if (lyricsPanelEl.value) lyricsPanelEl.value.scrollTop = 0
  if (lyricsFullscreenEl.value) lyricsFullscreenEl.value.scrollTop = 0
  if (lyricsPanelEl.value) _scrollRemainders.set(lyricsPanelEl.value, 0)
  if (lyricsFullscreenEl.value) _scrollRemainders.set(lyricsFullscreenEl.value, 0)
}

watch([panelOpen, panelFullscreen], async () => {
  if (!isPlaying.value) return
  await nextTick() // aspetta che i container (panel/fullscreen) siano montati
  if (getEffectiveScrollSpeed() > 0) startAutoScroll()
})

watch(isPlaying, (val) => {
  if (val) {
    resetAutoScroll()
    if (getEffectiveScrollSpeed() > 0) startAutoScroll()
  } else {
    stopAutoScroll()
  }
})

// Proxy per la velocità: scrive nel brano + salva su Firestore + riavvia autoscroll
const scrollSpeedModel = computed({
  get: () => Number(selected.value?.scrollSpeed ?? 0),
  set: (val) => {
    if (!selected.value) return
    console.log('Scroll speed changed:', val);
    const n = Math.max(0, Number(val) || 0)
    console.log(selected.value.scrollSpeed)
      selected.value.scrollSpeed = n
      saveSharedDebounced() // Questo salva in Firestore
      
      // Riavvia l'autoscroll se è in riproduzione
      if (isPlaying.value) {
        resetAutoScroll()
        if (n > 0) startAutoScroll()
      }
  }
})

// Moltiplicatore velocità (0.1x–2x) salvato nel brano
const scrollMultiplierModel = computed({
  get: () => Number(selected.value?.scrollMultiplier ?? 1),
  set: (val) => {
    if (!selected.value) return
    const m = Math.max(0.1, Math.min(2, Number(val) || 1))
    selected.value.scrollMultiplier = m
    saveSharedDebounced()
  }
})


</script>

<style scoped>
.fixed-panel { backdrop-filter: saturate(140%) blur(6px); }
@media (max-width: 600px) { .fixed-panel { padding-bottom: env(safe-area-inset-bottom); } }

.beat-dot { width: 18px; height: 18px; border-radius: 999px; border: 2px solid currentColor; opacity: 0.35; }
.beat-dot.active { transform: scale(1.2); opacity: 1; border-color: red;}
.beat-dot.accent { border-width: 3px; }

.selected-song { background-color: rgba(20,180,180,0.06) !important; }
html,
body,
#app {
  height: 100%;
  margin: 0;
}

.mono-textarea :deep(textarea){
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  white-space: pre; /* usa 'pre-wrap' se vuoi andare a capo mantenendo spazi */
}

.fixed-panel { backdrop-filter: saturate(140%) blur(6px); }
@media (max-width: 600px) { .fixed-panel { padding-bottom: env(safe-area-inset-bottom); } }


.beat-dot { width: 18px; height: 18px; border-radius: 999px; border: 2px solid currentColor; opacity: 0.35; }
.beat-dot.active { transform: scale(1.2); opacity: 1; }
.beat-dot.accent { border-width: 3px; }


.selected-song { background-color: rgba(20,180,180,0.06) !important; }


.panel-expandable {
max-height: 40vh;
overflow-y: auto;
transition: all 0.3s ease;
}
.panel-expandable.fullscreen {
position: fixed;
top: 0;
left: 0;
right: 0;
bottom: 0;
z-index: 2000;
background: white;
padding: 16px;
max-height: 100%;
}


.lyrics-view pre {
font-family: ui-monospace, monospace;
white-space: pre-wrap;
margin: 0;
}

.lyrics-pre {
  font-family: ui-monospace, monospace;
  white-space: pre-wrap;
  margin: 0;
  will-change: transform;
}

</style>

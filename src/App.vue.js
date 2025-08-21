import { ref, reactive, computed, onMounted, onBeforeUnmount, watch } from 'vue';
import { KeepAwake } from '@capacitor-community/keep-awake';
import { StatusBar, Style } from '@capacitor/status-bar';
// Helpers
const ensureId = (s) => ({ ...s, id: s?.id ?? (crypto?.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random())) });
// --- Persistenza semplice con localStorage ---
const STORAGE_KEY = 'metronome_songs_v1';
const loadSongs = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }
    catch {
        return [];
    }
};
const saveSongs = (arr) => localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
// Dati principali (migrazione: assegna id mancanti)
const songs = ref(loadSongs().map(ensureId));
saveSongs(songs.value);
const selected = ref(songs.value[0] || null);
// Stato metronomo
const bpm = ref(selected.value?.bpm || 100);
const beats = ref(selected.value?.beats || 4);
const noteValue = ref(selected.value?.noteValue || 4);
const accentFirst = ref(true);
const isPlaying = ref(false);
const currentBeat = ref(0); // 0-based
const currentBpm = ref(bpm.value);
// AudioContext e scheduling
let audioCtx = null;
let nextNoteTime = 0; // quando suonerà la prossima nota (in AudioContext time)
let current16thNote = 0; // conta i 16esimi dal principio della battuta
let schedulerTimer = null;
// Calcolo intervallo tra battiti in secondi (in base al BPM e al denominatore del tempo)
const secondsPerBeat = computed(() => {
    return (60.0 / bpm.value) * (4 / noteValue.value);
});
// Selezione canzone
function selectSong(song) {
    const wasPlaying = isPlaying.value;
    selected.value = song;
    bpm.value = song.bpm;
    beats.value = song.beats;
    noteValue.value = song.noteValue;
    if (wasPlaying && audioCtx) {
        current16thNote = 0;
        currentBeat.value = 0;
        nextNoteTime = audioCtx.currentTime + 0.1;
    }
}
// Salvataggio modifiche sulla canzone selezionata
function saveEdits() {
    if (!selected.value)
        return;
    const clean = (n, min, max, fallback) => Number.isFinite(+n) ? Math.min(max, Math.max(min, +n)) : fallback;
    selected.value.bpm = clean(bpm.value, 20, 300, 100);
    selected.value.beats = clean(beats.value, 1, 12, 4);
    selected.value.noteValue = [1, 2, 4, 8, 16].includes(+noteValue.value) ? +noteValue.value : 4;
    saveSongs(songs.value);
}
// Riordino con pulsanti su/giù (senza dipendenze)
function moveUp(i) { if (i <= 0)
    return; const arr = songs.value; const [m] = arr.splice(i, 1); arr.splice(i - 1, 0, m); saveSongs(arr); }
function moveDown(i) { if (i >= songs.value.length - 1)
    return; const arr = songs.value; const [m] = arr.splice(i, 1); arr.splice(i + 1, 0, m); saveSongs(arr); }
// Riproduzione click
function playClick(accent = false, when = 0) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = accent ? 1800 : 1200;
    gain.gain.value = 0.0001;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(when);
    gain.gain.setValueAtTime(0.0001, when);
    gain.gain.exponentialRampToValueAtTime(0.4, when + 0.001);
    gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.03);
    osc.stop(when + 0.05);
}
// Scheduling
const lookahead = 25;
const scheduleAheadTime = 0.1;
function nextNote() {
    const spb = secondsPerBeat.value;
    nextNoteTime += spb;
    current16thNote++;
    if (current16thNote >= beats.value) {
        current16thNote = 0;
    }
}
function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
        const isAccent = accentFirst.value && current16thNote === 0;
        playClick(isAccent, nextNoteTime);
        const beatIndex = current16thNote;
        const delay = Math.max(0, (nextNoteTime - audioCtx.currentTime) * 1000);
        setTimeout(() => { currentBeat.value = beatIndex; }, delay);
        nextNote();
    }
}
function start() {
    try {
        KeepAwake.keepAwake();
    }
    catch (e) { }
    if (isPlaying.value)
        return;
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    else if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    isPlaying.value = true;
    current16thNote = 0;
    currentBeat.value = 0;
    nextNoteTime = audioCtx.currentTime + 0.1;
    schedulerTimer = setInterval(() => {
        scheduler();
    }, lookahead);
}
function stop() {
    try {
        KeepAwake.allowSleep();
    }
    catch (e) { }
    if (!isPlaying.value)
        return;
    isPlaying.value = false;
    if (schedulerTimer) {
        clearInterval(schedulerTimer);
        schedulerTimer = null;
    }
    if (audioCtx && audioCtx.state !== 'closed') {
        audioCtx.suspend();
    }
}
function toggle() {
    isPlaying.value ? stop() : start();
}
let bpmMonitor = null;
onMounted(async () => {
    try {
        // Colore di sfondo (nero, puoi metterlo come il tema di Vuetify)
        await StatusBar.setBackgroundColor({ color: '#000000' });
        // Stile delle icone (Dark = testo nero, Light = testo bianco)
        await StatusBar.setStyle({ style: Style.Light });
        // Assicurati che la status bar sia visibile
        await StatusBar.show();
    }
    catch (err) {
        console.warn('StatusBar plugin non disponibile sul web:', err);
    }
    if (!songs.value.length) {
        songs.value = [
            { id: crypto.randomUUID(), title: 'Brano di esempio', bpm: 100, beats: 4, noteValue: 4 },
        ];
        saveSongs(songs.value);
        selected.value = songs.value[0];
    }
    bpmMonitor = setInterval(() => {
        currentBpm.value = bpm.value;
    }, 500);
});
onBeforeUnmount(() => {
    try {
        KeepAwake.allowSleep();
    }
    catch (e) { }
    if (schedulerTimer)
        clearInterval(schedulerTimer);
    if (bpmMonitor)
        clearInterval(bpmMonitor);
    if (audioCtx && audioCtx.state !== 'closed')
        audioCtx.close();
});
watch(songs, saveSongs, { deep: true });
// Dialog gestione canzone
const dialog = ref(false);
const formRef = ref(null);
const form = reactive({ title: '', bpm: 100, beats: 4, noteValue: 4 });
const editTarget = ref(null);
const noteItems = [
    { label: '1 (semibreve)', value: 1 },
    { label: '2 (minima)', value: 2 },
    { label: '4 (semiminima)', value: 4 },
    { label: '8 (croma)', value: 8 },
    { label: '16 (semicroma)', value: 16 },
];
function openDialogForNew() {
    editTarget.value = null;
    Object.assign(form, { title: '', bpm: 100, beats: 4, noteValue: 4 });
    dialog.value = true;
}
function openDialogForEdit(song) {
    editTarget.value = song;
    Object.assign(form, { title: song.title, bpm: song.bpm, beats: song.beats, noteValue: song.noteValue });
    dialog.value = true;
}
function saveSong() {
    const clean = (n, min, max, fallback) => Number.isFinite(+n) ? Math.min(max, Math.max(min, +n)) : fallback;
    const data = {
        title: (form.title || '').trim() || 'Senza titolo',
        bpm: clean(form.bpm, 20, 300, 100),
        beats: clean(form.beats, 1, 12, 4),
        noteValue: [1, 2, 4, 8, 16].includes(+form.noteValue) ? +form.noteValue : 4,
    };
    if (editTarget.value) {
        Object.assign(editTarget.value, data);
    }
    else {
        songs.value.push({ id: crypto.randomUUID(), ...data });
    }
    saveSongs(songs.value);
    if (!selected.value)
        selected.value = songs.value[0];
    dialog.value = false;
}
// Conferma eliminazione
const confirmDialog = ref(false);
const songToRemove = ref(null);
function confirmRemove(id) {
    songToRemove.value = id;
    confirmDialog.value = true;
}
function doRemove() {
    if (isPlaying.value)
        return;
    const id = songToRemove.value;
    const idx = songs.value.findIndex(s => s.id === id);
    if (idx >= 0) {
        const wasSelected = selected.value?.id === id;
        songs.value.splice(idx, 1);
        saveSongs(songs.value);
        if (wasSelected)
            selected.value = songs.value[0] || null;
    }
    confirmDialog.value = false;
}
debugger; /* PartiallyEnd: #3632/scriptSetup.vue */
const __VLS_ctx = {};
let __VLS_elements;
let __VLS_components;
let __VLS_directives;
/** @type {__VLS_StyleScopedClasses['beat-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['beat-dot']} */ ;
// CSS variable injection 
// CSS variable injection end 
const __VLS_0 = {}.VApp;
/** @type {[typeof __VLS_components.VApp, typeof __VLS_components.vApp, typeof __VLS_components.VApp, typeof __VLS_components.vApp, ]} */ ;
// @ts-ignore
VApp;
// @ts-ignore
const __VLS_1 = __VLS_asFunctionalComponent(__VLS_0, new __VLS_0({}));
const __VLS_2 = __VLS_1({}, ...__VLS_functionalComponentArgsRest(__VLS_1));
var __VLS_4 = {};
const { default: __VLS_5 } = __VLS_3.slots;
const __VLS_6 = {}.VAppBar;
/** @type {[typeof __VLS_components.VAppBar, typeof __VLS_components.vAppBar, typeof __VLS_components.VAppBar, typeof __VLS_components.vAppBar, ]} */ ;
// @ts-ignore
VAppBar;
// @ts-ignore
const __VLS_7 = __VLS_asFunctionalComponent(__VLS_6, new __VLS_6({
    density: "comfortable",
    flat: true,
}));
const __VLS_8 = __VLS_7({
    density: "comfortable",
    flat: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_7));
const { default: __VLS_10 } = __VLS_9.slots;
const __VLS_11 = {}.VAppBarTitle;
/** @type {[typeof __VLS_components.VAppBarTitle, typeof __VLS_components.vAppBarTitle, typeof __VLS_components.VAppBarTitle, typeof __VLS_components.vAppBarTitle, ]} */ ;
// @ts-ignore
VAppBarTitle;
// @ts-ignore
const __VLS_12 = __VLS_asFunctionalComponent(__VLS_11, new __VLS_11({}));
const __VLS_13 = __VLS_12({}, ...__VLS_functionalComponentArgsRest(__VLS_12));
const __VLS_16 = {}.VSpacer;
/** @type {[typeof __VLS_components.VSpacer, typeof __VLS_components.vSpacer, ]} */ ;
// @ts-ignore
VSpacer;
// @ts-ignore
const __VLS_17 = __VLS_asFunctionalComponent(__VLS_16, new __VLS_16({}));
const __VLS_18 = __VLS_17({}, ...__VLS_functionalComponentArgsRest(__VLS_17));
const __VLS_21 = {}.VBtn;
/** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
// @ts-ignore
VBtn;
// @ts-ignore
const __VLS_22 = __VLS_asFunctionalComponent(__VLS_21, new __VLS_21({
    ...{ 'onClick': {} },
    icon: "mdi-plus",
    disabled: (__VLS_ctx.isPlaying),
    title: ('Aggiungi canzone'),
}));
const __VLS_23 = __VLS_22({
    ...{ 'onClick': {} },
    icon: "mdi-plus",
    disabled: (__VLS_ctx.isPlaying),
    title: ('Aggiungi canzone'),
}, ...__VLS_functionalComponentArgsRest(__VLS_22));
let __VLS_25;
let __VLS_26;
const __VLS_27 = ({ click: {} },
    { onClick: (__VLS_ctx.openDialogForNew) });
// @ts-ignore
[isPlaying, openDialogForNew,];
var __VLS_24;
var __VLS_9;
const __VLS_29 = {}.VMain;
/** @type {[typeof __VLS_components.VMain, typeof __VLS_components.vMain, typeof __VLS_components.VMain, typeof __VLS_components.vMain, ]} */ ;
// @ts-ignore
VMain;
// @ts-ignore
const __VLS_30 = __VLS_asFunctionalComponent(__VLS_29, new __VLS_29({}));
const __VLS_31 = __VLS_30({}, ...__VLS_functionalComponentArgsRest(__VLS_30));
const { default: __VLS_33 } = __VLS_32.slots;
const __VLS_34 = {}.VContainer;
/** @type {[typeof __VLS_components.VContainer, typeof __VLS_components.vContainer, typeof __VLS_components.VContainer, typeof __VLS_components.vContainer, ]} */ ;
// @ts-ignore
VContainer;
// @ts-ignore
const __VLS_35 = __VLS_asFunctionalComponent(__VLS_34, new __VLS_34({
    ...{ class: "py-6" },
    fluid: true,
}));
const __VLS_36 = __VLS_35({
    ...{ class: "py-6" },
    fluid: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_35));
const { default: __VLS_38 } = __VLS_37.slots;
const __VLS_39 = {}.VRow;
/** @type {[typeof __VLS_components.VRow, typeof __VLS_components.vRow, typeof __VLS_components.VRow, typeof __VLS_components.vRow, ]} */ ;
// @ts-ignore
VRow;
// @ts-ignore
const __VLS_40 = __VLS_asFunctionalComponent(__VLS_39, new __VLS_39({
    ...{ class: "g-6" },
    align: "stretch",
}));
const __VLS_41 = __VLS_40({
    ...{ class: "g-6" },
    align: "stretch",
}, ...__VLS_functionalComponentArgsRest(__VLS_40));
const { default: __VLS_43 } = __VLS_42.slots;
const __VLS_44 = {}.VCol;
/** @type {[typeof __VLS_components.VCol, typeof __VLS_components.vCol, typeof __VLS_components.VCol, typeof __VLS_components.vCol, ]} */ ;
// @ts-ignore
VCol;
// @ts-ignore
const __VLS_45 = __VLS_asFunctionalComponent(__VLS_44, new __VLS_44({
    cols: "12",
    md: "6",
    lg: "5",
}));
const __VLS_46 = __VLS_45({
    cols: "12",
    md: "6",
    lg: "5",
}, ...__VLS_functionalComponentArgsRest(__VLS_45));
const { default: __VLS_48 } = __VLS_47.slots;
const __VLS_49 = {}.VCard;
/** @type {[typeof __VLS_components.VCard, typeof __VLS_components.vCard, typeof __VLS_components.VCard, typeof __VLS_components.vCard, ]} */ ;
// @ts-ignore
VCard;
// @ts-ignore
const __VLS_50 = __VLS_asFunctionalComponent(__VLS_49, new __VLS_49({
    ...{ class: "h-100" },
    elevation: "2",
}));
const __VLS_51 = __VLS_50({
    ...{ class: "h-100" },
    elevation: "2",
}, ...__VLS_functionalComponentArgsRest(__VLS_50));
const { default: __VLS_53 } = __VLS_52.slots;
const __VLS_54 = {}.VCardTitle;
/** @type {[typeof __VLS_components.VCardTitle, typeof __VLS_components.vCardTitle, typeof __VLS_components.VCardTitle, typeof __VLS_components.vCardTitle, ]} */ ;
// @ts-ignore
VCardTitle;
// @ts-ignore
const __VLS_55 = __VLS_asFunctionalComponent(__VLS_54, new __VLS_54({
    ...{ class: "text-subtitle-1" },
}));
const __VLS_56 = __VLS_55({
    ...{ class: "text-subtitle-1" },
}, ...__VLS_functionalComponentArgsRest(__VLS_55));
const { default: __VLS_58 } = __VLS_57.slots;
var __VLS_57;
const __VLS_59 = {}.VDivider;
/** @type {[typeof __VLS_components.VDivider, typeof __VLS_components.vDivider, ]} */ ;
// @ts-ignore
VDivider;
// @ts-ignore
const __VLS_60 = __VLS_asFunctionalComponent(__VLS_59, new __VLS_59({}));
const __VLS_61 = __VLS_60({}, ...__VLS_functionalComponentArgsRest(__VLS_60));
const __VLS_64 = {}.VCardText;
/** @type {[typeof __VLS_components.VCardText, typeof __VLS_components.vCardText, typeof __VLS_components.VCardText, typeof __VLS_components.vCardText, ]} */ ;
// @ts-ignore
VCardText;
// @ts-ignore
const __VLS_65 = __VLS_asFunctionalComponent(__VLS_64, new __VLS_64({
    ...{ class: "pa-0" },
}));
const __VLS_66 = __VLS_65({
    ...{ class: "pa-0" },
}, ...__VLS_functionalComponentArgsRest(__VLS_65));
const { default: __VLS_68 } = __VLS_67.slots;
const __VLS_69 = {}.VList;
/** @type {[typeof __VLS_components.VList, typeof __VLS_components.vList, typeof __VLS_components.VList, typeof __VLS_components.vList, ]} */ ;
// @ts-ignore
VList;
// @ts-ignore
const __VLS_70 = __VLS_asFunctionalComponent(__VLS_69, new __VLS_69({
    lines: "two",
    density: "comfortable",
}));
const __VLS_71 = __VLS_70({
    lines: "two",
    density: "comfortable",
}, ...__VLS_functionalComponentArgsRest(__VLS_70));
const { default: __VLS_73 } = __VLS_72.slots;
for (const [song, index] of __VLS_getVForSourceType((__VLS_ctx.songs))) {
    // @ts-ignore
    [songs,];
    const __VLS_74 = {}.VListItem;
    /** @type {[typeof __VLS_components.VListItem, typeof __VLS_components.vListItem, typeof __VLS_components.VListItem, typeof __VLS_components.vListItem, ]} */ ;
    // @ts-ignore
    VListItem;
    // @ts-ignore
    const __VLS_75 = __VLS_asFunctionalComponent(__VLS_74, new __VLS_74({
        ...{ 'onClick': {} },
        key: (song.id),
        active: (__VLS_ctx.selected?.id === song.id),
    }));
    const __VLS_76 = __VLS_75({
        ...{ 'onClick': {} },
        key: (song.id),
        active: (__VLS_ctx.selected?.id === song.id),
    }, ...__VLS_functionalComponentArgsRest(__VLS_75));
    let __VLS_78;
    let __VLS_79;
    const __VLS_80 = ({ click: {} },
        { onClick: (...[$event]) => {
                __VLS_ctx.selectSong(song);
                // @ts-ignore
                [selected, selectSong,];
            } });
    const { default: __VLS_81 } = __VLS_77.slots;
    {
        const { prepend: __VLS_82 } = __VLS_77.slots;
        const __VLS_83 = {}.VAvatar;
        /** @type {[typeof __VLS_components.VAvatar, typeof __VLS_components.vAvatar, typeof __VLS_components.VAvatar, typeof __VLS_components.vAvatar, ]} */ ;
        // @ts-ignore
        VAvatar;
        // @ts-ignore
        const __VLS_84 = __VLS_asFunctionalComponent(__VLS_83, new __VLS_83({
            size: "32",
        }));
        const __VLS_85 = __VLS_84({
            size: "32",
        }, ...__VLS_functionalComponentArgsRest(__VLS_84));
        const { default: __VLS_87 } = __VLS_86.slots;
        const __VLS_88 = {}.VIcon;
        /** @type {[typeof __VLS_components.VIcon, typeof __VLS_components.vIcon, typeof __VLS_components.VIcon, typeof __VLS_components.vIcon, ]} */ ;
        // @ts-ignore
        VIcon;
        // @ts-ignore
        const __VLS_89 = __VLS_asFunctionalComponent(__VLS_88, new __VLS_88({}));
        const __VLS_90 = __VLS_89({}, ...__VLS_functionalComponentArgsRest(__VLS_89));
        const { default: __VLS_92 } = __VLS_91.slots;
        var __VLS_91;
        var __VLS_86;
    }
    const __VLS_93 = {}.VListItemTitle;
    /** @type {[typeof __VLS_components.VListItemTitle, typeof __VLS_components.vListItemTitle, typeof __VLS_components.VListItemTitle, typeof __VLS_components.vListItemTitle, ]} */ ;
    // @ts-ignore
    VListItemTitle;
    // @ts-ignore
    const __VLS_94 = __VLS_asFunctionalComponent(__VLS_93, new __VLS_93({
        ...{ class: "font-medium" },
    }));
    const __VLS_95 = __VLS_94({
        ...{ class: "font-medium" },
    }, ...__VLS_functionalComponentArgsRest(__VLS_94));
    const { default: __VLS_97 } = __VLS_96.slots;
    (song.title);
    var __VLS_96;
    const __VLS_98 = {}.VListItemSubtitle;
    /** @type {[typeof __VLS_components.VListItemSubtitle, typeof __VLS_components.vListItemSubtitle, typeof __VLS_components.VListItemSubtitle, typeof __VLS_components.vListItemSubtitle, ]} */ ;
    // @ts-ignore
    VListItemSubtitle;
    // @ts-ignore
    const __VLS_99 = __VLS_asFunctionalComponent(__VLS_98, new __VLS_98({}));
    const __VLS_100 = __VLS_99({}, ...__VLS_functionalComponentArgsRest(__VLS_99));
    const { default: __VLS_102 } = __VLS_101.slots;
    (song.bpm);
    (song.beats);
    (song.noteValue);
    var __VLS_101;
    {
        const { append: __VLS_103 } = __VLS_77.slots;
        const __VLS_104 = {}.VBtn;
        /** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
        // @ts-ignore
        VBtn;
        // @ts-ignore
        const __VLS_105 = __VLS_asFunctionalComponent(__VLS_104, new __VLS_104({
            ...{ 'onClick': {} },
            disabled: (__VLS_ctx.isPlaying || index === 0),
            icon: "mdi-arrow-up",
            variant: "text",
            ...{ class: "mr-1" },
        }));
        const __VLS_106 = __VLS_105({
            ...{ 'onClick': {} },
            disabled: (__VLS_ctx.isPlaying || index === 0),
            icon: "mdi-arrow-up",
            variant: "text",
            ...{ class: "mr-1" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_105));
        let __VLS_108;
        let __VLS_109;
        const __VLS_110 = ({ click: {} },
            { onClick: (...[$event]) => {
                    __VLS_ctx.moveUp(index);
                    // @ts-ignore
                    [isPlaying, moveUp,];
                } });
        var __VLS_107;
        const __VLS_112 = {}.VBtn;
        /** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
        // @ts-ignore
        VBtn;
        // @ts-ignore
        const __VLS_113 = __VLS_asFunctionalComponent(__VLS_112, new __VLS_112({
            ...{ 'onClick': {} },
            disabled: (__VLS_ctx.isPlaying || index === __VLS_ctx.songs.length - 1),
            icon: "mdi-arrow-down",
            variant: "text",
            ...{ class: "mr-1" },
        }));
        const __VLS_114 = __VLS_113({
            ...{ 'onClick': {} },
            disabled: (__VLS_ctx.isPlaying || index === __VLS_ctx.songs.length - 1),
            icon: "mdi-arrow-down",
            variant: "text",
            ...{ class: "mr-1" },
        }, ...__VLS_functionalComponentArgsRest(__VLS_113));
        let __VLS_116;
        let __VLS_117;
        const __VLS_118 = ({ click: {} },
            { onClick: (...[$event]) => {
                    __VLS_ctx.moveDown(index);
                    // @ts-ignore
                    [isPlaying, songs, moveDown,];
                } });
        var __VLS_115;
        const __VLS_120 = {}.VBtn;
        /** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
        // @ts-ignore
        VBtn;
        // @ts-ignore
        const __VLS_121 = __VLS_asFunctionalComponent(__VLS_120, new __VLS_120({
            ...{ 'onClick': {} },
            icon: "mdi-pencil",
            variant: "text",
        }));
        const __VLS_122 = __VLS_121({
            ...{ 'onClick': {} },
            icon: "mdi-pencil",
            variant: "text",
        }, ...__VLS_functionalComponentArgsRest(__VLS_121));
        let __VLS_124;
        let __VLS_125;
        const __VLS_126 = ({ click: {} },
            { onClick: (...[$event]) => {
                    __VLS_ctx.openDialogForEdit(song);
                    // @ts-ignore
                    [openDialogForEdit,];
                } });
        var __VLS_123;
        const __VLS_128 = {}.VBtn;
        /** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
        // @ts-ignore
        VBtn;
        // @ts-ignore
        const __VLS_129 = __VLS_asFunctionalComponent(__VLS_128, new __VLS_128({
            ...{ 'onClick': {} },
            icon: "mdi-delete",
            variant: "text",
            color: "error",
        }));
        const __VLS_130 = __VLS_129({
            ...{ 'onClick': {} },
            icon: "mdi-delete",
            variant: "text",
            color: "error",
        }, ...__VLS_functionalComponentArgsRest(__VLS_129));
        let __VLS_132;
        let __VLS_133;
        const __VLS_134 = ({ click: {} },
            { onClick: (...[$event]) => {
                    __VLS_ctx.confirmRemove(song.id);
                    // @ts-ignore
                    [confirmRemove,];
                } });
        var __VLS_131;
    }
    var __VLS_77;
}
var __VLS_72;
if (!__VLS_ctx.songs.length) {
    // @ts-ignore
    [songs,];
    __VLS_asFunctionalElement(__VLS_elements.div, __VLS_elements.div)({
        ...{ class: "pa-6 text-medium-emphasis" },
    });
}
var __VLS_67;
const __VLS_136 = {}.VDivider;
/** @type {[typeof __VLS_components.VDivider, typeof __VLS_components.vDivider, ]} */ ;
// @ts-ignore
VDivider;
// @ts-ignore
const __VLS_137 = __VLS_asFunctionalComponent(__VLS_136, new __VLS_136({}));
const __VLS_138 = __VLS_137({}, ...__VLS_functionalComponentArgsRest(__VLS_137));
const __VLS_141 = {}.VCardActions;
/** @type {[typeof __VLS_components.VCardActions, typeof __VLS_components.vCardActions, typeof __VLS_components.VCardActions, typeof __VLS_components.vCardActions, ]} */ ;
// @ts-ignore
VCardActions;
// @ts-ignore
const __VLS_142 = __VLS_asFunctionalComponent(__VLS_141, new __VLS_141({}));
const __VLS_143 = __VLS_142({}, ...__VLS_functionalComponentArgsRest(__VLS_142));
const { default: __VLS_145 } = __VLS_144.slots;
const __VLS_146 = {}.VBtn;
/** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
// @ts-ignore
VBtn;
// @ts-ignore
const __VLS_147 = __VLS_asFunctionalComponent(__VLS_146, new __VLS_146({
    ...{ 'onClick': {} },
    block: true,
    prependIcon: "mdi-plus",
    disabled: (__VLS_ctx.isPlaying),
}));
const __VLS_148 = __VLS_147({
    ...{ 'onClick': {} },
    block: true,
    prependIcon: "mdi-plus",
    disabled: (__VLS_ctx.isPlaying),
}, ...__VLS_functionalComponentArgsRest(__VLS_147));
let __VLS_150;
let __VLS_151;
const __VLS_152 = ({ click: {} },
    { onClick: (__VLS_ctx.openDialogForNew) });
const { default: __VLS_153 } = __VLS_149.slots;
// @ts-ignore
[isPlaying, openDialogForNew,];
var __VLS_149;
var __VLS_144;
var __VLS_52;
var __VLS_47;
const __VLS_154 = {}.VCol;
/** @type {[typeof __VLS_components.VCol, typeof __VLS_components.vCol, typeof __VLS_components.VCol, typeof __VLS_components.vCol, ]} */ ;
// @ts-ignore
VCol;
// @ts-ignore
const __VLS_155 = __VLS_asFunctionalComponent(__VLS_154, new __VLS_154({
    cols: "12",
    md: "6",
    lg: "7",
}));
const __VLS_156 = __VLS_155({
    cols: "12",
    md: "6",
    lg: "7",
}, ...__VLS_functionalComponentArgsRest(__VLS_155));
const { default: __VLS_158 } = __VLS_157.slots;
const __VLS_159 = {}.VCard;
/** @type {[typeof __VLS_components.VCard, typeof __VLS_components.vCard, typeof __VLS_components.VCard, typeof __VLS_components.vCard, ]} */ ;
// @ts-ignore
VCard;
// @ts-ignore
const __VLS_160 = __VLS_asFunctionalComponent(__VLS_159, new __VLS_159({
    ...{ class: "h-100 d-flex flex-column" },
    elevation: "2",
}));
const __VLS_161 = __VLS_160({
    ...{ class: "h-100 d-flex flex-column" },
    elevation: "2",
}, ...__VLS_functionalComponentArgsRest(__VLS_160));
const { default: __VLS_163 } = __VLS_162.slots;
const __VLS_164 = {}.VCardTitle;
/** @type {[typeof __VLS_components.VCardTitle, typeof __VLS_components.vCardTitle, typeof __VLS_components.VCardTitle, typeof __VLS_components.vCardTitle, ]} */ ;
// @ts-ignore
VCardTitle;
// @ts-ignore
const __VLS_165 = __VLS_asFunctionalComponent(__VLS_164, new __VLS_164({
    ...{ class: "d-flex align-center justify-space-between" },
}));
const __VLS_166 = __VLS_165({
    ...{ class: "d-flex align-center justify-space-between" },
}, ...__VLS_functionalComponentArgsRest(__VLS_165));
const { default: __VLS_168 } = __VLS_167.slots;
__VLS_asFunctionalElement(__VLS_elements.div, __VLS_elements.div)({
    ...{ class: "text-subtitle-1" },
});
if (__VLS_ctx.selected) {
    // @ts-ignore
    [selected,];
    __VLS_asFunctionalElement(__VLS_elements.div, __VLS_elements.div)({
        ...{ class: "text-medium-emphasis" },
    });
    (__VLS_ctx.selected.title);
    (__VLS_ctx.bpm);
    (__VLS_ctx.beats);
    (__VLS_ctx.noteValue);
    // @ts-ignore
    [selected, bpm, beats, noteValue,];
}
var __VLS_167;
const __VLS_169 = {}.VDivider;
/** @type {[typeof __VLS_components.VDivider, typeof __VLS_components.vDivider, ]} */ ;
// @ts-ignore
VDivider;
// @ts-ignore
const __VLS_170 = __VLS_asFunctionalComponent(__VLS_169, new __VLS_169({}));
const __VLS_171 = __VLS_170({}, ...__VLS_functionalComponentArgsRest(__VLS_170));
const __VLS_174 = {}.VCardText;
/** @type {[typeof __VLS_components.VCardText, typeof __VLS_components.vCardText, typeof __VLS_components.VCardText, typeof __VLS_components.vCardText, ]} */ ;
// @ts-ignore
VCardText;
// @ts-ignore
const __VLS_175 = __VLS_asFunctionalComponent(__VLS_174, new __VLS_174({
    ...{ class: "flex-grow-1" },
}));
const __VLS_176 = __VLS_175({
    ...{ class: "flex-grow-1" },
}, ...__VLS_functionalComponentArgsRest(__VLS_175));
const { default: __VLS_178 } = __VLS_177.slots;
const __VLS_179 = {}.VRow;
/** @type {[typeof __VLS_components.VRow, typeof __VLS_components.vRow, typeof __VLS_components.VRow, typeof __VLS_components.vRow, ]} */ ;
// @ts-ignore
VRow;
// @ts-ignore
const __VLS_180 = __VLS_asFunctionalComponent(__VLS_179, new __VLS_179({
    ...{ class: "mt-2" },
    align: "center",
    justify: "center",
}));
const __VLS_181 = __VLS_180({
    ...{ class: "mt-2" },
    align: "center",
    justify: "center",
}, ...__VLS_functionalComponentArgsRest(__VLS_180));
const { default: __VLS_183 } = __VLS_182.slots;
const __VLS_184 = {}.VCol;
/** @type {[typeof __VLS_components.VCol, typeof __VLS_components.vCol, typeof __VLS_components.VCol, typeof __VLS_components.vCol, ]} */ ;
// @ts-ignore
VCol;
// @ts-ignore
const __VLS_185 = __VLS_asFunctionalComponent(__VLS_184, new __VLS_184({
    cols: "12",
    md: "4",
}));
const __VLS_186 = __VLS_185({
    cols: "12",
    md: "4",
}, ...__VLS_functionalComponentArgsRest(__VLS_185));
const { default: __VLS_188 } = __VLS_187.slots;
const __VLS_189 = {}.VTextField;
/** @type {[typeof __VLS_components.VTextField, typeof __VLS_components.vTextField, ]} */ ;
// @ts-ignore
VTextField;
// @ts-ignore
const __VLS_190 = __VLS_asFunctionalComponent(__VLS_189, new __VLS_189({
    type: "number",
    label: "BPM",
    modelValue: (__VLS_ctx.bpm),
    modelModifiers: { number: true, },
    min: (20),
    max: (300),
    disabled: (__VLS_ctx.isPlaying),
    hideDetails: true,
}));
const __VLS_191 = __VLS_190({
    type: "number",
    label: "BPM",
    modelValue: (__VLS_ctx.bpm),
    modelModifiers: { number: true, },
    min: (20),
    max: (300),
    disabled: (__VLS_ctx.isPlaying),
    hideDetails: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_190));
// @ts-ignore
[isPlaying, bpm,];
var __VLS_187;
const __VLS_194 = {}.VCol;
/** @type {[typeof __VLS_components.VCol, typeof __VLS_components.vCol, typeof __VLS_components.VCol, typeof __VLS_components.vCol, ]} */ ;
// @ts-ignore
VCol;
// @ts-ignore
const __VLS_195 = __VLS_asFunctionalComponent(__VLS_194, new __VLS_194({
    cols: "6",
    md: "4",
}));
const __VLS_196 = __VLS_195({
    cols: "6",
    md: "4",
}, ...__VLS_functionalComponentArgsRest(__VLS_195));
const { default: __VLS_198 } = __VLS_197.slots;
const __VLS_199 = {}.VTextField;
/** @type {[typeof __VLS_components.VTextField, typeof __VLS_components.vTextField, ]} */ ;
// @ts-ignore
VTextField;
// @ts-ignore
const __VLS_200 = __VLS_asFunctionalComponent(__VLS_199, new __VLS_199({
    type: "number",
    label: "Beats (sopra)",
    modelValue: (__VLS_ctx.beats),
    modelModifiers: { number: true, },
    min: (1),
    max: (12),
    disabled: (__VLS_ctx.isPlaying),
    hideDetails: true,
}));
const __VLS_201 = __VLS_200({
    type: "number",
    label: "Beats (sopra)",
    modelValue: (__VLS_ctx.beats),
    modelModifiers: { number: true, },
    min: (1),
    max: (12),
    disabled: (__VLS_ctx.isPlaying),
    hideDetails: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_200));
// @ts-ignore
[isPlaying, beats,];
var __VLS_197;
const __VLS_204 = {}.VCol;
/** @type {[typeof __VLS_components.VCol, typeof __VLS_components.vCol, typeof __VLS_components.VCol, typeof __VLS_components.vCol, ]} */ ;
// @ts-ignore
VCol;
// @ts-ignore
const __VLS_205 = __VLS_asFunctionalComponent(__VLS_204, new __VLS_204({
    cols: "6",
    md: "4",
}));
const __VLS_206 = __VLS_205({
    cols: "6",
    md: "4",
}, ...__VLS_functionalComponentArgsRest(__VLS_205));
const { default: __VLS_208 } = __VLS_207.slots;
const __VLS_209 = {}.VSelect;
/** @type {[typeof __VLS_components.VSelect, typeof __VLS_components.vSelect, ]} */ ;
// @ts-ignore
VSelect;
// @ts-ignore
const __VLS_210 = __VLS_asFunctionalComponent(__VLS_209, new __VLS_209({
    items: (__VLS_ctx.noteItems),
    itemTitle: "label",
    itemValue: "value",
    label: "Nota (sotto)",
    modelValue: (__VLS_ctx.noteValue),
    disabled: (__VLS_ctx.isPlaying),
    hideDetails: true,
}));
const __VLS_211 = __VLS_210({
    items: (__VLS_ctx.noteItems),
    itemTitle: "label",
    itemValue: "value",
    label: "Nota (sotto)",
    modelValue: (__VLS_ctx.noteValue),
    disabled: (__VLS_ctx.isPlaying),
    hideDetails: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_210));
// @ts-ignore
[isPlaying, noteValue, noteItems,];
var __VLS_207;
var __VLS_182;
__VLS_asFunctionalElement(__VLS_elements.div, __VLS_elements.div)({
    ...{ class: "d-flex justify-center align-center mt-6 flex-wrap" },
    ...{ style: {} },
});
for (const [n] of __VLS_getVForSourceType((__VLS_ctx.beats))) {
    // @ts-ignore
    [beats,];
    __VLS_asFunctionalElement(__VLS_elements.div)({
        key: (n),
        ...{ class: "beat-dot" },
        ...{ class: ({
                active: __VLS_ctx.isPlaying && (__VLS_ctx.currentBeat === n - 1),
                accent: (n === 1)
            }) },
    });
    // @ts-ignore
    [isPlaying, currentBeat,];
}
__VLS_asFunctionalElement(__VLS_elements.div, __VLS_elements.div)({
    ...{ class: "text-center mt-6" },
});
__VLS_asFunctionalElement(__VLS_elements.div, __VLS_elements.div)({
    ...{ class: "display-2 font-weight-bold" },
});
(Math.round(__VLS_ctx.currentBpm));
// @ts-ignore
[currentBpm,];
__VLS_asFunctionalElement(__VLS_elements.div, __VLS_elements.div)({
    ...{ class: "text-medium-emphasis" },
});
var __VLS_177;
const __VLS_214 = {}.VDivider;
/** @type {[typeof __VLS_components.VDivider, typeof __VLS_components.vDivider, ]} */ ;
// @ts-ignore
VDivider;
// @ts-ignore
const __VLS_215 = __VLS_asFunctionalComponent(__VLS_214, new __VLS_214({}));
const __VLS_216 = __VLS_215({}, ...__VLS_functionalComponentArgsRest(__VLS_215));
const __VLS_219 = {}.VCardActions;
/** @type {[typeof __VLS_components.VCardActions, typeof __VLS_components.vCardActions, typeof __VLS_components.VCardActions, typeof __VLS_components.vCardActions, ]} */ ;
// @ts-ignore
VCardActions;
// @ts-ignore
const __VLS_220 = __VLS_asFunctionalComponent(__VLS_219, new __VLS_219({
    ...{ class: "d-flex flex-wrap" },
    ...{ style: {} },
}));
const __VLS_221 = __VLS_220({
    ...{ class: "d-flex flex-wrap" },
    ...{ style: {} },
}, ...__VLS_functionalComponentArgsRest(__VLS_220));
const { default: __VLS_223 } = __VLS_222.slots;
const __VLS_224 = {}.VBtn;
/** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
// @ts-ignore
VBtn;
// @ts-ignore
const __VLS_225 = __VLS_asFunctionalComponent(__VLS_224, new __VLS_224({
    ...{ 'onClick': {} },
    prependIcon: (__VLS_ctx.isPlaying ? 'mdi-stop' : 'mdi-play'),
    color: "primary",
}));
const __VLS_226 = __VLS_225({
    ...{ 'onClick': {} },
    prependIcon: (__VLS_ctx.isPlaying ? 'mdi-stop' : 'mdi-play'),
    color: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_225));
let __VLS_228;
let __VLS_229;
const __VLS_230 = ({ click: {} },
    { onClick: (__VLS_ctx.toggle) });
const { default: __VLS_231 } = __VLS_227.slots;
// @ts-ignore
[isPlaying, toggle,];
(__VLS_ctx.isPlaying ? 'Stop' : 'Start');
// @ts-ignore
[isPlaying,];
var __VLS_227;
const __VLS_232 = {}.VBtn;
/** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
// @ts-ignore
VBtn;
// @ts-ignore
const __VLS_233 = __VLS_asFunctionalComponent(__VLS_232, new __VLS_232({
    ...{ 'onClick': {} },
    prependIcon: "mdi-content-save",
    disabled: (!__VLS_ctx.selected || __VLS_ctx.isPlaying),
}));
const __VLS_234 = __VLS_233({
    ...{ 'onClick': {} },
    prependIcon: "mdi-content-save",
    disabled: (!__VLS_ctx.selected || __VLS_ctx.isPlaying),
}, ...__VLS_functionalComponentArgsRest(__VLS_233));
let __VLS_236;
let __VLS_237;
const __VLS_238 = ({ click: {} },
    { onClick: (__VLS_ctx.saveEdits) });
const { default: __VLS_239 } = __VLS_235.slots;
// @ts-ignore
[isPlaying, selected, saveEdits,];
var __VLS_235;
const __VLS_240 = {}.VSpacer;
/** @type {[typeof __VLS_components.VSpacer, typeof __VLS_components.vSpacer, ]} */ ;
// @ts-ignore
VSpacer;
// @ts-ignore
const __VLS_241 = __VLS_asFunctionalComponent(__VLS_240, new __VLS_240({}));
const __VLS_242 = __VLS_241({}, ...__VLS_functionalComponentArgsRest(__VLS_241));
const __VLS_245 = {}.VSwitch;
/** @type {[typeof __VLS_components.VSwitch, typeof __VLS_components.vSwitch, ]} */ ;
// @ts-ignore
VSwitch;
// @ts-ignore
const __VLS_246 = __VLS_asFunctionalComponent(__VLS_245, new __VLS_245({
    inset: true,
    modelValue: (__VLS_ctx.accentFirst),
    disabled: (__VLS_ctx.isPlaying),
    label: "Accentua primo battito",
}));
const __VLS_247 = __VLS_246({
    inset: true,
    modelValue: (__VLS_ctx.accentFirst),
    disabled: (__VLS_ctx.isPlaying),
    label: "Accentua primo battito",
}, ...__VLS_functionalComponentArgsRest(__VLS_246));
// @ts-ignore
[isPlaying, accentFirst,];
var __VLS_222;
var __VLS_162;
var __VLS_157;
var __VLS_42;
var __VLS_37;
var __VLS_32;
const __VLS_250 = {}.VDialog;
/** @type {[typeof __VLS_components.VDialog, typeof __VLS_components.vDialog, typeof __VLS_components.VDialog, typeof __VLS_components.vDialog, ]} */ ;
// @ts-ignore
VDialog;
// @ts-ignore
const __VLS_251 = __VLS_asFunctionalComponent(__VLS_250, new __VLS_250({
    modelValue: (__VLS_ctx.dialog),
    maxWidth: "520",
}));
const __VLS_252 = __VLS_251({
    modelValue: (__VLS_ctx.dialog),
    maxWidth: "520",
}, ...__VLS_functionalComponentArgsRest(__VLS_251));
const { default: __VLS_254 } = __VLS_253.slots;
// @ts-ignore
[dialog,];
const __VLS_255 = {}.VCard;
/** @type {[typeof __VLS_components.VCard, typeof __VLS_components.vCard, typeof __VLS_components.VCard, typeof __VLS_components.vCard, ]} */ ;
// @ts-ignore
VCard;
// @ts-ignore
const __VLS_256 = __VLS_asFunctionalComponent(__VLS_255, new __VLS_255({}));
const __VLS_257 = __VLS_256({}, ...__VLS_functionalComponentArgsRest(__VLS_256));
const { default: __VLS_259 } = __VLS_258.slots;
const __VLS_260 = {}.VCardTitle;
/** @type {[typeof __VLS_components.VCardTitle, typeof __VLS_components.vCardTitle, typeof __VLS_components.VCardTitle, typeof __VLS_components.vCardTitle, ]} */ ;
// @ts-ignore
VCardTitle;
// @ts-ignore
const __VLS_261 = __VLS_asFunctionalComponent(__VLS_260, new __VLS_260({}));
const __VLS_262 = __VLS_261({}, ...__VLS_functionalComponentArgsRest(__VLS_261));
const { default: __VLS_264 } = __VLS_263.slots;
(__VLS_ctx.editTarget ? 'Modifica canzone' : 'Nuova canzone');
// @ts-ignore
[editTarget,];
var __VLS_263;
const __VLS_265 = {}.VCardText;
/** @type {[typeof __VLS_components.VCardText, typeof __VLS_components.vCardText, typeof __VLS_components.VCardText, typeof __VLS_components.vCardText, ]} */ ;
// @ts-ignore
VCardText;
// @ts-ignore
const __VLS_266 = __VLS_asFunctionalComponent(__VLS_265, new __VLS_265({}));
const __VLS_267 = __VLS_266({}, ...__VLS_functionalComponentArgsRest(__VLS_266));
const { default: __VLS_269 } = __VLS_268.slots;
const __VLS_270 = {}.VForm;
/** @type {[typeof __VLS_components.VForm, typeof __VLS_components.vForm, typeof __VLS_components.VForm, typeof __VLS_components.vForm, ]} */ ;
// @ts-ignore
VForm;
// @ts-ignore
const __VLS_271 = __VLS_asFunctionalComponent(__VLS_270, new __VLS_270({
    ...{ 'onSubmit': {} },
    ref: "formRef",
}));
const __VLS_272 = __VLS_271({
    ...{ 'onSubmit': {} },
    ref: "formRef",
}, ...__VLS_functionalComponentArgsRest(__VLS_271));
let __VLS_274;
let __VLS_275;
const __VLS_276 = ({ submit: {} },
    { onSubmit: (__VLS_ctx.saveSong) });
/** @type {typeof __VLS_ctx.formRef} */ ;
var __VLS_277 = {};
const { default: __VLS_279 } = __VLS_273.slots;
// @ts-ignore
[saveSong, formRef,];
const __VLS_280 = {}.VTextField;
/** @type {[typeof __VLS_components.VTextField, typeof __VLS_components.vTextField, ]} */ ;
// @ts-ignore
VTextField;
// @ts-ignore
const __VLS_281 = __VLS_asFunctionalComponent(__VLS_280, new __VLS_280({
    modelValue: (__VLS_ctx.form.title),
    label: "Titolo",
    required: true,
}));
const __VLS_282 = __VLS_281({
    modelValue: (__VLS_ctx.form.title),
    label: "Titolo",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_281));
// @ts-ignore
[form,];
const __VLS_285 = {}.VTextField;
/** @type {[typeof __VLS_components.VTextField, typeof __VLS_components.vTextField, ]} */ ;
// @ts-ignore
VTextField;
// @ts-ignore
const __VLS_286 = __VLS_asFunctionalComponent(__VLS_285, new __VLS_285({
    modelValue: (__VLS_ctx.form.bpm),
    modelModifiers: { number: true, },
    type: "number",
    label: "BPM",
    min: (20),
    max: (300),
    required: true,
}));
const __VLS_287 = __VLS_286({
    modelValue: (__VLS_ctx.form.bpm),
    modelModifiers: { number: true, },
    type: "number",
    label: "BPM",
    min: (20),
    max: (300),
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_286));
// @ts-ignore
[form,];
const __VLS_290 = {}.VTextField;
/** @type {[typeof __VLS_components.VTextField, typeof __VLS_components.vTextField, ]} */ ;
// @ts-ignore
VTextField;
// @ts-ignore
const __VLS_291 = __VLS_asFunctionalComponent(__VLS_290, new __VLS_290({
    modelValue: (__VLS_ctx.form.beats),
    modelModifiers: { number: true, },
    type: "number",
    label: "Beats (sopra)",
    min: (1),
    max: (12),
    required: true,
}));
const __VLS_292 = __VLS_291({
    modelValue: (__VLS_ctx.form.beats),
    modelModifiers: { number: true, },
    type: "number",
    label: "Beats (sopra)",
    min: (1),
    max: (12),
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_291));
// @ts-ignore
[form,];
const __VLS_295 = {}.VSelect;
/** @type {[typeof __VLS_components.VSelect, typeof __VLS_components.vSelect, ]} */ ;
// @ts-ignore
VSelect;
// @ts-ignore
const __VLS_296 = __VLS_asFunctionalComponent(__VLS_295, new __VLS_295({
    modelValue: (__VLS_ctx.form.noteValue),
    items: (__VLS_ctx.noteItems),
    itemTitle: "label",
    itemValue: "value",
    label: "Nota (sotto)",
    required: true,
}));
const __VLS_297 = __VLS_296({
    modelValue: (__VLS_ctx.form.noteValue),
    items: (__VLS_ctx.noteItems),
    itemTitle: "label",
    itemValue: "value",
    label: "Nota (sotto)",
    required: true,
}, ...__VLS_functionalComponentArgsRest(__VLS_296));
// @ts-ignore
[noteItems, form,];
var __VLS_273;
var __VLS_268;
const __VLS_300 = {}.VCardActions;
/** @type {[typeof __VLS_components.VCardActions, typeof __VLS_components.vCardActions, typeof __VLS_components.VCardActions, typeof __VLS_components.vCardActions, ]} */ ;
// @ts-ignore
VCardActions;
// @ts-ignore
const __VLS_301 = __VLS_asFunctionalComponent(__VLS_300, new __VLS_300({}));
const __VLS_302 = __VLS_301({}, ...__VLS_functionalComponentArgsRest(__VLS_301));
const { default: __VLS_304 } = __VLS_303.slots;
const __VLS_305 = {}.VSpacer;
/** @type {[typeof __VLS_components.VSpacer, typeof __VLS_components.vSpacer, ]} */ ;
// @ts-ignore
VSpacer;
// @ts-ignore
const __VLS_306 = __VLS_asFunctionalComponent(__VLS_305, new __VLS_305({}));
const __VLS_307 = __VLS_306({}, ...__VLS_functionalComponentArgsRest(__VLS_306));
const __VLS_310 = {}.VBtn;
/** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
// @ts-ignore
VBtn;
// @ts-ignore
const __VLS_311 = __VLS_asFunctionalComponent(__VLS_310, new __VLS_310({
    ...{ 'onClick': {} },
    variant: "text",
}));
const __VLS_312 = __VLS_311({
    ...{ 'onClick': {} },
    variant: "text",
}, ...__VLS_functionalComponentArgsRest(__VLS_311));
let __VLS_314;
let __VLS_315;
const __VLS_316 = ({ click: {} },
    { onClick: (...[$event]) => {
            __VLS_ctx.dialog = false;
            // @ts-ignore
            [dialog,];
        } });
const { default: __VLS_317 } = __VLS_313.slots;
var __VLS_313;
const __VLS_318 = {}.VBtn;
/** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
// @ts-ignore
VBtn;
// @ts-ignore
const __VLS_319 = __VLS_asFunctionalComponent(__VLS_318, new __VLS_318({
    ...{ 'onClick': {} },
    color: "primary",
}));
const __VLS_320 = __VLS_319({
    ...{ 'onClick': {} },
    color: "primary",
}, ...__VLS_functionalComponentArgsRest(__VLS_319));
let __VLS_322;
let __VLS_323;
const __VLS_324 = ({ click: {} },
    { onClick: (__VLS_ctx.saveSong) });
const { default: __VLS_325 } = __VLS_321.slots;
// @ts-ignore
[saveSong,];
var __VLS_321;
var __VLS_303;
var __VLS_258;
var __VLS_253;
const __VLS_326 = {}.VDialog;
/** @type {[typeof __VLS_components.VDialog, typeof __VLS_components.vDialog, typeof __VLS_components.VDialog, typeof __VLS_components.vDialog, ]} */ ;
// @ts-ignore
VDialog;
// @ts-ignore
const __VLS_327 = __VLS_asFunctionalComponent(__VLS_326, new __VLS_326({
    modelValue: (__VLS_ctx.confirmDialog),
    maxWidth: "400",
}));
const __VLS_328 = __VLS_327({
    modelValue: (__VLS_ctx.confirmDialog),
    maxWidth: "400",
}, ...__VLS_functionalComponentArgsRest(__VLS_327));
const { default: __VLS_330 } = __VLS_329.slots;
// @ts-ignore
[confirmDialog,];
const __VLS_331 = {}.VCard;
/** @type {[typeof __VLS_components.VCard, typeof __VLS_components.vCard, typeof __VLS_components.VCard, typeof __VLS_components.vCard, ]} */ ;
// @ts-ignore
VCard;
// @ts-ignore
const __VLS_332 = __VLS_asFunctionalComponent(__VLS_331, new __VLS_331({}));
const __VLS_333 = __VLS_332({}, ...__VLS_functionalComponentArgsRest(__VLS_332));
const { default: __VLS_335 } = __VLS_334.slots;
const __VLS_336 = {}.VCardTitle;
/** @type {[typeof __VLS_components.VCardTitle, typeof __VLS_components.vCardTitle, typeof __VLS_components.VCardTitle, typeof __VLS_components.vCardTitle, ]} */ ;
// @ts-ignore
VCardTitle;
// @ts-ignore
const __VLS_337 = __VLS_asFunctionalComponent(__VLS_336, new __VLS_336({}));
const __VLS_338 = __VLS_337({}, ...__VLS_functionalComponentArgsRest(__VLS_337));
const { default: __VLS_340 } = __VLS_339.slots;
var __VLS_339;
const __VLS_341 = {}.VCardText;
/** @type {[typeof __VLS_components.VCardText, typeof __VLS_components.vCardText, typeof __VLS_components.VCardText, typeof __VLS_components.vCardText, ]} */ ;
// @ts-ignore
VCardText;
// @ts-ignore
const __VLS_342 = __VLS_asFunctionalComponent(__VLS_341, new __VLS_341({}));
const __VLS_343 = __VLS_342({}, ...__VLS_functionalComponentArgsRest(__VLS_342));
const { default: __VLS_345 } = __VLS_344.slots;
var __VLS_344;
const __VLS_346 = {}.VCardActions;
/** @type {[typeof __VLS_components.VCardActions, typeof __VLS_components.vCardActions, typeof __VLS_components.VCardActions, typeof __VLS_components.vCardActions, ]} */ ;
// @ts-ignore
VCardActions;
// @ts-ignore
const __VLS_347 = __VLS_asFunctionalComponent(__VLS_346, new __VLS_346({}));
const __VLS_348 = __VLS_347({}, ...__VLS_functionalComponentArgsRest(__VLS_347));
const { default: __VLS_350 } = __VLS_349.slots;
const __VLS_351 = {}.VSpacer;
/** @type {[typeof __VLS_components.VSpacer, typeof __VLS_components.vSpacer, ]} */ ;
// @ts-ignore
VSpacer;
// @ts-ignore
const __VLS_352 = __VLS_asFunctionalComponent(__VLS_351, new __VLS_351({}));
const __VLS_353 = __VLS_352({}, ...__VLS_functionalComponentArgsRest(__VLS_352));
const __VLS_356 = {}.VBtn;
/** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
// @ts-ignore
VBtn;
// @ts-ignore
const __VLS_357 = __VLS_asFunctionalComponent(__VLS_356, new __VLS_356({
    ...{ 'onClick': {} },
    variant: "text",
}));
const __VLS_358 = __VLS_357({
    ...{ 'onClick': {} },
    variant: "text",
}, ...__VLS_functionalComponentArgsRest(__VLS_357));
let __VLS_360;
let __VLS_361;
const __VLS_362 = ({ click: {} },
    { onClick: (...[$event]) => {
            __VLS_ctx.confirmDialog = false;
            // @ts-ignore
            [confirmDialog,];
        } });
const { default: __VLS_363 } = __VLS_359.slots;
var __VLS_359;
const __VLS_364 = {}.VBtn;
/** @type {[typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, typeof __VLS_components.VBtn, typeof __VLS_components.vBtn, ]} */ ;
// @ts-ignore
VBtn;
// @ts-ignore
const __VLS_365 = __VLS_asFunctionalComponent(__VLS_364, new __VLS_364({
    ...{ 'onClick': {} },
    color: "error",
}));
const __VLS_366 = __VLS_365({
    ...{ 'onClick': {} },
    color: "error",
}, ...__VLS_functionalComponentArgsRest(__VLS_365));
let __VLS_368;
let __VLS_369;
const __VLS_370 = ({ click: {} },
    { onClick: (__VLS_ctx.doRemove) });
const { default: __VLS_371 } = __VLS_367.slots;
// @ts-ignore
[doRemove,];
var __VLS_367;
var __VLS_349;
var __VLS_334;
var __VLS_329;
var __VLS_3;
/** @type {__VLS_StyleScopedClasses['py-6']} */ ;
/** @type {__VLS_StyleScopedClasses['g-6']} */ ;
/** @type {__VLS_StyleScopedClasses['h-100']} */ ;
/** @type {__VLS_StyleScopedClasses['text-subtitle-1']} */ ;
/** @type {__VLS_StyleScopedClasses['pa-0']} */ ;
/** @type {__VLS_StyleScopedClasses['font-medium']} */ ;
/** @type {__VLS_StyleScopedClasses['mr-1']} */ ;
/** @type {__VLS_StyleScopedClasses['mr-1']} */ ;
/** @type {__VLS_StyleScopedClasses['pa-6']} */ ;
/** @type {__VLS_StyleScopedClasses['text-medium-emphasis']} */ ;
/** @type {__VLS_StyleScopedClasses['h-100']} */ ;
/** @type {__VLS_StyleScopedClasses['d-flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-column']} */ ;
/** @type {__VLS_StyleScopedClasses['d-flex']} */ ;
/** @type {__VLS_StyleScopedClasses['align-center']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-space-between']} */ ;
/** @type {__VLS_StyleScopedClasses['text-subtitle-1']} */ ;
/** @type {__VLS_StyleScopedClasses['text-medium-emphasis']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-grow-1']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-2']} */ ;
/** @type {__VLS_StyleScopedClasses['d-flex']} */ ;
/** @type {__VLS_StyleScopedClasses['justify-center']} */ ;
/** @type {__VLS_StyleScopedClasses['align-center']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
/** @type {__VLS_StyleScopedClasses['beat-dot']} */ ;
/** @type {__VLS_StyleScopedClasses['active']} */ ;
/** @type {__VLS_StyleScopedClasses['accent']} */ ;
/** @type {__VLS_StyleScopedClasses['text-center']} */ ;
/** @type {__VLS_StyleScopedClasses['mt-6']} */ ;
/** @type {__VLS_StyleScopedClasses['display-2']} */ ;
/** @type {__VLS_StyleScopedClasses['font-weight-bold']} */ ;
/** @type {__VLS_StyleScopedClasses['text-medium-emphasis']} */ ;
/** @type {__VLS_StyleScopedClasses['d-flex']} */ ;
/** @type {__VLS_StyleScopedClasses['flex-wrap']} */ ;
// @ts-ignore
var __VLS_278 = __VLS_277;
var __VLS_dollars;
const __VLS_self = (await import('vue')).defineComponent({
    setup: () => ({
        songs: songs,
        selected: selected,
        bpm: bpm,
        beats: beats,
        noteValue: noteValue,
        accentFirst: accentFirst,
        isPlaying: isPlaying,
        currentBeat: currentBeat,
        currentBpm: currentBpm,
        selectSong: selectSong,
        saveEdits: saveEdits,
        moveUp: moveUp,
        moveDown: moveDown,
        toggle: toggle,
        dialog: dialog,
        formRef: formRef,
        form: form,
        editTarget: editTarget,
        noteItems: noteItems,
        openDialogForNew: openDialogForNew,
        openDialogForEdit: openDialogForEdit,
        saveSong: saveSong,
        confirmDialog: confirmDialog,
        confirmRemove: confirmRemove,
        doRemove: doRemove,
    }),
});
export default (await import('vue')).defineComponent({});
; /* PartiallyEnd: #4569/main.vue */

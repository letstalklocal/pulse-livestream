import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Keyboard, KeyboardAvoidingView, Modal, Platform, ScrollView, StatusBar, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { KeyboardAvoidingView as StreamKeyboardAvoidingView, useKeyboardState } from 'react-native-keyboard-controller';
import { GoldCoinIcon } from '@/components/GoldCoinIcon';
import { LiveChatAvatar } from '@/components/LiveChatAvatar';
import { LinearGradient } from 'expo-linear-gradient';
import { GiftPicker, type Gift } from '@/components/GiftPicker';
import { LiveStickerSetup } from '@/components/LiveStickerSetup';
import { PrototypeStickerOverlay } from '@/components/PrototypeStickerOverlay';
import type { StickerDraft } from '@/utils/liveStickers';
import type { CachedVideoPlayerProps } from '@/components/CachedVideoPlayer';
import { GiftFloater, type FloatingGift } from '@/components/GiftFloater';
import { requireOptionalNativeModule } from 'expo';
import { useIsFocused } from 'expo-router';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { useAppLanguage } from '@/i18n';
import { VIDEO_PROTOTYPE_ENABLED, VIDEO_PROTOTYPE_SAMPLE } from '@/utils/videoPrototype';
import { videoCache } from '@/utils/videoCache';
import { VIDEO_CACHE_TTL_MS, type CacheEntry, type CacheLease } from '@/utils/videoCache/core';

// Old binaries must still open Discovery safely; only load the player module when supported.
function nativePlayer() {
  if (Platform.OS === 'web' || !requireOptionalNativeModule('ExpoVideo')) return null;
  return require('@/components/CachedVideoPlayer').default as React.ComponentType<CachedVideoPlayerProps>;
}
const Player = nativePlayer();

export default function VideoPrototypeScreen() {
  const { t, appLocale } = useAppLanguage();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [stickers, setStickers] = useState<StickerDraft[]>([{ kind: 'gift', giftId: 'rose' }]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [showTools, setShowTools] = useState(false);
  const [showGifts, setShowGifts] = useState(false);
  const [floatingGifts, setFloatingGifts] = useState<FloatingGift[]>([]);
  const giftSequence = useRef(0);
  const [giftTotal, setGiftTotal] = useState(0);
  const [draft, setDraft] = useState('');
  const draftRef = useRef('');
  const [messages, setMessages] = useState<{ id: number; text: string }[]>([]);
  const messageSequence = useRef(0);
  const [following, setFollowing] = useState(false);
  const composer = useRef<TextInput>(null);
  const chatScroll = useRef<ScrollView>(null);
  const keyboardVisible = useKeyboardState(state => state.isVisible);
  const sendMessage = () => {
    const text = draftRef.current.trim();
    if (!text) return;
    draftRef.current = '';
    setDraft('');
    setMessages(previous => [...previous.slice(-99), { id: ++messageSequence.current, text }]);
    composer.current?.focus();
  };
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [url, setUrl] = useState(VIDEO_PROTOTYPE_SAMPLE);
  const [request, setRequest] = useState<{ url: string; id: number } | null>({ url: VIDEO_PROTOTYPE_SAMPLE, id: 0 });
  const [lease, setLease] = useState<CacheLease | null>(null);
  const [rows, setRows] = useState<CacheEntry[]>([]);
  const [downloaded, setDownloaded] = useState(0);
  const [status, setStatus] = useState('Choose a sample or paste a direct MP4 link.');
  const [lastPlaybackStatus, setLastPlaybackStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [maintenance, setMaintenance] = useState(false);
  const mounted = useRef(true);
  const operation = useRef(false);
  const active = VIDEO_PROTOTYPE_ENABLED && !!Player && focused && foreground;
  const playbackActive = active && !showTools;
  useEffect(() => {
    if (!active) { setShowGifts(false); setFloatingGifts([]); }
  }, [active]);
  const refresh = useCallback(async () => {
    const result = await videoCache.snapshot();
    if (mounted.current) setRows(result.sort((a, b) => a.createdAt - b.createdAt));
  }, []);
  useEffect(() => {
    mounted.current = true;
    const subscription = AppState.addEventListener('change', state => setForeground(state === 'active'));
    return () => { mounted.current = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    if (active) void refresh().catch(() => setStatus('Could not update the cache. Try again.'));
  }, [active, refresh]);
  useEffect(() => {
    if (!playbackActive || !request) return;
    const controller = new AbortController();
    let current: CacheLease | undefined;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    let alive = true;
    setBusy(true);
    setDownloaded(0);
    setStatus('Loading video…');
    void videoCache.acquire(request.url, request.url, controller.signal, bytes => {
      if (alive) setDownloaded(bytes);
    }).then(result => {
      if (!alive) { void result.release().catch(() => {}); return; }
      current = result;
      setLease(result);
      setBusy(false);
      const playbackStatus = result.source === 'cache' ? 'Playing from phone cache' : 'Downloaded; playing from phone cache';
      setStatus(playbackStatus);
      setLastPlaybackStatus(playbackStatus);
      deadline = setTimeout(() => {
        setRequest(null);
        setStatus('Cache expired. Tap Play to download again.');
      }, Math.max(0, result.createdAt + VIDEO_CACHE_TTL_MS - Date.now()));
      void refresh().catch(() => {});
    }).catch(() => {
      if (alive) {
        setBusy(false);
        setRequest(null);
        setStatus('Video could not load. Check your connection and MP4 link, then retry.');
      }
    });
    return () => {
      alive = false;
      controller.abort();
      if (deadline) clearTimeout(deadline);
      setLease(null);
      setBusy(false);
      if (current) void current.release().then(refresh).catch(() => {});
    };
  }, [playbackActive, request, refresh]);
  const onPlayerError = useCallback(() => {
    setRequest(null);
    setStatus('Video could not play. Try another MP4 link.');
  }, []);
  const start = () => {
    if (operation.current) return;
    const candidate = url.trim();
    if (!/^https:\/\//i.test(candidate)) { setStatus('Use an HTTPS link to an MP4 video.'); return; }
    setShowTools(false);
    setRequest({ url: candidate, id: Date.now() });
  };
  const openTools = () => {
    Keyboard.dismiss();
    setRequest(null);
    setStatus('Stopped');
    setShowTools(true);
  };
  const previewGift = (gift: Gift) => {
    setShowGifts(false);
    setGiftTotal(total => total + gift.coins);
    setFloatingGifts(previous => [...previous.slice(-7), {
      id: `video-preview-${++giftSequence.current}`, emoji: gift.emoji, name: gift.name,
      senderName: '', x: 0, size: gift.size,
    }]);
  };
  const maintain = async (expire: boolean) => {
    if (operation.current || request) return;
    operation.current = true;
    setMaintenance(true);
    try {
      if (expire) await videoCache.expireForTest(); else await videoCache.clear();
      await refresh();
      if (mounted.current) setStatus(expire ? 'Cached videos expired.' : 'Cache cleared.');
    } catch { if (mounted.current) setStatus('Could not update the cache. Try again.'); }
    finally { operation.current = false; if (mounted.current) setMaintenance(false); }
  };
  const button = (label: string, action: () => void, disabled = false) => <TouchableOpacity
    accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={action}
    style={[styles.button, { backgroundColor: colors.secondary, opacity: disabled ? 0.4 : 1 }]}>
    <Text style={{ color: colors.foreground }}>{t(label)}</Text>
  </TouchableOpacity>;
  return <View style={styles.root}>
    <StatusBar barStyle="light-content" />
    <View style={styles.videoBackground}>
      <View testID="video-portrait-stage" style={StyleSheet.absoluteFill}>
        {playbackActive && lease && Player ? <Player key={lease.file} uri={lease.uri} onError={onPlayerError}
          contentFit="cover" nativeControls={false} paused={galleryOpen} /> :
          <View style={styles.placeholder}>
            {busy ? <ActivityIndicator color="#FFF" size="large" /> : <Ionicons name="play-circle-outline" size={56} color="#FFF" />}
            <Text style={styles.message}>{!VIDEO_PROTOTYPE_ENABLED ? t('Prototype disabled in this build.') : !Player ?
              t('Install a new Android or iPhone build to test video caching.') : t(status)}</Text>
          </View>}
      </View>
    </View>
    <LinearGradient pointerEvents="none" colors={['rgba(0,0,0,0.7)', 'transparent']} style={styles.topShade} />
    <LinearGradient pointerEvents="none" colors={['transparent', 'rgba(0,0,0,0.75)']} style={styles.bottomShade} />
    <View style={[styles.header, { top: insets.top + 8 }]}>
      <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Back')} style={styles.back} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={25} color="#FFF" />
      </TouchableOpacity>
      <View style={styles.avatar}><Ionicons name="videocam" size={15} color="#FFF" /></View>
      <Text style={[styles.heading, { flex: 1, color: '#FFF' }]} numberOfLines={1}>{t('Video prototype')}</Text>
      <View style={{ alignItems: 'flex-end', gap: 3 }}>
        <View style={styles.statsPill}>
          <View accessible accessibilityLabel={`${t('Preview gifts')}: ${giftTotal.toLocaleString(appLocale())} ${t('coins')}`} style={styles.statItem}>
            <GoldCoinIcon size={14} />
            <Text testID="video-gift-total" style={styles.statsText}>{giftTotal.toLocaleString(appLocale())}</Text>
          </View>
          <View style={styles.statsDivider} />
          <View accessible accessibilityLabel={`${t('Viewers')}: ${(active ? 1 : 0).toLocaleString(appLocale())}`} style={styles.statItem}>
            <Ionicons name="eye" size={12} color="#FFF" />
            <Text testID="video-viewer-count" style={styles.statsText}>{(active ? 1 : 0).toLocaleString(appLocale())}</Text>
          </View>
        </View>
      </View>
    </View>
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {floatingGifts.map(gift => <GiftFloater key={gift.id} gift={gift}
        onDone={id => setFloatingGifts(previous => previous.filter(item => item.id !== id))} />)}
    </View>
    <StreamKeyboardAvoidingView pointerEvents="box-none" style={StyleSheet.absoluteFill}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={0} automaticOffset>
      <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <TouchableOpacity accessible={false} activeOpacity={1} onPress={Keyboard.dismiss} style={{ flex: 1, marginTop: insets.top + 60 }} />
        <View style={{ paddingHorizontal: 14, paddingBottom: keyboardVisible ? 0 : insets.bottom + 10 }}>
          <ScrollView ref={chatScroll} style={{ maxHeight: 240 }} contentContainerStyle={{ gap: 5 }}
            keyboardShouldPersistTaps="always" keyboardDismissMode="on-drag"
            onTouchStart={Keyboard.dismiss} onContentSizeChange={() => chatScroll.current?.scrollToEnd({ animated: true })}>
            {messages.map(message => <View key={message.id} style={styles.chatRow}>
              <LiveChatAvatar senderName={t('You')} />
              <View style={{ flexShrink: 1 }}>
                <Text style={styles.chatName}>{t('You')}</Text>
                <Text style={styles.chatText}>{message.text}</Text>
              </View>
            </View>)}
          </ScrollView>
          <View style={styles.bottomControls}>
            <View style={styles.composer}>
              <TextInput ref={composer} style={styles.chatInput} value={draft} maxLength={500}
                onChangeText={value => { draftRef.current = value; setDraft(value); }}
                placeholder={t('Type...')} accessibilityLabel={t('Type...')} placeholderTextColor="rgba(255,255,255,0.45)"
                returnKeyType="send" blurOnSubmit={false} onSubmitEditing={sendMessage} />
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Send')} disabled={!draft.trim()}
                accessibilityState={{ disabled: !draft.trim() }} onPress={sendMessage} style={styles.sendButton}>
                <Ionicons name="send" size={18} color={draft.trim() ? '#FFF' : 'rgba(255,255,255,0.3)'} />
              </TouchableOpacity>
            </View>
            {!keyboardVisible && <>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t(following ? 'Following' : 'Follow')}
                accessibilityState={{ selected: following }} onPress={() => setFollowing(value => !value)}
                style={[styles.followButton, following && { backgroundColor: '#341021', borderWidth: 1, borderColor: '#FF1966' }]}>
                <Ionicons name={following ? 'checkmark' : 'add'} size={22} color="#FFF" />
              </TouchableOpacity>
              <TouchableOpacity testID="video-gift-button" accessibilityRole="button" accessibilityLabel={t('Send a Gift')}
                disabled={!active || !lease} onPress={() => { Keyboard.dismiss(); setShowGifts(true); }}
                style={[styles.actionButton, { opacity: active && lease ? 1 : 0.4 }]}>
                <Ionicons name="gift-outline" size={24} color="#FFD700" />
              </TouchableOpacity>
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('More')} onPress={openTools} style={styles.actionButton}>
                <Ionicons name="ellipsis-vertical" size={24} color="#FFF" />
              </TouchableOpacity>
            </>}
          </View>
        </View>
      </View>
    </StreamKeyboardAvoidingView>
    <PrototypeStickerOverlay value={stickers} visible={playbackActive && !keyboardVisible} top={insets.top + 66}
      onGift={previewGift} onGalleryChange={setGalleryOpen} />
    <GiftPicker visible={showGifts && active} preview coins={0} onClose={() => setShowGifts(false)} onSend={previewGift}
      hintText="Test gifts only. No coins are spent." />
    <Modal visible={showTools} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowTools(false)}>
      <KeyboardAvoidingView style={styles.modalRoot} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Close')} style={{ flex: 1 }} onPress={() => setShowTools(false)} />
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.heading, { color: colors.foreground }]}>{t('Video prototype')}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={t('Close')} style={styles.back} onPress={() => setShowTools(false)}>
              <Ionicons name="close" size={24} color={colors.foreground} />
            </TouchableOpacity>
          </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 18, paddingBottom: insets.bottom + 24, gap: 12 }}>
        <LiveStickerSetup value={stickers} onChange={setStickers} disabled={!active} />
        <Text style={{ color: colors.mutedForeground }}>{t('Sample playback only. Nothing is published to other viewers.')}</Text>
        <Text style={{ color: colors.mutedForeground }}>{t('Chat and follows are local tests on this phone.')}</Text>
        <TextInput accessibilityLabel={t('Video URL')} value={url} onChangeText={setUrl} autoCapitalize="none" autoCorrect={false}
          editable={!request && !maintenance} keyboardType="url" style={[styles.input, { color: colors.foreground, borderColor: colors.border }]} />
        <View style={styles.actions}>
          {button('Play', start, !active || !!request || maintenance)}
          {button('Stop', () => { setRequest(null); setStatus('Stopped'); }, !request)}
          {button('Use sample', () => setUrl(VIDEO_PROTOTYPE_SAMPLE), !!request || maintenance)}
        </View>
        <Text accessibilityLiveRegion="polite" style={{ color: colors.foreground }}>{t(status)}</Text>
        {!!lastPlaybackStatus && <Text style={{ color: colors.mutedForeground }}>{t('Last playback: {v0}', { v0: t(lastPlaybackStatus) })}</Text>}
        <Text style={{ color: colors.mutedForeground }}>{t('Downloaded this play: {v0} MB', { v0: (downloaded / 1024 / 1024).toFixed(2) })}</Text>
        <Text style={[styles.heading, { color: colors.foreground }]}>{t('Phone cache')}</Text>
        <Text style={{ color: colors.mutedForeground }}>{t('24 hours · oldest first · 256 MB test limit')}</Text>
        <Text style={{ color: colors.mutedForeground }}>{t('Stop and play again to test a cache hit. Use another MP4 link to test multiple videos.')}</Text>
        <View style={styles.actions}>
          {button('Expire cache now', () => { void maintain(true); }, !!request || maintenance)}
          {button('Clear cache', () => { void maintain(false); }, !!request || maintenance)}
        </View>
        {rows.length === 0 && <Text style={{ color: colors.mutedForeground }}>{t('No cached videos')}</Text>}
        {rows.map((row, index) => <View key={row.file} style={[styles.cacheRow, { borderColor: colors.border }]}>
          <Text style={{ color: colors.foreground }}>{index + 1}. {(row.bytes / 1024 / 1024).toFixed(2)} MB</Text>
          <Text numberOfLines={1} style={{ color: colors.mutedForeground }}>{row.key}</Text>
          <Text style={{ color: colors.mutedForeground }}>{t('Expires: {v0}', { v0: new Date(row.createdAt + VIDEO_CACHE_TTL_MS).toLocaleString(appLocale()) })}</Text>
        </View>)}
        <Text style={{ color: colors.mutedForeground }}>{t('Sample: {v0}', { v0: 'Pexels / vibeappspro · 720 × 1280 · 4s' })}</Text>
      </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  videoBackground: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  topShade: { position: 'absolute', top: 0, left: 0, right: 0, height: 160 },
  bottomShade: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 180 },
  header: { position: 'absolute', left: 4, right: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: '#753AC0', marginRight: 6 },
  heading: { fontSize: 16, fontWeight: '700', flexShrink: 1 },
  statsPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statsText: { color: '#FFF', fontSize: 12, fontWeight: '600', fontFamily: 'Inter_600SemiBold' },
  statsDivider: { width: 1, height: 10, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 2 },
  bottomControls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 10 },
  composer: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 24, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' },
  chatInput: { flex: 1, minWidth: 0, paddingHorizontal: 16, paddingVertical: 10, color: '#FFF', fontSize: 14, fontFamily: 'Inter_400Regular' },
  sendButton: { width: 40, height: 44, alignItems: 'center', justifyContent: 'center' },
  followButton: { width: 38, height: 38, borderRadius: 19, backgroundColor: '#FF1966', alignItems: 'center', justifyContent: 'center' },
  actionButton: { minWidth: 36, height: 44, alignItems: 'center', justifyContent: 'center' },
  chatRow: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '60%' },
  chatName: { color: 'rgba(255,255,255,0.7)', fontSize: 12, fontFamily: 'Inter_600SemiBold' },
  chatText: { color: '#FFF', fontSize: 13, fontFamily: 'Inter_400Regular' },
  roundButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center' },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  input: { borderWidth: 1, borderRadius: 12, padding: 12, minHeight: 48 },
  button: { borderRadius: 12, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  message: { color: '#FFF', padding: 24, textAlign: 'center' },
  cacheRow: { borderBottomWidth: 1, paddingVertical: 12, gap: 6 },
  modalRoot: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
  sheet: { maxHeight: '85%', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 8 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 18, paddingRight: 6 },
});

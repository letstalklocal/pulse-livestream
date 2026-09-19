import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/expo';
import { Ionicons } from '@expo/vector-icons';
import { useAppLanguage } from '@/i18n';
import { useColors } from '@/hooks/useColors';
import { videoRequest, type VideoStats } from '@/utils/creatorVideos';
import { GoldCoinIcon } from './GoldCoinIcon';

export function VideoManagementSummary({ videoId, onDetails, disabled }: { videoId: string; onDetails: () => void; disabled: boolean }) {
  const { userId, getToken } = useAuth();
  const { t, appLocale } = useAppLanguage();
  const colors = useColors();
  const query = useQuery({
    queryKey: ['creator-video-stats', userId, videoId],
    queryFn: ({ signal }) => videoRequest<VideoStats>(`/${videoId}/stats`, getToken, 'GET', undefined, signal),
    enabled: !!userId, retry: false, staleTime: 0,
  });
  return <View style={{ gap: 12 }}>
    {query.isLoading ? <ActivityIndicator color="#00D4D4" /> : query.isError ?
      <TouchableOpacity onPress={() => void query.refetch()} accessibilityLabel={t('Retry')}><Text style={{ color: colors.primary, textAlign: 'center' }}>{t('Video service unavailable. Try again.')}</Text></TouchableOpacity> :
      <View style={[styles.metrics, { backgroundColor: colors.card }]}>
        <View style={styles.metric}><Ionicons name="eye-outline" size={17} color={colors.mutedForeground} /><Text style={[styles.number, { color: colors.foreground }]}>{query.data?.viewers.toLocaleString(appLocale()) ?? '—'}</Text><Text style={[styles.label, { color: colors.mutedForeground }]}>{t('Viewers')}</Text></View>
        <View style={styles.metric}><Ionicons name="time-outline" size={17} color={colors.mutedForeground} /><Text style={[styles.number, { color: colors.foreground }]}>{query.data?.averageWatchSeconds.toLocaleString(appLocale(), { maximumFractionDigits: 1 }) ?? '—'} <Text style={styles.unit}>{t('seconds')}</Text></Text><Text style={[styles.label, { color: colors.mutedForeground }]}>{t('Average watch time')}</Text></View>
        <View style={styles.metric}><GoldCoinIcon size={17} /><Text style={[styles.number, { color: colors.foreground }]}>{query.data?.coins.toLocaleString(appLocale()) ?? '—'}</Text><Text style={[styles.label, { color: colors.mutedForeground }]}>{t('Total coins')}</Text></View>
      </View>}
    <TouchableOpacity style={styles.details} onPress={onDetails} disabled={disabled} accessibilityLabel={t('Show details')}>
      <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: '600' }}>{t('Show details')}</Text><Ionicons name="chevron-forward" size={18} color={colors.mutedForeground} />
    </TouchableOpacity>
  </View>;
}
const styles = StyleSheet.create({
  metrics: { flexDirection: 'row', borderRadius: 14, paddingVertical: 14 },
  metric: { flex: 1, alignItems: 'center', gap: 5, paddingHorizontal: 3 },
  number: { fontSize: 19, fontWeight: '700' }, unit: { fontSize: 10, fontWeight: '400' },
  label: { fontSize: 10, textAlign: 'center' }, details: { minHeight: 40, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6 },
});

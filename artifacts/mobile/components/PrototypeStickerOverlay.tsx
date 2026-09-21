import React, { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { useAuth as useClerkAuth } from '@clerk/expo';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/context/AuthContext';
import { useAppLanguage } from '@/i18n';
import { stickerApi, type StickerDraft } from '@/utils/liveStickers';
import { GIFTS, type Gift } from './GiftPicker';
import { LiveStickerCard } from './LiveStickerCard';
import { MediaPackGallery, type PackMediaItem } from './MediaPackGallery';

type Pack = { id: string; name: string; price: number; giftId: string; items: PackMediaItem[] };
// Local prototype only: gifts animate, and creators preview their own packs.
// Actual paid transactions remain in the recorded-video sticker overlay.
export function PrototypeStickerOverlay({ value, visible, top, onGift, onGalleryChange }: {
  value: StickerDraft[]; visible: boolean; top: number;
  onGift: (gift: Gift) => void; onGalleryChange: (open: boolean) => void;
}) {
  const { getToken } = useClerkAuth();
  const { user } = useAuth();
  const { t } = useAppLanguage();
  const [gallery, setGallery] = useState<PackMediaItem[] | null>(null);
  const [dismissed, setDismissed] = useState<number[]>([]);
  const packs = useQuery({
    queryKey: ['sticker-packs', user?.uid],
    enabled: !!user && visible && value.some(s => s.kind === 'pack'),
    queryFn: ({ signal }) => stickerApi<{ packs: Pack[] }>('/media-packs', getToken, 'GET', undefined, signal),
  });
  useEffect(() => {
    if (!visible) { setGallery(null); onGalleryChange(false); }
  }, [visible, onGalleryChange]);
  return <>
    {visible && <View pointerEvents="box-none" style={{ position: 'absolute', left: 12, top, gap: 6 }}>
      {value.map((draft, index) => {
        const pack = packs.data?.packs.find(p => Number(p.id) === draft.packId);
        const gift = GIFTS.find(g => g.id === (pack?.giftId ?? draft.giftId));
        if (!gift || (draft.kind === 'pack' && dismissed.includes(draft.packId!))) return null;
        return <LiveStickerCard key={`${draft.kind}:${draft.packId ?? draft.giftId}`} sticker={{
          ...draft, id: `prototype-${index}`, giftId: gift.id, name: pack?.name ?? gift.name,
          price: pack?.price ?? gift.coins, owned: false,
          videos: pack?.items.filter(i => i.mediaType === 'video').length ?? 0,
          pictures: pack?.items.filter(i => i.mediaType === 'image').length ?? 0,
        }} onPress={() => {
          if (draft.kind === 'gift') { onGift(gift); return; }
          if (!pack) { Alert.alert(t('Please try again.')); return; }
          setGallery(pack.items);
          setDismissed(previous => [...previous, Number(pack.id)]);
          onGalleryChange(true);
        }} />;
      })}
    </View>}
    {gallery && <MediaPackGallery items={gallery} onClose={() => { setGallery(null); onGalleryChange(false); }} />}
  </>;
}

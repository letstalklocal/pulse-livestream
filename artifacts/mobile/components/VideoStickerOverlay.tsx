import React, { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useAuth as useClerkAuth } from "@clerk/expo";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { useAppLanguage } from "@/i18n";
import { videoRequest } from "@/utils/creatorVideos";
import { LiveStickerCard } from "./LiveStickerCard";
import { MediaPackGallery, type PackMediaItem } from "./MediaPackGallery";
import { GIFTS } from "./GiftPicker";
import { getGetCoinBalanceQueryKey } from "@workspace/api-client-react";

type Sticker = { id:string; kind:"gift"|"pack"; giftId:string; packId?:number; price:number; name:string; videos:number; pictures:number; owned:boolean };
export function VideoStickerOverlay({ videoId, visible, top, isHost, onGift, onPause, onResume }: { videoId:string; visible:boolean; top:number; isHost:boolean; onGift:(id:string)=>void; onPause:()=>void; onResume:()=>void }) {
 const {user}=useAuth(); const {getToken}=useClerkAuth(); const {t}=useAppLanguage(); const client=useQueryClient();
 const [busy,setBusy]=useState(false), [gallery,setGallery]=useState<PackMediaItem[]|null>(null); const keys=useRef(new Map<string,string>());
 const key=["video-stickers",videoId,user?.uid]; const dismissKey=`dismissed-video-stickers:${user?.uid}`;
 const status=useQuery({queryKey:key,enabled:!!user&&visible,refetchInterval:visible?5000:false,retry:false,queryFn:({signal})=>videoRequest<{stickers:Sticker[]}>(`/${videoId}/stickers`,getToken,"GET",undefined,signal)});
 const dismissed=useQuery({queryKey:[dismissKey,videoId],enabled:!!user&&!isHost,queryFn:async()=>JSON.parse((await AsyncStorage.getItem(dismissKey))??"{}")[videoId]??[]});
 useEffect(()=>{if(!visible){setGallery(null);}},[visible]);
 const open=async(s:Sticker)=>{ if(busy||!user)return; setBusy(true); try { if(s.kind==="gift"){onGift(s.giftId);return;} if(s.owned){ const result=await videoRequest<{pack:{items:PackMediaItem[],unlocked:boolean,isOwner:boolean}}>(`/media-packs/${s.packId}`,getToken); if(!result.pack.unlocked&&!result.pack.isOwner)throw Error("Pack access denied"); const old=JSON.parse((await AsyncStorage.getItem(dismissKey))??"{}"); await AsyncStorage.setItem(dismissKey,JSON.stringify({...old,[videoId]:[...(old[videoId]??[]),s.id]})); await client.invalidateQueries({queryKey:[dismissKey,videoId]});onPause();setGallery(result.pack.items);return; }
 const request=keys.current.get(s.id)??Crypto.randomUUID();keys.current.set(s.id,request); const result=await videoRequest<{balance:number}>(`/${videoId}/stickers/${s.id}/unlock`,getToken,"POST",{packId:s.packId,expectedPrice:s.price,idempotencyKey:request});keys.current.delete(s.id);client.setQueryData(getGetCoinBalanceQueryKey({uid:user.uid}),{balance:result.balance});await client.invalidateQueries({queryKey:key}); Alert.alert(t("Sent to your messages")); } catch(e){Alert.alert(t("Please try again."),t(e instanceof Error?e.message:"Please try again."));} finally{setBusy(false);} };
 const tap=(s:Sticker)=>{if(s.kind==="gift"||s.owned)return void open(s);Alert.alert(t("Unlock media pack?"),t("This will deduct {v0} coins from your balance. You can view these {v1} items again after unlocking.",{v0:s.price,v1:s.videos+s.pictures}),[{text:t("Cancel"),style:"cancel"},{text:t("Unlock for {v0}",{v0:s.price}),onPress:()=>void open(s)}]);};
 const stickers=(status.data?.stickers??[]).filter(s=>isHost||!(dismissed.data??[]).includes(s.id));
 return <>{visible&&(!isHost?dismissed.isSuccess:true)?<View pointerEvents="box-none" style={[styles.stack,{top}]}>{stickers.map(s=><LiveStickerCard key={s.id} sticker={s} disabled={busy} showOwned={!isHost} onPress={isHost?undefined:()=>tap(s)}/>)}</View>:null}{gallery?<MediaPackGallery items={gallery} onClose={()=>{setGallery(null);onResume();}}/>:null}</>;
}
const styles=StyleSheet.create({stack:{position:"absolute",left:12,gap:6}});

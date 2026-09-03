import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import React, { useState } from "react";
import { Alert, FlatList, Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
// @ts-ignore generated media-pack hooks
import { getGetCoinBalanceQueryKey, useGetMediaPack, useUnlockMediaPack } from "@workspace/api-client-react";
import { useAuth } from "@/context/AuthContext";
import { useColors } from "@/hooks/useColors";

const key = () => `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
export function MediaPackMessage({ packId, mine }: { packId: string; mine: boolean }) {
  const colors = useColors(); const { user } = useAuth(); const qc = useQueryClient(); const [gallery, setGallery] = useState(false); const [error, setError] = useState<string | null>(null);
  const packQuery = (useGetMediaPack as any)(packId, { query: { refetchOnWindowFocus: false } } as any);
  const unlock = useUnlockMediaPack();
  const pack = ((packQuery.data as any)?.pack ?? packQuery.data) as any;
  if (packQuery.isLoading) return <View style={[styles.card,{backgroundColor:colors.card}]}><Text style={{color:colors.mutedForeground}}>Loading media pack…</Text></View>;
  if (!pack) return <View style={[styles.card,{backgroundColor:colors.card}]}><Text style={{color:colors.mutedForeground}}>Media pack unavailable</Text></View>;
  const visible = mine || pack.unlocked || pack.isOwner;
  const unlockPack = async () => {
    setError(null);
    try {
      const result = await unlock.mutateAsync({ packId, data: { idempotencyKey: key() } } as any);
      if (user?.uid && (result as any).balance != null) qc.setQueryData(getGetCoinBalanceQueryKey({ uid: user.uid }), { balance: (result as any).balance });
      await packQuery.refetch();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not unlock this media pack.");
    }
  };
  const confirmUnlock = () => {
    Alert.alert(
      "Unlock media pack?",
      `This will deduct ${pack.price} coins from your balance. You can view these ${pack.itemCount} items again after unlocking.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: `Unlock for ${pack.price}`, onPress: () => void unlockPack() },
      ],
    );
  };
  const preview = (pack.items ?? []).find((item: any) => item.previewUrl) ?? pack.items?.[0];
  return <View style={[styles.card,{backgroundColor:colors.card,borderColor:colors.border}]}>{visible ? <><View style={styles.cardHead}><Ionicons name="images" size={18} color={colors.primary}/><Text style={[styles.name,{color:colors.foreground}]}>{pack.name}</Text></View><View style={styles.priceRow}><Text style={[styles.priceLabel,{color:colors.mutedForeground}]}>{mine ? "Sent pack" : "Unlocked"}</Text><Text style={styles.price}>🪙 {pack.price} coins</Text></View><FlatList horizontal data={pack.items ?? []} keyExtractor={(x:any)=>x.id} contentContainerStyle={{gap:8}} renderItem={({item}:any)=><TouchableOpacity onPress={()=>setGallery(true)} testID={`media-item-${item.id}`} style={styles.tile}>{item.mediaType==="image"&&item.mediaUrl?<Image source={{uri:item.mediaUrl}} style={styles.asset}/>:<View style={[styles.asset,styles.video]}><Ionicons name="videocam" size={24} color="#FFF"/></View>}</TouchableOpacity>}/></> : <><View style={styles.preview}><>{preview?.mediaType==="image"&&preview?.previewUrl?<Image source={{uri:preview.previewUrl}} style={styles.previewImage} blurRadius={28}/>:<View style={[styles.previewImage,styles.video]}><Ionicons name="images" size={28} color="#FFF"/></View>}</><View style={styles.previewShade}><Ionicons name="lock-closed" size={22} color="#FFF"/></View></View><Text style={[styles.name,{color:colors.foreground}]}>{pack.name}</Text><Text style={[styles.copy,{color:colors.mutedForeground}]}>{pack.itemCount} exclusive items</Text><View style={styles.priceRow}><Text style={[styles.priceLabel,{color:colors.mutedForeground}]}>Price</Text><Text style={styles.price}>🪙 {pack.price} coins</Text></View>{error ? <Text style={styles.error}>{error}</Text> : null}<TouchableOpacity onPress={confirmUnlock} disabled={unlock.isPending} testID={`pack-unlock-${packId}`} style={[styles.unlock,{backgroundColor:"#FFD700"}]}><Text style={styles.unlockText}>{unlock.isPending?"Unlocking…":`Unlock for ${pack.price} coins`}</Text></TouchableOpacity></>}<Modal visible={gallery} transparent animationType="fade" onRequestClose={()=>setGallery(false)}><View style={styles.gallery}><TouchableOpacity onPress={()=>setGallery(false)} style={styles.close} testID="media-gallery-close"><Ionicons name="close" size={26} color="#FFF"/></TouchableOpacity><FlatList horizontal pagingEnabled data={pack.items??[]} keyExtractor={(x:any)=>x.id} renderItem={({item}:any)=><View style={styles.full}>{item.mediaType==="image"&&item.mediaUrl?<Image source={{uri:item.mediaUrl}} style={styles.fullImage} contentFit="contain"/>:<View style={styles.videoFull}><Ionicons name="videocam" size={42} color="#FFF"/><Text style={{color:"#FFF"}}>Video</Text></View>}</View>}/></View></Modal></View>;
}
const styles=StyleSheet.create({card:{borderWidth:1,borderRadius:16,padding:13,minWidth:230,gap:8},cardHead:{flexDirection:"row",gap:7,alignItems:"center"},name:{fontFamily:"Inter_600SemiBold",fontSize:15},copy:{fontFamily:"Inter_400Regular",fontSize:13},priceRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:2},priceLabel:{fontFamily:"Inter_500Medium",fontSize:12},price:{color:"#FFD700",fontFamily:"Inter_700Bold",fontSize:14},error:{color:"#FF6B81",fontFamily:"Inter_400Regular",fontSize:12},preview:{height:118,borderRadius:12,overflow:"hidden",position:"relative"},previewImage:{width:"100%",height:"100%"},previewShade:{position:"absolute",top:0,right:0,bottom:0,left:0,alignItems:"center",justifyContent:"center",backgroundColor:"rgba(10,10,20,.18)"},unlock:{paddingVertical:10,paddingHorizontal:13,borderRadius:10,alignSelf:"flex-start"},unlockText:{color:"#15100A",fontFamily:"Inter_700Bold"},tile:{width:104,height:82,borderRadius:9,overflow:"hidden"},asset:{width:"100%",height:"100%"},video:{backgroundColor:"#292945",alignItems:"center",justifyContent:"center"},gallery:{flex:1,backgroundColor:"rgba(0,0,0,.96)",justifyContent:"center"},close:{position:"absolute",zIndex:2,right:20,top:55,padding:8},full:{width:400,flex:1,alignItems:"center",justifyContent:"center"},fullImage:{width:"100%",height:"78%"},videoFull:{alignItems:"center",gap:12}});
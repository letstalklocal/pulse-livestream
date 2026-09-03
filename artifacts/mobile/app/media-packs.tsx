import { Ionicons } from "@expo/vector-icons";
// @ts-ignore expo-file-system is added with the Expo dependency set
import { File } from "expo-file-system";
import { fetch } from "expo/fetch";
import * as ImagePicker from "expo-image-picker";
import { Image } from "expo-image";
import { useRouter, useLocalSearchParams } from "expo-router";
import React, { useState, useEffect } from "react";
import { Alert, FlatList, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
// Pack operations are generated from the API spec during the API build.
// @ts-ignore generated media-pack hooks
import { useCreateMediaPack, useDeleteMediaPack, useGetMediaPacks, useRequestMediaPackUpload, useSendMediaPack } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";

type PickedAsset = ImagePicker.ImagePickerAsset;
const nativeOnly = () => Platform.OS === "web";

export default function MediaPacksScreen() {
  const colors = useColors(); const insets = useSafeAreaInsets(); const router = useRouter();
  const { create: createParam, recipientId } = useLocalSearchParams<{ create?: string; recipientId?: string }>();
  const packsQuery = useGetMediaPacks({ query: { refetchOnWindowFocus: false } } as any);
  const create = useCreateMediaPack(); const remove = useDeleteMediaPack(); const requestUpload = useRequestMediaPackUpload();
  const sendPack = useSendMediaPack();
  const [visible, setVisible] = useState(false); const [name, setName] = useState(""); const [price, setPrice] = useState("");
  const [assets, setAssets] = useState<PickedAsset[]>([]); const [saving, setSaving] = useState(false); const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (createParam === "1") setVisible(true);
  }, [createParam]);
  const choose = async () => {
    if (nativeOnly()) { Alert.alert("Native app required", "Selecting and uploading media packs is available in the iOS or Android app."); return; }
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) { Alert.alert("Permission needed", "Allow photo library access to add media. You can enable it in Settings."); return; }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.All, allowsMultipleSelection: true, selectionLimit: 20, quality: 0.85 });
    if (!result.canceled) setAssets((old) => [...old, ...result.assets].slice(0, 20));
  };
  const save = async () => {
    const coinPrice = Number(price);
    if (!name.trim() || !Number.isInteger(coinPrice) || coinPrice <= 0 || assets.length < 1) { setError("Add a name, a positive whole-number coin price, and between 1 and 20 items."); return; }
    setSaving(true); setError(null);
    try {
      const items = [];
      for (let i = 0; i < assets.length; i += 1) {
        const asset = assets[i]!;
        const upload = await requestUpload.mutateAsync({ data: { contentType: asset.mimeType ?? (asset.type === "video" ? "video/mp4" : "image/jpeg") } } as any);
        const response = await fetch((upload as any).uploadUrl, { method: "PUT", headers: { "Content-Type": asset.mimeType ?? "application/octet-stream" }, body: new File(asset.uri) as any });
        if (!response.ok) throw new Error(`Upload ${i + 1} failed. Please try again.`);
        items.push({ mediaType: asset.type === "video" ? "video" as const : "image" as const, contentType: asset.mimeType ?? "image/jpeg", width: asset.width, height: asset.height, durationMs: asset.duration ?? undefined, objectPath: (upload as any).objectPath });
      }
      const createdPack = await create.mutateAsync({ data: { name: name.trim(), price: coinPrice, items } });
      await packsQuery.refetch();

      if (recipientId) {
        const createdPackId = (createdPack as any)?.pack?.id ?? (createdPack as any)?.id;
        await sendPack.mutateAsync({
          packId: createdPackId,
          data: {
            recipientId: Number(recipientId),
            idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
          } as any
        });
        setVisible(false);
        router.back();
        return;
      }

      setVisible(false); setName(""); setPrice(""); setAssets([]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Your pack could not be created. Check your connection and try again."); }
    finally { setSaving(false); }
  };
  const packs = ((packsQuery.data as any)?.packs ?? packsQuery.data ?? []) as any[];
  return <View style={[styles.page, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
    <View style={styles.header}><TouchableOpacity onPress={() => router.back()}><Ionicons name="chevron-back" size={25} color={colors.foreground}/></TouchableOpacity><Text style={[styles.title,{color:colors.foreground}]}>Media Packs</Text><TouchableOpacity onPress={() => setVisible(true)} testID="pack-create-open"><Ionicons name="add-circle" size={28} color={colors.primary}/></TouchableOpacity></View>
    <Text style={[styles.subtitle,{color:colors.mutedForeground}]}>Sell a reusable set of photos and videos in DMs.</Text>
    <FlatList data={packs} keyExtractor={(p) => p.id} contentContainerStyle={styles.list} renderItem={({item}) => <View style={[styles.pack,{backgroundColor:colors.card,borderColor:colors.border}]}><View style={[styles.packIcon,{backgroundColor:"rgba(255,25,102,.14)"}]}><Ionicons name="images" size={21} color={colors.primary}/></View><View style={{flex:1}}><Text style={[styles.packName,{color:colors.foreground}]}>{item.name}</Text><Text style={[styles.meta,{color:colors.mutedForeground}]}>{item.itemCount} items · 🪙 {item.price}</Text></View><TouchableOpacity onPress={() => remove.mutate({ packId: item.id } as any)} testID={`pack-delete-${item.id}`}><Ionicons name="trash-outline" size={19} color={colors.mutedForeground}/></TouchableOpacity></View>} ListEmptyComponent={<View style={styles.empty}><Ionicons name="albums-outline" size={48} color={colors.mutedForeground}/><Text style={[styles.emptyTitle,{color:colors.foreground}]}>Your vault is empty</Text><Text style={[styles.emptyCopy,{color:colors.mutedForeground}]}>Create a pack once, then share it with anyone.</Text><TouchableOpacity onPress={() => setVisible(true)} style={[styles.create,{backgroundColor:colors.primary}]} testID="pack-create-empty"><Text style={styles.createText}>Create a pack</Text></TouchableOpacity></View>}/>
    <Modal visible={visible} animationType="slide" onRequestClose={() => setVisible(false)}><View style={[styles.modal,{backgroundColor:colors.background,paddingTop:insets.top+12}]}><View style={styles.header}><Text style={[styles.title,{color:colors.foreground}]}>New pack</Text><TouchableOpacity onPress={() => setVisible(false)}><Ionicons name="close" size={26} color={colors.foreground}/></TouchableOpacity></View><ScrollView contentContainerStyle={styles.form}><TextInput value={name} onChangeText={setName} placeholder="Pack name" placeholderTextColor={colors.mutedForeground} style={[styles.input,{color:colors.foreground,borderColor:colors.border,backgroundColor:colors.card}]}/><TextInput value={price} onChangeText={setPrice} placeholder="Coin price" keyboardType="number-pad" placeholderTextColor={colors.mutedForeground} style={[styles.input,{color:colors.foreground,borderColor:colors.border,backgroundColor:colors.card}]}/><TouchableOpacity onPress={choose} style={[styles.addMedia,{borderColor:colors.primary}]} testID="pack-media-picker"><Ionicons name="add" size={23} color={colors.primary}/><Text style={[styles.addMediaText,{color:colors.primary}]}>Add photos or videos · {assets.length}/20</Text></TouchableOpacity><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbs}>{assets.map((asset,index)=><View key={`${asset.uri}-${index}`} style={styles.thumb}><Image source={{uri:asset.uri}} style={styles.image}/>{asset.type==="video"&&<Ionicons name="videocam" size={16} color="#FFF" style={styles.video}/>}<TouchableOpacity onPress={()=>setAssets((a)=>a.filter((_,i)=>i!==index))} style={styles.remove} testID={`pack-media-remove-${index}`}><Ionicons name="close" size={13} color="#FFF"/></TouchableOpacity></View>)}</ScrollView>{error&&<Text style={styles.error}>{error}</Text>}<TouchableOpacity onPress={save} disabled={saving} style={[styles.create,{backgroundColor:saving?colors.muted:colors.primary}]} testID="pack-create-submit"><Text style={styles.createText}>{saving ? `Uploading ${assets.length} item${assets.length===1?"":"s"}…` : "Create media pack"}</Text></TouchableOpacity></ScrollView></View></Modal>
  </View>;
}
const styles=StyleSheet.create({page:{flex:1},header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingBottom:12},title:{fontSize:25,fontFamily:"Inter_700Bold"},subtitle:{fontSize:14,fontFamily:"Inter_400Regular",paddingHorizontal:20,marginBottom:12},list:{padding:16,gap:10,flexGrow:1},pack:{borderWidth:1,borderRadius:16,padding:14,flexDirection:"row",alignItems:"center",gap:12},packIcon:{width:44,height:44,borderRadius:13,alignItems:"center",justifyContent:"center"},packName:{fontSize:16,fontFamily:"Inter_600SemiBold"},meta:{fontSize:13,fontFamily:"Inter_400Regular",marginTop:3},empty:{alignItems:"center",justifyContent:"center",flex:1,gap:9,paddingBottom:70},emptyTitle:{fontSize:19,fontFamily:"Inter_700Bold",marginTop:7},emptyCopy:{fontSize:14,fontFamily:"Inter_400Regular",textAlign:"center"},create:{alignSelf:"center",paddingHorizontal:22,paddingVertical:12,borderRadius:24,marginTop:12},createText:{color:"#FFF",fontFamily:"Inter_700Bold",fontSize:14},modal:{flex:1},form:{padding:20,gap:12,paddingBottom:50},input:{borderWidth:1,borderRadius:13,padding:14,fontSize:16,fontFamily:"Inter_400Regular"},addMedia:{borderWidth:1,borderStyle:"dashed",borderRadius:13,padding:17,alignItems:"center",flexDirection:"row",justifyContent:"center",gap:7},addMediaText:{fontFamily:"Inter_600SemiBold"},thumbs:{gap:10},thumb:{width:82,height:82,borderRadius:10,overflow:"hidden",position:"relative"},image:{width:"100%",height:"100%"},remove:{position:"absolute",right:4,top:4,width:20,height:20,borderRadius:10,backgroundColor:"rgba(0,0,0,.7)",alignItems:"center",justifyContent:"center"},video:{position:"absolute",left:6,bottom:6},error:{color:"#FF4444",fontFamily:"Inter_400Regular",fontSize:13,textAlign:"center"}});
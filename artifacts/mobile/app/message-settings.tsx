import React from "react";
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { useAuth } from "@clerk/expo";
import { Redirect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useMessageSettings } from "@/hooks/useMessageSettings";
const rows=[
 {key:"lastSeenOnline",title:"Last Seen & Online",description:"Show others when you’re online and when you were last active."},
 {key:"readReceipts",title:"Read Receipts",description:"Let others see when you’ve read their messages."},
 {key:"giftToOpenChat",title:"Send Gift to Chat",description:"People you don’t follow must send you a Rose to start a new chat. Existing chats stay open."},
] as const;
export default function MessageSettingsScreen(){
 const colors=useColors();const router=useRouter();const insets=useSafeAreaInsets();const {isLoaded,userId}=useAuth();const settings=useMessageSettings();
 if(!isLoaded)return <ActivityIndicator color={colors.primary}/>;
 if(!userId)return <Redirect href="/(auth)/sign-in"/>;
 return <View style={{flex:1,backgroundColor:colors.background}}>
  <View style={[styles.header,{paddingTop:(Platform.OS==="web"?67:insets.top)+10,borderColor:colors.border}]}><TouchableOpacity accessibilityLabel="Back" onPress={()=>router.back()}><Ionicons name="chevron-back" size={24} color={colors.foreground}/></TouchableOpacity><Text style={[styles.title,{color:colors.foreground}]}>Messages Settings</Text><View style={{width:24}}/></View>
  <ScrollView contentContainerStyle={{padding:20,paddingBottom:insets.bottom+32}}>
   {settings.isPending&&<ActivityIndicator color={colors.primary}/>}
   {settings.isError&&<TouchableOpacity onPress={()=>void settings.refetch()}><Text style={styles.error}>Couldn’t load message settings. Tap to retry.</Text></TouchableOpacity>}
   {settings.save.isError&&<Text accessibilityRole="alert" style={styles.error}>{settings.save.error.message}</Text>}
   {rows.map(row=><View key={row.key} style={[styles.row,{backgroundColor:colors.card,borderColor:colors.border}]}><View style={{flex:1,gap:6}}><Text style={[styles.label,{color:colors.foreground}]}>{row.title}</Text><Text style={[styles.detail,{color:colors.mutedForeground}]}>{row.description}</Text>{row.key==="giftToOpenChat"&&<Text style={{color:colors.primary,marginTop:6}}>🌹 Rose · 1 coin</Text>}</View><Switch accessibilityLabel={row.title} value={settings.data?.[row.key]??true} disabled={!settings.isSuccess||settings.save.isPending} onValueChange={value=>settings.save.mutate({[row.key]:value})} trackColor={{false:colors.border,true:colors.primary}} thumbColor="#FFF"/></View>)}
   {settings.save.isPending&&<Text accessibilityLiveRegion="polite" style={{color:colors.mutedForeground}}>Saving…</Text>}
  </ScrollView>
 </View>;
}
const styles=StyleSheet.create({header:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:20,paddingBottom:16,borderBottomWidth:1},title:{fontSize:21,fontFamily:"Inter_700Bold"},row:{flexDirection:"row",alignItems:"center",gap:16,padding:18,borderWidth:1,borderRadius:16,marginBottom:14},label:{fontSize:16,fontFamily:"Inter_500Medium"},detail:{fontSize:13,lineHeight:20},error:{color:"#FF4D67",marginBottom:14}});

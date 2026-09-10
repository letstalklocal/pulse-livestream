import { useAuth } from "@clerk/expo";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
export type MessageSettings = { lastSeenOnline: boolean; readReceipts: boolean; giftToOpenChat: boolean; requiredGiftId: string };
const base=process.env.EXPO_PUBLIC_DOMAIN?`https://${process.env.EXPO_PUBLIC_DOMAIN}`:"";
export function useMessageSettings() {
 const {userId,getToken}=useAuth();const client=useQueryClient();const key=["message-settings",userId];
 const request=async(patch?:Partial<MessageSettings>):Promise<MessageSettings>=>{
  const token=await getToken();if(!token)throw new Error("Please sign in again.");
  const res=await fetch(`${base}/api/message-settings`,{method:patch?"PATCH":"GET",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},...(patch?{body:JSON.stringify(patch)}:{})});
  if(!res.ok)throw new Error(patch?"Couldn’t save message settings. Please try again.":"Couldn’t load message settings.");return res.json();
 };
 const query=useQuery({queryKey:key,enabled:!!userId,queryFn:()=>request()});
 const save=useMutation({mutationFn:request,onSuccess:async(data)=>{await client.cancelQueries({queryKey:key});client.setQueryData(key,data);void client.invalidateQueries({queryKey:["message-peer"]});}});
 return {...query,save};
}

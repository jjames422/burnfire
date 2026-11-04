"use client";
import { Text, useTranslation } from "@/components/i18n/LanguageProvider";


import { useEffect, useState, type SubmitEvent } from "react";
import { api } from "@/lib/api/client";
import type { ChannelMessagesPayload, SearchResultRow } from "@/lib/api/types";

type UtilityMode = "search" | "pins";
type UtilityMessage = { id:string; body:string; created_at:string; identity_label:string };

export function ChannelUtilityPanel({ channelId, mode, onClose, onJump }:{ channelId:string; mode:UtilityMode; onClose:()=>void; onJump:(messageId:string)=>void }) {
  const { t, locale } = useTranslation();
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<UtilityMessage[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(mode!=="pins")return;
    setLoading(true);setError(null);
    api<ChannelMessagesPayload>(`/api/channels/${channelId}/messages`).then(({data,error:loadError})=>{
      if(loadError||!data){setError(loadError??"Pinned messages could not be loaded.");setResults([]);}
      else {const ids=new Set(data.pinned_message_ids);setResults(data.messages.filter((message)=>ids.has(message.id)));}
      setLoading(false);
    });
  },[channelId,mode]);

  async function search(event:SubmitEvent<HTMLFormElement>){
    event.preventDefault();if(query.trim().length<2)return;
    setLoading(true);setError(null);
    const {data,error:searchError}=await api<{results:SearchResultRow[]}>(`/api/channels/${channelId}/search?q=${encodeURIComponent(query.trim())}`);
    setResults(data?.results??[]);setError(searchError);setLoading(false);
  }

  return <aside className="utility-panel">
    <header><div><span className="eyebrow"><Text>{"Channel tools"}</Text></span><h3>{mode==="search"?t("Search messages"):t("Pinned messages")}</h3></div><button onClick={onClose}>×</button></header>
    {mode==="search"&&<form onSubmit={search} className="utility-search"><input autoFocus value={query} onChange={(event)=>setQuery(event.target.value)} placeholder={t("Search this channel")}/><button disabled={loading||query.trim().length<2}><Text>{"Search"}</Text></button></form>}
    <div className="utility-results">
      {loading&&<p className="utility-empty"><Text>{"Scanning transmissions…"}</Text></p>}
      {error&&<p className="utility-error">{t(error)}</p>}
      {!loading&&!error&&results.length===0&&<p className="utility-empty">{mode==="search"?t("Enter at least two characters to search."):t("No messages are pinned in this channel.")}</p>}
      {results.map((message)=><button key={message.id} onClick={()=>onJump(message.id)} className="utility-result"><span><strong>{message.identity_label}</strong><time>{new Date(message.created_at).toLocaleDateString(locale)}</time></span><p>{message.body}</p></button>)}
    </div>
  </aside>;
}

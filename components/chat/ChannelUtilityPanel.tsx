"use client";

import { useEffect, useState, type SubmitEvent } from "react";
import { supabase } from "@/lib/supabase/client";

type UtilityMode = "search" | "pins";
type UtilityMessage = { id:string; body:string; created_at:string; identity_label:string };

export function ChannelUtilityPanel({ channelId, mode, onClose, onJump }:{ channelId:string; mode:UtilityMode; onClose:()=>void; onJump:(messageId:string)=>void }) {
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<UtilityMessage[]>([]);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState<string|null>(null);

  useEffect(()=>{
    if(mode!=="pins"||!supabase)return;
    const client=supabase;
    setLoading(true);setError(null);
    Promise.all([
      client.from("pinned_messages").select("message_id").eq("channel_id",channelId),
      client.rpc("get_channel_messages",{p_channel_id:channelId,p_limit:100}),
    ]).then(([pins,messages])=>{
      if(pins.error||messages.error){setError(pins.error?.message??messages.error?.message??"Pinned messages could not be loaded.");setResults([]);}
      else {const ids=new Set((pins.data??[]).map((pin)=>pin.message_id));setResults((messages.data??[]).filter((message)=>ids.has(message.id)));}
      setLoading(false);
    });
  },[channelId,mode]);

  async function search(event:SubmitEvent<HTMLFormElement>){
    event.preventDefault();if(!supabase||query.trim().length<2)return;
    setLoading(true);setError(null);
    const {data,error:searchError}=await supabase.rpc("search_channel_messages",{p_channel_id:channelId,p_query:query.trim()});
    setResults(data??[]);setError(searchError?.message??null);setLoading(false);
  }

  return <aside className="utility-panel">
    <header><div><span className="eyebrow">Channel tools</span><h3>{mode==="search"?"Search messages":"Pinned messages"}</h3></div><button onClick={onClose}>×</button></header>
    {mode==="search"&&<form onSubmit={search} className="utility-search"><input autoFocus value={query} onChange={(event)=>setQuery(event.target.value)} placeholder="Search this channel"/><button disabled={loading||query.trim().length<2}>Search</button></form>}
    <div className="utility-results">
      {loading&&<p className="utility-empty">Scanning transmissions…</p>}
      {error&&<p className="utility-error">{error}</p>}
      {!loading&&!error&&results.length===0&&<p className="utility-empty">{mode==="search"?"Enter at least two characters to search.":"No messages are pinned in this channel."}</p>}
      {results.map((message)=><button key={message.id} onClick={()=>onJump(message.id)} className="utility-result"><span><strong>{message.identity_label}</strong><time>{new Date(message.created_at).toLocaleDateString()}</time></span><p>{message.body}</p></button>)}
    </div>
  </aside>;
}
